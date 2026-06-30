import { getConfig } from "@/lib/runtime-config";

export type ComfyCloudMediaKind = "image" | "video";

export type ComfyCloudInput = {
  kind: ComfyCloudMediaKind;
  prompt: string;
  negativePrompt?: string;
  model: string;
  width?: number;
  height?: number;
  durationSec?: number;
  fps?: number;
  aspectRatio?: string;
  timeoutMs?: number;
};

export type ComfyCloudOutput = {
  url: string;
  filename: string;
  mimeType: string;
  kind: ComfyCloudMediaKind;
  width?: number;
  height?: number;
};

export type ComfyCloudResult =
  | {
      ok: true;
      provider: "comfy_cloud";
      promptId: string;
      outputs: ComfyCloudOutput[];
      metadata: Record<string, unknown>;
    }
  | {
      ok: false;
      provider: "comfy_cloud";
      code: "PROVIDER_NOT_CONFIGURED" | "OUT_OF_CREDITS" | "QUEUE_FULL" | "WORKFLOW_FAILED" | "NETWORK_ERROR" | "PROVIDER_UNAVAILABLE" | "PROVIDER_TIMEOUT" | "NO_OUTPUT";
      message: string;
      status?: number;
      metadata?: Record<string, unknown>;
    };

type OutputFile = {
  filename?: string;
  subfolder?: string;
  type?: string;
  width?: number;
  height?: number;
};

async function comfyConfig() {
  return {
    apiKey: await getConfig("COMFY_CLOUD_API_KEY"),
    baseUrl: (await getConfig("COMFY_CLOUD_BASE_URL", "https://cloud.comfy.org") || "https://cloud.comfy.org").replace(/\/$/, ""),
    imageWorkflow: await getConfig("COMFY_CLOUD_IMAGE_WORKFLOW"),
    imageWorkflowPath: await getConfig("COMFY_CLOUD_IMAGE_WORKFLOW_PATH"),
    videoWorkflow: await getConfig("COMFY_CLOUD_VIDEO_WORKFLOW"),
    videoWorkflowPath: await getConfig("COMFY_CLOUD_VIDEO_WORKFLOW_PATH"),
    promptNode: await getConfig("COMFY_CLOUD_PROMPT_NODE"),
    promptInput: await getConfig("COMFY_CLOUD_PROMPT_INPUT", "text"),
    negativeNode: await getConfig("COMFY_CLOUD_NEGATIVE_NODE"),
    negativeInput: await getConfig("COMFY_CLOUD_NEGATIVE_INPUT", "text"),
    widthNode: await getConfig("COMFY_CLOUD_WIDTH_NODE"),
    widthInput: await getConfig("COMFY_CLOUD_WIDTH_INPUT", "width"),
    heightNode: await getConfig("COMFY_CLOUD_HEIGHT_NODE"),
    heightInput: await getConfig("COMFY_CLOUD_HEIGHT_INPUT", "height"),
    seedNode: await getConfig("COMFY_CLOUD_SEED_NODE"),
    seedInput: await getConfig("COMFY_CLOUD_SEED_INPUT", "seed"),
  };
}

async function readWorkflow(kind: ComfyCloudMediaKind) {
  const config = await comfyConfig();
  const workflowValue = kind === "image" ? config.imageWorkflow : config.videoWorkflow;
  const workflowPath = kind === "image" ? config.imageWorkflowPath : config.videoWorkflowPath;
  if (workflowValue?.trim()) return workflowValue.trim();
  if (workflowPath?.trim()) {
    const fs = await import("node:fs/promises");
    return fs.readFile(workflowPath.trim(), "utf8");
  }
  return "";
}

function cleanJsonString(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", "\\n");
}

function replaceWorkflowTokens(value: unknown, input: ComfyCloudInput, seed: number): unknown {
  if (typeof value === "string") {
    return value
      .replaceAll("{{PROMPT}}", cleanJsonString(input.prompt))
      .replaceAll("{{NEGATIVE_PROMPT}}", cleanJsonString(input.negativePrompt || ""))
      .replaceAll("{{MODEL}}", cleanJsonString(input.model))
      .replaceAll("{{WIDTH}}", String(input.width || 1024))
      .replaceAll("{{HEIGHT}}", String(input.height || 1024))
      .replaceAll("{{SEED}}", String(seed))
      .replaceAll("{{DURATION}}", String(input.durationSec || 5))
      .replaceAll("{{FPS}}", String(input.fps || 24))
      .replaceAll("{{ASPECT_RATIO}}", cleanJsonString(input.aspectRatio || "1:1"));
  }
  if (Array.isArray(value)) return value.map((item) => replaceWorkflowTokens(item, input, seed));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceWorkflowTokens(item, input, seed)]));
  }
  return value;
}

function setNodeInput(workflow: Record<string, unknown>, nodeId: string | undefined, inputName: string | undefined, value: unknown) {
  if (!nodeId || !inputName) return;
  const node = workflow[nodeId] as { inputs?: Record<string, unknown> } | undefined;
  if (!node?.inputs) return;
  node.inputs[inputName] = value;
}

async function buildWorkflow(input: ComfyCloudInput) {
  const raw = await readWorkflow(input.kind);
  if (!raw.trim()) {
    return {
      ok: false as const,
      message: input.kind === "image"
        ? "Comfy Cloud image workflow is not configured. Add COMFY_CLOUD_IMAGE_WORKFLOW or COMFY_CLOUD_IMAGE_WORKFLOW_PATH."
        : "Comfy Cloud video workflow is not configured. Add COMFY_CLOUD_VIDEO_WORKFLOW or COMFY_CLOUD_VIDEO_WORKFLOW_PATH.",
    };
  }
  const seed = Math.floor(Math.random() * 1_000_000_000);
  try {
    const workflow = replaceWorkflowTokens(JSON.parse(raw), input, seed) as Record<string, unknown>;
    const config = await comfyConfig();
    setNodeInput(workflow, config.promptNode, config.promptInput, input.prompt);
    setNodeInput(workflow, config.negativeNode, config.negativeInput, input.negativePrompt || "");
    setNodeInput(workflow, config.widthNode, config.widthInput, input.width || 1024);
    setNodeInput(workflow, config.heightNode, config.heightInput, input.height || 1024);
    setNodeInput(workflow, config.seedNode, config.seedInput, seed);
    return { ok: true as const, workflow, seed };
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? `Comfy Cloud workflow JSON is invalid: ${error.message}` : "Comfy Cloud workflow JSON is invalid.",
    };
  }
}

function mapProviderError(status: number, body: string): ComfyCloudResult {
  if (status === 401 || status === 403) {
    return { ok: false, provider: "comfy_cloud", code: "PROVIDER_UNAVAILABLE", message: "Comfy Cloud API key is invalid or unauthorized.", status };
  }
  if (status === 402) {
    return { ok: false, provider: "comfy_cloud", code: "OUT_OF_CREDITS", message: "Comfy Cloud is out of credits. Add credits or choose another provider.", status };
  }
  if (status === 429) {
    return { ok: false, provider: "comfy_cloud", code: "QUEUE_FULL", message: "Comfy Cloud queue is full or subscription is inactive. Retry shortly.", status };
  }
  return {
    ok: false,
    provider: "comfy_cloud",
    code: "WORKFLOW_FAILED",
    message: body.slice(0, 240) || `Comfy Cloud request failed with HTTP ${status}.`,
    status,
  };
}

function extractOutputFiles(outputs: Record<string, unknown>) {
  const files: OutputFile[] = [];
  for (const output of Object.values(outputs)) {
    const record = output as { images?: OutputFile[]; videos?: OutputFile[]; gifs?: OutputFile[]; animated?: OutputFile[] };
    files.push(...(record.images || []), ...(record.videos || []), ...(record.gifs || []), ...(record.animated || []));
  }
  return files.filter((file) => file.filename);
}

async function waitForOutputs(baseUrl: string, apiKey: string, promptId: string, timeoutMs: number) {
  const wsUrl = `${baseUrl.replace(/^http/, "ws")}/ws?clientId=${crypto.randomUUID()}&token=${encodeURIComponent(apiKey)}`;
  const outputs: Record<string, unknown> = {};
  return await new Promise<Record<string, unknown>>((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error(`Comfy Cloud job did not complete within ${Math.round(timeoutMs / 1000)}s.`));
    }, timeoutMs);

    ws.onmessage = (event) => {
      if (typeof event.data !== "string") return;
      const data = JSON.parse(event.data) as { type?: string; data?: Record<string, unknown> };
      const message = data.data || {};
      if (message.prompt_id && message.prompt_id !== promptId) return;
      if (data.type === "executed" && message.output && message.node) {
        outputs[String(message.node)] = message.output;
      }
      if (data.type === "execution_success") {
        clearTimeout(timer);
        ws.close();
        resolve(outputs);
      }
      if (data.type === "execution_error") {
        clearTimeout(timer);
        ws.close();
        reject(new Error(String(message.exception_message || "Comfy Cloud workflow failed.")));
      }
    };
    ws.onerror = () => {
      clearTimeout(timer);
      reject(new Error("Unable to connect to Comfy Cloud realtime progress."));
    };
  });
}

async function outputToDataUrl(baseUrl: string, apiKey: string, file: OutputFile, kind: ComfyCloudMediaKind): Promise<ComfyCloudOutput> {
  const params = new URLSearchParams({
    filename: file.filename || "",
    subfolder: file.subfolder || "",
    type: file.type || "output",
  });
  const redirect = await fetch(`${baseUrl}/api/view?${params.toString()}`, {
    headers: { "X-API-Key": apiKey },
    redirect: "manual",
  });
  const signedUrl = redirect.status >= 300 && redirect.status < 400 ? redirect.headers.get("location") : `${baseUrl}/api/view?${params.toString()}`;
  if (!signedUrl) throw new Error("Comfy Cloud output URL was not returned.");
  const fileResponse = await fetch(signedUrl, redirect.status >= 300 ? {} : { headers: { "X-API-Key": apiKey } });
  if (!fileResponse.ok) throw new Error(`Comfy Cloud output download failed with HTTP ${fileResponse.status}.`);
  const mimeType = fileResponse.headers.get("content-type")?.split(";")[0] || (kind === "video" ? "video/mp4" : "image/png");
  const buffer = Buffer.from(await fileResponse.arrayBuffer());
  return {
    url: `data:${mimeType};base64,${buffer.toString("base64")}`,
    filename: file.filename || `meldex-${kind}`,
    mimeType,
    kind,
    width: file.width,
    height: file.height,
  };
}

export async function getComfyCloudStatus() {
  const config = await comfyConfig();
  const hasImageWorkflow = Boolean((config.imageWorkflow || config.imageWorkflowPath)?.trim());
  const hasVideoWorkflow = Boolean((config.videoWorkflow || config.videoWorkflowPath)?.trim());
  if (!config.apiKey) {
    return {
      configured: false,
      ready: false,
      status: "missing" as const,
      message: "Comfy Cloud API key missing. Add COMFY_CLOUD_API_KEY in Master settings or env.",
      imageReady: false,
      videoReady: false,
    };
  }
  const apiKey = config.apiKey;
  try {
    const response = await fetch(`${config.baseUrl}/api/object_info`, {
      headers: { "X-API-Key": apiKey },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      const failure = mapProviderError(response.status, await response.text().catch(() => ""));
      return {
        configured: true,
        ready: false,
        status: "failed" as const,
        message: failure.ok ? "Comfy Cloud health check failed." : failure.message,
        imageReady: hasImageWorkflow,
        videoReady: hasVideoWorkflow,
      };
    }
    return {
      configured: true,
      ready: hasImageWorkflow || hasVideoWorkflow,
      status: hasImageWorkflow || hasVideoWorkflow ? "ready" as const : "missing" as const,
      message: hasImageWorkflow || hasVideoWorkflow
        ? "Comfy Cloud is reachable. Configured workflows can run."
        : "Comfy Cloud API key works. Add image/video workflow JSON to enable generation.",
      imageReady: hasImageWorkflow,
      videoReady: hasVideoWorkflow,
    };
  } catch {
    return {
      configured: true,
      ready: false,
      status: "failed" as const,
      message: "Comfy Cloud is not reachable from this server.",
      imageReady: hasImageWorkflow,
      videoReady: hasVideoWorkflow,
    };
  }
}

export async function runComfyCloudGeneration(input: ComfyCloudInput): Promise<ComfyCloudResult> {
  const config = await comfyConfig();
  if (!config.apiKey) {
    return {
      ok: false,
      provider: "comfy_cloud",
      code: "PROVIDER_NOT_CONFIGURED",
      message: "Comfy Cloud API key missing. Add COMFY_CLOUD_API_KEY in Master settings or env.",
    };
  }
  const apiKey = config.apiKey;
  const built = await buildWorkflow(input);
  if (!built.ok) {
    return {
      ok: false,
      provider: "comfy_cloud",
      code: "PROVIDER_NOT_CONFIGURED",
      message: built.message,
    };
  }

  const submit = await fetch(`${config.baseUrl}/api/prompt`, {
    method: "POST",
    headers: {
      "X-API-Key": config.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: built.workflow,
      extra_data: { api_key_comfy_org: config.apiKey },
    }),
    signal: AbortSignal.timeout(30000),
  }).catch((error) => ({ ok: false, status: 0, text: async () => error instanceof Error ? error.message : "Comfy Cloud network error" } as Response));

  if (!submit.ok) return mapProviderError(submit.status, await submit.text().catch(() => ""));
  const submitData = await submit.json().catch(() => ({})) as { prompt_id?: string };
  const promptId = submitData.prompt_id || "";
  if (!promptId) {
    return {
      ok: false,
      provider: "comfy_cloud",
      code: "WORKFLOW_FAILED",
      message: "Comfy Cloud did not return a prompt id.",
      metadata: submitData as Record<string, unknown>,
    };
  }

  try {
    const outputs = await waitForOutputs(config.baseUrl, config.apiKey, promptId, input.timeoutMs || (input.kind === "video" ? 900000 : 300000));
    const files = extractOutputFiles(outputs);
    if (!files.length) {
      return {
        ok: false,
        provider: "comfy_cloud",
        code: "NO_OUTPUT",
        message: "Comfy Cloud completed but returned no downloadable output.",
        metadata: { promptId, outputs },
      };
    }
      const downloaded = await Promise.all(files.slice(0, 4).map((file) => outputToDataUrl(config.baseUrl, apiKey, file, input.kind)));
    return {
      ok: true,
      provider: "comfy_cloud",
      promptId,
      outputs: downloaded,
      metadata: { promptId, seed: built.seed, outputs },
    };
  } catch (error) {
    return {
      ok: false,
      provider: "comfy_cloud",
      code: error instanceof Error && error.message.includes("complete within") ? "PROVIDER_TIMEOUT" : "WORKFLOW_FAILED",
      message: error instanceof Error ? error.message : "Comfy Cloud workflow failed.",
      metadata: { promptId },
    };
  }
}
