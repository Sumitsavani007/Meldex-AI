import { getConfig } from "@/lib/runtime-config";
import { testOpenRouterHealth } from "@/lib/provider-health";

export type StudioProviderKey =
  | "openrouter"
  | "comfyui"
  | "flux_schnell"
  | "sdxl"
  | "wan21_13b"
  | "wan21_14b"
  | "xtts_v2"
  | "musicgen"
  | "audiogen"
  | "latentsync"
  | "whisper_large_v3"
  | "nllb"
  | "ffmpeg";

export type StudioProviderStatusValue = "running" | "installed" | "stopped" | "loading" | "missing" | "failed";

export type StudioProviderStatus = {
  key: StudioProviderKey;
  name: string;
  category: "brain" | "engine" | "image" | "video" | "voice" | "music" | "sound" | "lipsync" | "subtitle" | "translation" | "export";
  status: StudioProviderStatusValue;
  message: string;
  version: string | null;
  gpuMemory: string | null;
  queue: number | null;
  temperature: string | null;
  localFirst: boolean;
  envKeys: string[];
};

export type StudioRenderMode =
  | "storyboard_images"
  | "draft_preview"
  | "final_render"
  | "voice"
  | "music"
  | "sound_effects"
  | "lip_sync"
  | "subtitles"
  | "translation"
  | "export";

export const STUDIO_PROVIDER_REGISTRY: Record<StudioProviderKey, Omit<StudioProviderStatus, "status" | "message" | "version" | "gpuMemory" | "queue" | "temperature"> & { requiredEnv: string[] }> = {
  openrouter: {
    key: "openrouter",
    name: "Qwen3-Coder Brain via OpenRouter",
    category: "brain",
    localFirst: false,
    envKeys: ["OPENROUTER_API_KEY", "OPENROUTER_MODEL"],
    requiredEnv: ["OPENROUTER_API_KEY"],
  },
  comfyui: {
    key: "comfyui",
    name: "ComfyUI Media Engine",
    category: "engine",
    localFirst: true,
    envKeys: ["COMFYUI_BASE_URL"],
    requiredEnv: ["COMFYUI_BASE_URL"],
  },
  flux_schnell: {
    key: "flux_schnell",
    name: "FLUX.1 Schnell (Disabled)",
    category: "image",
    localFirst: true,
    envKeys: ["COMFYUI_BASE_URL", "STUDIO_FLUX_SCHNELL_WORKFLOW"],
    requiredEnv: ["__FLUX_DISABLED_ON_8GB_MAC__"],
  },
  sdxl: {
    key: "sdxl",
    name: "SDXL Turbo Low Memory",
    category: "image",
    localFirst: true,
    envKeys: ["COMFYUI_BASE_URL", "STUDIO_SDXL_WORKFLOW"],
    requiredEnv: ["COMFYUI_BASE_URL", "STUDIO_SDXL_WORKFLOW"],
  },
  wan21_13b: {
    key: "wan21_13b",
    name: "Wan 2.1 1.3B Draft Preview",
    category: "video",
    localFirst: true,
    envKeys: ["COMFYUI_BASE_URL", "STUDIO_WAN21_13B_WORKFLOW"],
    requiredEnv: ["COMFYUI_BASE_URL", "STUDIO_WAN21_13B_WORKFLOW"],
  },
  wan21_14b: {
    key: "wan21_14b",
    name: "Wan 2.1 14B Final Render",
    category: "video",
    localFirst: true,
    envKeys: ["COMFYUI_BASE_URL", "STUDIO_WAN21_14B_WORKFLOW"],
    requiredEnv: ["COMFYUI_BASE_URL", "STUDIO_WAN21_14B_WORKFLOW"],
  },
  xtts_v2: {
    key: "xtts_v2",
    name: "XTTS v2 Voice",
    category: "voice",
    localFirst: true,
    envKeys: ["XTTS_BASE_URL"],
    requiredEnv: ["XTTS_BASE_URL"],
  },
  musicgen: {
    key: "musicgen",
    name: "MusicGen",
    category: "music",
    localFirst: true,
    envKeys: ["MUSICGEN_BASE_URL"],
    requiredEnv: ["MUSICGEN_BASE_URL"],
  },
  audiogen: {
    key: "audiogen",
    name: "AudioGen",
    category: "sound",
    localFirst: true,
    envKeys: ["AUDIOGEN_BASE_URL"],
    requiredEnv: ["AUDIOGEN_BASE_URL"],
  },
  latentsync: {
    key: "latentsync",
    name: "LatentSync",
    category: "lipsync",
    localFirst: true,
    envKeys: ["LATENTSYNC_BASE_URL"],
    requiredEnv: ["LATENTSYNC_BASE_URL"],
  },
  whisper_large_v3: {
    key: "whisper_large_v3",
    name: "Whisper Large V3",
    category: "subtitle",
    localFirst: true,
    envKeys: ["WHISPER_BASE_URL"],
    requiredEnv: ["WHISPER_BASE_URL"],
  },
  nllb: {
    key: "nllb",
    name: "NLLB Translation",
    category: "translation",
    localFirst: true,
    envKeys: ["NLLB_BASE_URL"],
    requiredEnv: ["NLLB_BASE_URL"],
  },
  ffmpeg: {
    key: "ffmpeg",
    name: "FFmpeg Export",
    category: "export",
    localFirst: true,
    envKeys: ["FFMPEG_PATH"],
    requiredEnv: ["FFMPEG_PATH"],
  },
};

export const STUDIO_RENDER_REQUIREMENTS: Record<StudioRenderMode, StudioProviderKey[]> = {
  storyboard_images: ["comfyui", "sdxl"],
  draft_preview: ["comfyui", "wan21_13b"],
  final_render: ["comfyui", "wan21_14b"],
  voice: ["xtts_v2"],
  music: ["musicgen"],
  sound_effects: ["audiogen"],
  lip_sync: ["latentsync"],
  subtitles: ["whisper_large_v3"],
  translation: ["nllb"],
  export: ["ffmpeg"],
};

async function hasEveryConfig(keys: string[]) {
  const values = await Promise.all(keys.map((key) => getConfig(key)));
  return values.every((value) => Boolean(value));
}

async function getComfyRuntime(baseUrl: string | undefined) {
  if (!baseUrl) return null;
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/system_stats`, {
      cache: "no-store",
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) return null;
    const data = await response.json() as { system?: { comfyui_version?: string }; devices?: Array<{ vram_total?: number; vram_free?: number }> };
    const device = data.devices?.[0];
    return {
      version: data.system?.comfyui_version || "running",
      gpuMemory: device?.vram_total ? `${Math.round((device.vram_total - (device.vram_free || 0)) / 1024 / 1024)} / ${Math.round(device.vram_total / 1024 / 1024)} MB` : null,
    };
  } catch {
    return null;
  }
}

export async function listStudioProviderStatuses(): Promise<StudioProviderStatus[]> {
  const comfyBaseUrl = await getConfig("COMFYUI_BASE_URL");
  const comfyRuntime = await getComfyRuntime(comfyBaseUrl || undefined);
  const openRouter = await testOpenRouterHealth().catch((err) => ({
    ok: false,
    message: err instanceof Error ? err.message : "OpenRouter health check failed",
  }));

  const statuses = await Promise.all(Object.values(STUDIO_PROVIDER_REGISTRY).map(async (provider) => {
    if (provider.key === "openrouter") {
      return {
        ...provider,
        envKeys: provider.envKeys,
        status: openRouter.ok ? "running" : "failed",
        message: openRouter.ok ? "Brain provider running" : ("message" in openRouter ? openRouter.message : "OpenRouter failed"),
        version: await getConfig("OPENROUTER_MODEL") || "qwen/qwen3-coder",
        gpuMemory: null,
        queue: 0,
        temperature: null,
      } satisfies StudioProviderStatus;
    }

    const configured = await hasEveryConfig(provider.requiredEnv);
    if (!configured) {
      return {
        ...provider,
        envKeys: provider.envKeys,
        status: "missing",
        message: "Provider Not Installed",
        version: null,
        gpuMemory: null,
        queue: null,
        temperature: null,
      } satisfies StudioProviderStatus;
    }

    if (provider.envKeys.includes("COMFYUI_BASE_URL")) {
      return {
        ...provider,
        envKeys: provider.envKeys,
        status: comfyRuntime ? "running" : "stopped",
        message: comfyRuntime ? "Provider running through ComfyUI" : "Provider configured but ComfyUI is stopped",
        version: comfyRuntime?.version || null,
        gpuMemory: comfyRuntime?.gpuMemory || null,
        queue: null,
        temperature: null,
      } satisfies StudioProviderStatus;
    }

    return {
      ...provider,
      envKeys: provider.envKeys,
      status: "installed",
      message: "Provider configured; runtime health endpoint not connected yet",
      version: null,
      gpuMemory: null,
      queue: null,
      temperature: null,
    } satisfies StudioProviderStatus;
  }));

  return statuses;
}

export async function getMissingProvidersForRender(mode: StudioRenderMode) {
  const statuses = await listStudioProviderStatuses();
  const required = STUDIO_RENDER_REQUIREMENTS[mode];
  return required
    .map((key) => statuses.find((provider) => provider.key === key))
    .filter((provider): provider is StudioProviderStatus => Boolean(provider))
    .filter((provider) => provider.status !== "running" && provider.status !== "installed");
}

export function studioRenderStage(mode: StudioRenderMode) {
  if (mode === "storyboard_images") return "GENERATING_IMAGES";
  if (mode === "draft_preview") return "GENERATING_PREVIEW";
  if (mode === "final_render") return "RENDERING_FINAL";
  if (mode === "voice") return "GENERATING_VOICE";
  if (mode === "music") return "GENERATING_MUSIC";
  if (mode === "sound_effects") return "GENERATING_SOUND_EFFECTS";
  if (mode === "lip_sync") return "LIP_SYNC";
  if (mode === "subtitles") return "GENERATING_SUBTITLES";
  if (mode === "translation") return "TRANSLATING";
  return "ENCODING_EXPORT";
}
