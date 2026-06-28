import { getConfig } from "@/lib/runtime-config";
import type { ImagePromptPlan, ImageReferenceSummary, ImageStudioSettings } from "@/lib/ai-studio-image";

export type ImageProviderKey =
  | "fal_flux_schnell"
  | "fal_flux_subject"
  | "comfyui_flux_schnell_future"
  | "comfyui_sdxl_future"
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

function imageSize(settings: ImageStudioSettings) {
  const base = settings.size || 1024;
  const ratio = settings.aspectRatio;
  if (ratio === "16:9") return { width: base, height: Math.round(base * 9 / 16) };
  if (ratio === "4:3") return { width: base, height: Math.round(base * 3 / 4) };
  if (ratio === "3:4") return { width: Math.round(base * 3 / 4), height: base };
  if (ratio === "9:16") return { width: Math.round(base * 9 / 16), height: base };
  return { width: base, height: base };
}

function hasReferences(input: ImageGenerationRequest) {
  return input.references.some((reference) => Boolean(reference.dataUrl));
}

export async function getImageProviderStatuses(): Promise<ImageProviderStatus[]> {
  const configured = Boolean(await falKey());
  return [
    {
      key: "fal_flux_schnell",
      name: "fal.ai FLUX Schnell",
      configured,
      status: configured ? "ready" : "missing",
      message: configured ? "Ready for online text-to-image." : "Set FAL_KEY or FAL_API_KEY to enable online text-to-image.",
    },
    {
      key: "fal_flux_subject",
      name: "fal.ai FLUX Subject",
      configured,
      status: configured ? "ready" : "missing",
      message: configured ? "Ready for reference/subject image mode." : "Set FAL_KEY or FAL_API_KEY to enable reference-image generation.",
    },
    {
      key: "comfyui_flux_schnell_future",
      name: "ComfyUI FLUX Schnell",
      configured: false,
      status: "future",
      message: "Local provider planned for future configuration.",
    },
    {
      key: "comfyui_sdxl_future",
      name: "ComfyUI SDXL",
      configured: false,
      status: "future",
      message: "Local provider planned for future configuration.",
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

export function selectImageProvider(input: Pick<ImageGenerationRequest, "references" | "settings">): ImageProviderKey {
  if (input.references.length || input.settings.mode !== "Text only" || input.settings.identityLock) return "fal_flux_subject";
  return "fal_flux_schnell";
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

export async function generateImageWithProvider(input: ImageGenerationRequest) {
  const provider = selectImageProvider(input);
  const endpoint = provider === "fal_flux_subject" ? FAL_ENDPOINTS.reference : FAL_ENDPOINTS.text;
  return await submitFal(endpoint, input);
}
