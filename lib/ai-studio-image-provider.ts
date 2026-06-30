import { getConfig } from "@/lib/runtime-config";
import type { ImagePromptPlan, ImageReferenceSummary, ImageStudioSettings } from "@/lib/ai-studio-image";
import { getComfyCloudStatus, runComfyCloudGeneration } from "@/lib/ai-studio-comfy-cloud";

export type ImageProviderKey =
  | "comfy_cloud_flux_schnell"
  | "fal_flux_schnell"
  | "fal_flux_subject"
  | "local_comfyui_flux_schnell"
  | "local_comfyui_sdxl"
  | "comfyui_pulid_future"
  | "comfyui_ipadapter_future";

export type ImageProviderStatus = {
  key: ImageProviderKey;
  name: string;
  configured: boolean;
  status: "ready" | "missing" | "future";
  message: string;
};

export type ImageGenerationOutput = {
  url: string;
  width?: number;
  height?: number;
  contentType?: string;
  seed?: string | number | null;
};

type ProviderFailureCode =
  | "PROVIDER_NOT_CONFIGURED"
  | "PROVIDER_ERROR"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_EMPTY_OUTPUT";

export type ImageGenerationRequest = {
  prompt: string;
  negativePrompt: string;
  settings: ImageStudioSettings;
  references: Array<ImageReferenceSummary & { dataUrl?: string }>;
  plan: ImagePromptPlan;
};

const FAL_ENDPOINTS: Record<"text" | "reference", string> = {
  text: "fal-ai/flux/schnell",
  reference: "fal-ai/flux-subject",
};

async function falKey() {
  return await getConfig("FAL_KEY") || await getConfig("FAL_API_KEY") || process.env.FAL_KEY || process.env.FAL_API_KEY || "";
}

async function comfyBaseUrl() {
  return (await getConfig("COMFYUI_BASE_URL") || process.env.COMFYUI_BASE_URL || "").replace(/\/$/, "");
}

async function comfySdxlWorkflowPath() {
  return await getConfig("STUDIO_SDXL_WORKFLOW") || process.env.STUDIO_SDXL_WORKFLOW || "";
}

async function readLocalTextFile(filePath: string) {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const normalized = path.resolve(filePath);
  return fs.readFile(normalized, "utf8");
}

async function getComfyStatus() {
  const baseUrl = await comfyBaseUrl();
  const workflowPath = await comfySdxlWorkflowPath();
  if (!baseUrl) {
    return { configured: false, running: false, workflowConfigured: Boolean(workflowPath), message: "Set COMFYUI_BASE_URL to enable local ComfyUI image generation." };
  }
  try {
    const response = await fetch(`${baseUrl}/system_stats`, { cache: "no-store", signal: AbortSignal.timeout(1500) });
    return {
      configured: true,
      running: response.ok,
      workflowConfigured: Boolean(workflowPath),
      message: response.ok
        ? (workflowPath ? "Local ComfyUI is running with SDXL Turbo low-memory mode." : "Local ComfyUI is running; set STUDIO_SDXL_WORKFLOW to enable SDXL Turbo submission.")
        : `Local ComfyUI health check returned ${response.status}.`,
    };
  } catch {
    return {
      configured: true,
      running: false,
      workflowConfigured: Boolean(workflowPath),
      message: "Local ComfyUI is configured but not reachable.",
    };
  }
}

function imageSize(settings: ImageStudioSettings) {
  const base = settings.size || 1024;
  const ratio = settings.aspectRatio;
  const snap = (value: number) => Math.max(64, Math.round(value / 8) * 8);
  if (ratio === "16:9") return { width: snap(base), height: snap(base * 9 / 16) };
  if (ratio === "4:3") return { width: snap(base), height: snap(base * 3 / 4) };
  if (ratio === "3:4") return { width: snap(base * 3 / 4), height: snap(base) };
  if (ratio === "9:16") return { width: snap(base * 9 / 16), height: snap(base) };
  if (ratio === "1:1") return { width: snap(base), height: snap(base) };
  return { width: base, height: base };
}

function hasReferences(input: ImageGenerationRequest) {
  return input.references.some((reference) => Boolean(reference.dataUrl));
}

export async function getImageProviderStatuses(): Promise<ImageProviderStatus[]> {
  const cloud = await getComfyCloudStatus();
  const comfy = await getComfyStatus();
  return [
    {
      key: "comfy_cloud_flux_schnell",
      name: "Comfy Cloud FLUX.1 Schnell",
      configured: cloud.configured,
      status: cloud.ready && cloud.imageReady ? "ready" : "missing",
      message: cloud.message,
    },
    {
      key: "fal_flux_schnell",
      name: "fal.ai FLUX Schnell",
      configured: false,
      status: "missing",
      message: "Disabled for now. Meldex is using SDXL Turbo low-memory mode.",
    },
    {
      key: "fal_flux_subject",
      name: "fal.ai FLUX Subject",
      configured: false,
      status: "missing",
      message: "Disabled for now. Reference image generation will be re-enabled after a non-FLUX provider is configured.",
    },
    {
      key: "local_comfyui_flux_schnell",
      name: "ComfyUI FLUX Schnell",
      configured: comfy.configured,
      status: "missing",
      message: "Disabled on this 8GB Mac. FLUX is installed but must not run because it exhausts unified memory.",
    },
    {
      key: "local_comfyui_sdxl",
      name: "ComfyUI SDXL Turbo",
      configured: comfy.configured,
      status: comfy.running && comfy.workflowConfigured ? "ready" : "missing",
      message: comfy.message,
    },
    {
      key: "comfyui_pulid_future",
      name: "ComfyUI PuLID",
      configured: false,
      status: "future",
      message: "Local face identity provider planned for future configuration.",
    },
    {
      key: "comfyui_ipadapter_future",
      name: "ComfyUI IP-Adapter",
      configured: false,
      status: "future",
      message: "Local reference-image provider planned for future configuration.",
    },
  ];
}

export function selectImageProvider(): ImageProviderKey {
  return "comfy_cloud_flux_schnell";
}

function falInput(input: ImageGenerationRequest) {
  const size = imageSize(input.settings);
  const reference = input.references.find((item) => item.dataUrl);
  const payload: Record<string, unknown> = {
    prompt: input.prompt,
    negative_prompt: input.negativePrompt,
    image_size: size,
    num_inference_steps: input.settings.steps,
    num_images: 1,
    enable_safety_checker: true,
    sync_mode: false,
  };
  if (input.settings.seedMode === "Custom" && input.settings.seed) payload.seed = Number(input.settings.seed) || input.settings.seed;
  if (reference?.dataUrl) {
    payload.image_url = reference.dataUrl;
    payload.subject_image_url = reference.dataUrl;
    payload.identity_strength = input.settings.referenceStrength / 100;
  }
  return payload;
}

async function submitFal(endpoint: string, input: ImageGenerationRequest) {
  const key = await falKey();
  if (!key) {
    return {
      ok: false as const,
      code: "PROVIDER_NOT_CONFIGURED",
      message: "fal.ai is not configured. Add FAL_KEY or FAL_API_KEY in Master settings/env.",
    };
  }

  const submit = await fetch(`https://queue.fal.run/${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(falInput(input)),
    signal: AbortSignal.timeout(120000),
  });
  const submitData = await submit.json().catch(() => ({}));
  if (!submit.ok) {
    return {
      ok: false as const,
      code: "PROVIDER_ERROR",
      message: typeof submitData?.detail === "string" ? submitData.detail : submitData?.error || `fal.ai request failed with ${submit.status}`,
      metadata: submitData,
    };
  }

  let responseUrl = typeof submitData.response_url === "string" ? submitData.response_url : "";
  const statusUrl = typeof submitData.status_url === "string" ? submitData.status_url : "";
  for (let attempt = 0; attempt < 90 && statusUrl; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const status = await fetch(statusUrl, { headers: { Authorization: `Key ${key}` }, cache: "no-store" });
    const statusData = await status.json().catch(() => ({}));
    if (statusData.status === "COMPLETED") {
      responseUrl = statusData.response_url || responseUrl;
      break;
    }
    if (statusData.status === "FAILED") {
      return {
        ok: false as const,
        code: "PROVIDER_ERROR",
        message: statusData.error || "fal.ai image generation failed.",
        metadata: statusData,
      };
    }
  }

  if (!responseUrl) {
    return {
      ok: false as const,
      code: "PROVIDER_TIMEOUT",
      message: "fal.ai did not return a response URL in time.",
    };
  }

  const result = await fetch(responseUrl, { headers: { Authorization: `Key ${key}` }, cache: "no-store" });
  const resultData = await result.json().catch(() => ({}));
  if (!result.ok) {
    return {
      ok: false as const,
      code: "PROVIDER_ERROR",
      message: resultData?.error || `fal.ai result fetch failed with ${result.status}`,
      metadata: resultData,
    };
  }
  const images = Array.isArray(resultData.images) ? resultData.images : [];
  const outputs: ImageGenerationOutput[] = images
    .map((image: Record<string, unknown>) => ({
      url: String(image.url || ""),
      width: typeof image.width === "number" ? image.width : undefined,
      height: typeof image.height === "number" ? image.height : undefined,
      contentType: typeof image.content_type === "string" ? image.content_type : undefined,
      seed: resultData.seed ?? null,
    }))
    .filter((image: ImageGenerationOutput) => Boolean(image.url));

  if (!outputs.length) {
    return {
      ok: false as const,
      code: "PROVIDER_EMPTY_OUTPUT",
      message: "fal.ai returned no image output.",
      metadata: resultData,
    };
  }
  return {
    ok: true as const,
    provider: endpoint === FAL_ENDPOINTS.reference || hasReferences(input) ? "fal_flux_subject" as const : "fal_flux_schnell" as const,
    outputs,
    metadata: resultData,
  };
}

async function submitComfyWorkflow(input: ImageGenerationRequest, workflowPath: string, provider: "local_comfyui_flux_schnell" | "local_comfyui_sdxl") {
  const baseUrl = await comfyBaseUrl();
  if (!baseUrl) {
    return {
      ok: false as const,
      code: "PROVIDER_NOT_CONFIGURED" as ProviderFailureCode,
      message: "Local ComfyUI is not configured. Set COMFYUI_BASE_URL.",
    };
  }
  if (!workflowPath) {
    return {
      ok: false as const,
      code: "PROVIDER_NOT_CONFIGURED" as ProviderFailureCode,
      message: provider === "local_comfyui_sdxl"
        ? "SDXL workflow is not configured. Set STUDIO_SDXL_WORKFLOW."
        : "FLUX workflow is not configured. Set STUDIO_FLUX_SCHNELL_WORKFLOW.",
    };
  }

  let workflow: Record<string, unknown>;
  try {
    const template = await readLocalTextFile(workflowPath);
    workflow = JSON.parse(
      template
        .replaceAll("{{PROMPT}}", input.prompt.replaceAll("\\", "\\\\").replaceAll('"', '\\"'))
        .replaceAll("{{NEGATIVE_PROMPT}}", input.negativePrompt.replaceAll("\\", "\\\\").replaceAll('"', '\\"')),
    ) as Record<string, unknown>;
    if (provider === "local_comfyui_sdxl") {
      const size = imageSize(input.settings);
      const maxEdge = Math.max(size.width, size.height);
      if (maxEdge > 512) {
        return {
          ok: false as const,
          code: "PROVIDER_NOT_CONFIGURED" as ProviderFailureCode,
          message: "Local SDXL Turbo on this 8GB Mac supports 320px and experimental 512px only. Choose 320 for reliable generation.",
        };
      }
      if (input.settings.steps > 2) {
        return {
          ok: false as const,
          code: "PROVIDER_NOT_CONFIGURED" as ProviderFailureCode,
          message: "Local SDXL Turbo low-memory mode supports 1-2 steps on this Mac. Higher step counts can exhaust memory.",
        };
      }
      const latent = workflow["4"] as { inputs?: Record<string, unknown> } | undefined;
      if (latent?.inputs) {
        latent.inputs.width = size.width;
        latent.inputs.height = size.height;
        latent.inputs.batch_size = 1;
      }
      const sampler = workflow["5"] as { inputs?: Record<string, unknown> } | undefined;
      if (sampler?.inputs) {
        sampler.inputs.steps = Math.max(1, Math.min(2, Number(input.settings.steps) || 1));
        sampler.inputs.seed = input.settings.seedMode === "Custom" && input.settings.seed ? Number(input.settings.seed) || input.settings.seed : Math.floor(Math.random() * 1_000_000_000);
      }
    }
  } catch (error) {
    return {
      ok: false as const,
      code: "PROVIDER_ERROR" as ProviderFailureCode,
      message: error instanceof Error ? `Unable to load ComfyUI workflow: ${error.message}` : "Unable to load ComfyUI workflow.",
    };
  }

  const clientId = `meldex-${Date.now()}`;
  const submit = await fetch(`${baseUrl}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow, client_id: clientId }),
    signal: AbortSignal.timeout(30000),
  }).catch((error) => ({ ok: false, status: 0, json: async () => ({ error: error instanceof Error ? error.message : "ComfyUI request failed" }) } as Response));
  const submitData = await submit.json().catch(() => ({}));
  if (!submit.ok) {
    return {
      ok: false as const,
      code: "PROVIDER_ERROR" as ProviderFailureCode,
      message: submitData?.error || `ComfyUI prompt submit failed with ${submit.status}`,
      metadata: submitData,
    };
  }

  const promptId = typeof submitData.prompt_id === "string" ? submitData.prompt_id : "";
  if (!promptId) {
    return {
      ok: false as const,
      code: "PROVIDER_ERROR" as ProviderFailureCode,
      message: "ComfyUI did not return a prompt id.",
      metadata: submitData,
    };
  }

  for (let attempt = 0; attempt < 180; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const history = await fetch(`${baseUrl}/history/${encodeURIComponent(promptId)}`, { cache: "no-store" }).then((response) => response.json()).catch(() => ({}));
    const promptHistory = history?.[promptId];
    const outputs = promptHistory?.outputs && typeof promptHistory.outputs === "object" ? Object.values(promptHistory.outputs as Record<string, { images?: Array<{ filename?: string; subfolder?: string; type?: string }> }>) : [];
    const image = outputs.flatMap((output) => output.images || []).find((item) => item.filename);
    if (image?.filename) {
      const params = new URLSearchParams({
        filename: image.filename,
        subfolder: image.subfolder || "",
        type: image.type || "output",
      });
      return {
        ok: true as const,
        provider,
        outputs: [{ url: `${baseUrl}/view?${params.toString()}`, contentType: "image/png", seed: null }],
        metadata: { promptId, history: promptHistory },
      };
    }
  }

  return {
    ok: false as const,
    code: "PROVIDER_TIMEOUT" as ProviderFailureCode,
    message: "ComfyUI did not finish image generation in time.",
    metadata: { promptId },
  };
}

export async function generateImageWithProvider(input: ImageGenerationRequest) {
  const provider = selectImageProvider();
  if (provider === "comfy_cloud_flux_schnell") {
    const size = imageSize(input.settings);
    const result = await runComfyCloudGeneration({
      kind: "image",
      prompt: input.prompt,
      negativePrompt: input.negativePrompt,
      model: input.settings.imageModel || "FLUX.1 Schnell",
      width: size.width,
      height: size.height,
      aspectRatio: input.settings.aspectRatio,
    });
    if (!result.ok) return result;
    return {
      ok: true as const,
      provider,
      outputs: result.outputs.map((output) => ({
        url: output.url,
        width: output.width,
        height: output.height,
        contentType: output.mimeType,
        seed: result.metadata.seed as string | number | null | undefined,
      })),
      metadata: result.metadata,
    };
  }
  if (provider === "local_comfyui_flux_schnell") {
    return {
      ok: false as const,
      code: "PROVIDER_NOT_CONFIGURED" as ProviderFailureCode,
      message: "FLUX is installed but disabled on this Mac because it exhausts 8GB unified memory. Use SDXL Turbo low-memory mode.",
    };
  }
  if (provider === "local_comfyui_sdxl") return await submitComfyWorkflow(input, await comfySdxlWorkflowPath(), "local_comfyui_sdxl");
  const endpoint = provider === "fal_flux_subject" ? FAL_ENDPOINTS.reference : FAL_ENDPOINTS.text;
  return await submitFal(endpoint, input);
}
