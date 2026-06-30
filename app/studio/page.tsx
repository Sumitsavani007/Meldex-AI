"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import Image from "next/image";
import {
  Aperture,
  Bell,
  Box,
  Check,
  ChevronDown,
  Clapperboard,
  Copy,
  Download,
  Folder,
  Frame,
  Grid2X2,
  HelpCircle,
  ImageIcon,
  Maximize2,
  Mic2,
  Moon,
  Music2,
  PanelLeftClose,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useThemePreference } from "@/components/theme-provider";

type StudioAsset = {
  id: string;
  type: string;
  name: string;
  url?: string | null;
  mimeType?: string | null;
  sizeBytes?: number;
};

type StudioProject = {
  id: string;
  name: string;
  description?: string | null;
  styleLock?: string | null;
  seed?: string | null;
  settingsJson?: Record<string, unknown> | null;
  resolution: string;
  durationSec: number;
  aspectRatio: string;
  fps?: number;
  updatedAt: string;
  assets?: StudioAsset[];
  generations?: StudioGeneration[];
  _count?: { assets: number; generations: number; scenes: number };
};

type StudioGeneration = {
  id: string;
  type: string;
  status: string;
  sourcePrompt: string;
  detectedLanguage?: string | null;
  enhancedPrompt?: string | null;
  negativePrompt?: string | null;
  storyboardJson?: StudioPlan | null;
  model?: string | null;
  provider?: string | null;
  createdAt: string;
  outputUrl?: string | null;
  error?: string | null;
  scenes?: StudioScene[];
};

type StudioScene = {
  id: string;
  order: number;
  title: string;
  prompt: string;
  negativePrompt?: string | null;
  durationSec: number;
  camera?: string | null;
  emotion?: string | null;
  lighting?: string | null;
  environment?: string | null;
};

type StudioPlan = {
  summary?: string;
  enhancedPrompt?: string;
  detectedLanguage?: string;
  style?: string;
  negativePrompt?: string;
  scenes?: StudioScene[];
  timeline?: Array<{ scene: number; start: number; end: number; label: string }>;
  outputs?: Array<Partial<ImageResult>>;
  providerStatus?: { message?: string; selectedProvider?: string };
};

type StreamEvent = {
  sequence: number;
  type: string;
  message: string;
  payload?: Record<string, unknown>;
  timestamp: string;
};

type ProviderStatus = {
  key: string;
  name: string;
  status: string;
  message: string;
  category?: string;
  version?: string | null;
  gpuMemory?: string | null;
  queue?: number | null;
  temperature?: string | null;
};

type UploadedItem = {
  id: string;
  type: "frame" | "clip" | "audio" | "avatar";
  name: string;
  dataUrl: string;
  mimeType: string;
  sizeBytes: number;
};

type ImageReference = {
  id: string;
  type: "Face" | "Character" | "Couple" | "Style";
  name: string;
  dataUrl: string;
  mimeType: string;
  sizeBytes: number;
};

type ImageResult = {
  id: string;
  url?: string;
  enhancedPrompt: string;
  negativePrompt: string;
  providerMessage: string;
  provider?: string;
  model?: string;
  seed?: string | number | null;
  size?: number;
  aspectRatio?: string;
  createdAt: string;
};

type StudioCreditEstimate = {
  credits: number;
  provider: string;
  model: string;
  queueSeconds: number;
  processingSeconds: number;
};

type StudioCreditBalance = {
  monthlyCredits: number;
  usedCredits: number;
  monthlyRemaining: number;
  purchasedCredits: number;
  totalRemaining: number;
  estimatedRemainingGenerations: number;
};

const navItems = [
  { key: "studio", label: "AI Studio", icon: Sparkles },
  { key: "image", label: "Generate Image", icon: Frame },
  { key: "projects", label: "Projects", icon: Folder },
  { key: "templates", label: "Templates", icon: Grid2X2 },
  { key: "assets", label: "Assets", icon: ImageIcon },
  { key: "uploads", label: "Uploads", icon: Upload },
  { key: "voices", label: "AI Voices", icon: Mic2 },
  { key: "music", label: "Music", icon: Music2 },
  { key: "settings", label: "Settings", icon: Settings2 },
];

const templatePresets = [
  { name: "Cinematic Product Reveal", prompt: "Create a premium cinematic product reveal video with dramatic lighting, close-up macro shots, slow dolly motion, and an elegant final hero frame.", styleLock: "Cinematic", cameraMotion: "Dolly", aspectRatio: "16:9" },
  { name: "Gujarati Festival Story", prompt: "ગુજરાતી તહેવારની ખુશી બતાવતો cinematic video બનાવો: રંગોળી, દીવા, પરિવાર, ધીમો કેમેરા મૂવમેન્ટ અને ગરમ golden hour lighting.", styleLock: "Cinematic", cameraMotion: "Tracking", aspectRatio: "16:9" },
  { name: "Luxury Fashion Reel", prompt: "Create a luxury fashion reel with runway pacing, soft studio lighting, fabric close-ups, confident model movement, and premium editorial mood.", styleLock: "Realistic", cameraMotion: "Steadicam", aspectRatio: "9:16" },
  { name: "Instagram Reel", prompt: "Create a fast premium Instagram reel with a strong opening hook, kinetic cuts, stylish captions, and a satisfying final CTA moment.", styleLock: "Cyberpunk", cameraMotion: "Handheld", aspectRatio: "9:16" },
];

const styles = ["Cinematic", "Realistic", "Anime", "3D Render", "Fantasy", "Vintage"];
const cameras = ["Dolly", "Drone", "Orbit", "Tracking", "Handheld", "Steadicam", "Zoom", "Tilt"];
const ratios = ["16:9", "4:3", "1:1", "3:4", "9:16"];
const fpsOptions = [24, 30, 48, 60];
const durationOptions = [5, 8, 10, 15, 20, 30, 60];
const imageModels = ["FLUX.1 Schnell", "FLUX Dev", "SDXL", "Stable Diffusion XL", "Future Models"];
const imageScalePresets = [
  { label: "Square", value: "1:1", size: "1024 x 1024", width: 1024, height: 1024 },
  { label: "Portrait", value: "9:16", size: "768 x 1344", width: 768, height: 1344 },
  { label: "Landscape", value: "16:9", size: "1344 x 768", width: 1344, height: 768 },
] as const;
const resolutions = [
  { label: "1080P", sub: "1920 x 1080", value: "1080p" },
  { label: "720P", sub: "1280 x 720", value: "720p" },
];
const quickAdd = [
  { type: "frame" as const, label: "Frame", accept: "image/*", icon: Frame },
  { type: "clip" as const, label: "Clip", accept: "video/*", icon: Plus },
  { type: "audio" as const, label: "Audio", accept: "audio/*", icon: Music2 },
];

const avatarSeed = [
  ["D", "#f8c59a", "#111827"],
  ["A", "#f2b6c8", "#4c0519"],
  ["K", "#f5b64a", "#111827"],
  ["N", "#c29b76", "#172554"],
  ["M", "#a1633d", "#111827"],
  ["R", "#d49a69", "#3b0764"],
] as const;

const studioTokens = {
  app: "bg-[#f5f7fb] text-slate-950 dark:bg-[#050911] dark:text-white",
  line: "border-slate-200/80 dark:border-white/10",
  panel: "border border-slate-200/80 bg-white/86 shadow-xl shadow-slate-950/5 backdrop-blur-2xl dark:border-white/10 dark:bg-[#0b121c]/78 dark:shadow-black/30",
  soft: "border border-slate-200/70 bg-white/70 dark:border-white/10 dark:bg-white/[0.035]",
  input: "border border-slate-300/80 bg-white text-slate-950 shadow-inner shadow-slate-950/5 outline-none transition placeholder:text-slate-500 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-white/10 dark:bg-[#080d16]/92 dark:text-white dark:placeholder:text-white/38 dark:focus:border-violet-300/70 dark:focus:ring-violet-300/15 [color-scheme:light] dark:[color-scheme:dark] [&>option]:bg-white [&>option]:text-slate-950 dark:[&>option]:bg-[#080d16] dark:[&>option]:text-white",
  muted: "text-slate-500 dark:text-white/58",
  faint: "text-slate-400 dark:text-white/38",
};

function fallbackPrompt() {
  return "એક છોકરો વરસાદમાં ગામની ગલીમાં દોડે છે અને છેલ્લે સૂર્ય નીકળે છે, cinematic video બનાવો.";
}

function timeAgo(value?: string) {
  if (!value) return "now";
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.max(1, Math.floor(diff / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function avatarDataUrl(seed: (typeof avatarSeed)[number]) {
  const [letter, bg, fg] = seed;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="${bg}"/><stop offset="1" stop-color="#111827"/></linearGradient></defs><rect width="96" height="96" rx="48" fill="url(#g)"/><circle cx="48" cy="38" r="16" fill="${fg}" opacity=".92"/><path d="M20 86c5-21 51-21 56 0" fill="${fg}" opacity=".88"/><text x="48" y="88" text-anchor="middle" font-size="18" font-family="Inter,Arial" font-weight="700" fill="white">${letter}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function formatBytes(bytes = 0) {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Unable to read file"));
    reader.readAsDataURL(file);
  });
}

function parseDurationFromPrompt(value: string) {
  const lower = value.toLowerCase();
  const minute = lower.match(/\b(1|one)\s*(minute|min)\b/);
  if (minute) return 60;
  const match = lower.match(/\b(5|8|10|15|20|30|60)\s*(seconds?|secs?|s)\b/);
  return match ? Number(match[1]) : null;
}

function normalizeLocalImageSettings<T extends { imageModel: string; size: number; steps: number; mode: string; identityLock: boolean }>(settings: T): T {
  if (settings.imageModel === "SDXL Turbo") return { ...settings, imageModel: "SDXL" };
  if (!imageModels.includes(settings.imageModel)) return { ...settings, imageModel: "FLUX.1 Schnell" };
  return settings;
}

export default function StudioPage() {
  const { data: session, status } = useSession({ required: true });
  const { resolvedTheme, setTheme } = useThemePreference();
  const theme = resolvedTheme;
  const [activeNav, setActiveNav] = useState("studio");
  const [mobileTab, setMobileTab] = useState("create");
  const [projects, setProjects] = useState<StudioProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedProject, setSelectedProject] = useState<StudioProject | null>(null);
  const [projectSearch, setProjectSearch] = useState("");
  const [prompt, setPrompt] = useState(fallbackPrompt());
  const [promptHistory, setPromptHistory] = useState<string[]>([]);
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("Ready");
  const [providerStatuses, setProviderStatuses] = useState<ProviderStatus[]>([]);
  const [selectedAvatar, setSelectedAvatar] = useState(0);
  const [uploads, setUploads] = useState<UploadedItem[]>([]);
  const [settings, setSettings] = useState({
    model: "OpenRouter active model",
    resolution: "1080p",
    durationSec: 5,
    aspectRatio: "16:9",
    fps: 24,
    seed: "",
    contentPreference: "Auto",
    negativePrompt: "low quality, blurry, distorted faces, watermark",
    motionStrength: 56,
    cameraMotion: "Dolly",
    styleLock: "Cinematic",
    consistency: 74,
  });
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageLoading, setImageLoading] = useState(false);
  const [imageEnhancing, setImageEnhancing] = useState(false);
  const [imageError, setImageError] = useState("");
  const [creditEstimate, setCreditEstimate] = useState<StudioCreditEstimate | null>(null);
  const [creditBalance, setCreditBalance] = useState<StudioCreditBalance | null>(null);
  const [creditBlocked, setCreditBlocked] = useState<{ message: string; recommendedPlan?: { name: string; slug: string } | null } | null>(null);
  const [creditLoading, setCreditLoading] = useState(false);
  const [durationTouched, setDurationTouched] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState<ImageResult | null>(null);
  const [imageReferences, setImageReferences] = useState<ImageReference[]>([]);
  const [imageResults, setImageResults] = useState<ImageResult[]>([]);
  const [imageSettings, setImageSettings] = useState({
    model: "OpenRouter active model",
    imageModel: "FLUX.1 Schnell",
    mode: "Text only",
    aspectRatio: "16:9",
    size: 320,
    quality: "Fast",
    seedMode: "Random" as "Random" | "Custom",
    seed: "",
    steps: 1,
    negativePrompt: "low quality, blurry, distorted face, bad anatomy, watermark",
    style: "Realistic",
    identityLock: false,
    faceSimilarity: 90,
    referenceStrength: 80,
    preserveFaceStructure: true,
    preserveSkinTone: true,
    preserveHair: true,
    preserveAge: true,
    referenceType: "Face" as "Face" | "Character" | "Couple" | "Style",
  });
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const imagePromptRef = useRef<HTMLTextAreaElement | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const quickInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const avatarUrls = useMemo(() => [...avatarSeed.map(avatarDataUrl), ...uploads.filter((item) => item.type === "avatar").map((item) => item.dataUrl)], [uploads]);
  const latestGeneration = selectedProject?.generations?.[0];
  const scenes = latestGeneration?.scenes || latestGeneration?.storyboardJson?.scenes || [];
  const timeline = latestGeneration?.storyboardJson?.timeline || scenes.map((scene, index) => ({ scene: index + 1, start: index * 4, end: (index + 1) * 4, label: scene.title }));
  const filteredProjects = projects.filter((project) => project.name.toLowerCase().includes(projectSearch.toLowerCase()));
  const referenceAsset = uploads.find((item) => item.type === "frame" || item.type === "clip");
  const selectedImageScale = imageScalePresets.find((item) => item.value === imageSettings.aspectRatio) || imageScalePresets[0];
  const localProvider = providerStatuses.find((provider) => provider.status === "missing" && provider.key !== "openrouter");
  const progress = useMemo(() => {
    if (!loading && latestGeneration?.status === "COMPLETED") return 100;
    if (!events.length) return 0;
    const map: Record<string, number> = {
      request_received: 8,
      language_detection: 18,
      prompt_enhancement: 32,
      story_generation: 44,
      scene_breakdown: 56,
      storyboard_started: 68,
      storyboard_ready: 78,
      shot_planner: 86,
      timeline_updated: 92,
      preview_ready: 96,
      done: 100,
    };
    return map[events.at(-1)?.type || ""] || 12;
  }, [events, loading, latestGeneration?.status]);

  useEffect(() => {
    const saved = window.localStorage.getItem("meldex_studio_prompt_history");
    if (saved) setPromptHistory(JSON.parse(saved).slice(0, 8));
  }, []);

  useEffect(() => {
    if (!promptRef.current) return;
    promptRef.current.style.height = "auto";
    promptRef.current.style.height = `${Math.max(216, promptRef.current.scrollHeight)}px`;
  }, [prompt]);

  useEffect(() => {
    if (!imagePromptRef.current) return;
    imagePromptRef.current.style.height = "auto";
    imagePromptRef.current.style.height = `${Math.max(156, imagePromptRef.current.scrollHeight)}px`;
  }, [imagePrompt]);

  useEffect(() => {
    if (durationTouched || activeNav !== "studio") return;
    const detected = parseDurationFromPrompt(prompt);
    if (detected && detected !== settings.durationSec) {
      setSettings((current) => ({ ...current, durationSec: detected }));
    }
  }, [activeNav, durationTouched, prompt, settings.durationSec]);

  useEffect(() => {
    if (status !== "authenticated") return;
    const controller = new AbortController();
    const selected = activeNav === "image" ? selectedImageScale : null;
    setCreditLoading(true);
    fetch("/api/studio/credits/estimate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(activeNav === "image" ? {
        kind: "image",
        provider: "comfy_cloud",
        model: imageSettings.imageModel,
        width: selected?.width || 1024,
        height: selected?.height || 1024,
        imageCount: 1,
        referenceImages: imageReferences.length,
        aspectRatio: selected?.value || "1:1",
      } : {
        kind: "video",
        provider: "comfy_cloud",
        model: "Wan 2.x",
        durationSec: settings.durationSec,
        fps: settings.fps,
        aspectRatio: settings.aspectRatio,
        width: settings.resolution === "1080p" ? 1920 : 1280,
        height: settings.resolution === "1080p" ? 1080 : 720,
      }),
      cache: "no-store",
      signal: controller.signal,
    }).then((response) => response.json()).then((data) => {
      if (controller.signal.aborted) return;
      if (data.estimate) setCreditEstimate(data.estimate);
      if (data.balance) setCreditBalance(data.balance);
      setCreditBlocked(data.blocked);
    }).catch(() => undefined).finally(() => {
      if (!controller.signal.aborted) setCreditLoading(false);
    });
    return () => controller.abort();
  }, [activeNav, imageReferences.length, imageSettings.imageModel, selectedImageScale, settings.aspectRatio, settings.durationSec, settings.fps, settings.resolution, status]);

  useEffect(() => {
    if (status !== "authenticated") return;
    loadProjects().catch((error) => setMessage(error instanceof Error ? error.message : "Unable to load AI Studio"));
    loadProviderStatus().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function loadProjects(projectId = selectedProjectId) {
    const response = await fetch("/api/studio/projects", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to load AI Studio");
    let loaded = data.projects || [];
    if (!loaded.length) {
      const created = await createDefaultProject();
      loaded = [created];
    }
    setProjects(loaded);
    const nextId = projectId || loaded[0]?.id || "";
    if (nextId) {
      setSelectedProjectId(nextId);
      await loadProject(nextId);
    }
  }

  async function loadProject(id: string) {
    const response = await fetch(`/api/studio/projects/${id}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to load Studio project");
    const project = data.project as StudioProject;
    setSelectedProject(project);
    setSelectedProjectId(id);
    const savedSettings = project.settingsJson && typeof project.settingsJson === "object" ? project.settingsJson : {};
    setSettings((current) => ({
      ...current,
      ...(savedSettings as Partial<typeof current>),
      resolution: project.resolution || current.resolution,
      durationSec: project.durationSec || current.durationSec,
      aspectRatio: project.aspectRatio || current.aspectRatio,
      fps: project.fps || current.fps,
      seed: project.seed || current.seed,
      styleLock: project.styleLock || current.styleLock,
    }));
    const savedUploads = Array.isArray(savedSettings.uploads) ? savedSettings.uploads as UploadedItem[] : [];
    if (savedUploads.length) setUploads(savedUploads);
    if (savedSettings.imageSettings && typeof savedSettings.imageSettings === "object") {
      setImageSettings((current) => normalizeLocalImageSettings({ ...current, ...(savedSettings.imageSettings as Partial<typeof current>) }));
    }
    if (typeof savedSettings.imagePrompt === "string") setImagePrompt(savedSettings.imagePrompt);
    setImageReferences(Array.isArray(savedSettings.imageReferences) ? savedSettings.imageReferences as ImageReference[] : []);
    setImageResults(Array.isArray(savedSettings.imageResults) ? savedSettings.imageResults as ImageResult[] : []);
    await loadImageHistory(id).catch(() => undefined);
  }

  async function loadImageHistory(projectId = selectedProjectId) {
    if (!projectId) return;
    const response = await fetch(`/api/studio/image/history?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !Array.isArray(data.generations)) return;
    const history = data.generations.map((generation: StudioGeneration) => {
      const payload = generation.storyboardJson || {};
      const outputs = Array.isArray(payload.outputs) ? payload.outputs : [];
      const firstOutput = outputs[0] as Partial<ImageResult> | undefined;
      const providerStatus = payload.providerStatus as { message?: string; selectedProvider?: string } | undefined;
      return {
        id: generation.id,
        url: generation.outputUrl || firstOutput?.url,
        enhancedPrompt: generation.enhancedPrompt || generation.sourcePrompt,
        negativePrompt: generation.negativePrompt || "",
        providerMessage: providerStatus?.message || generation.error || generation.status,
        provider: providerStatus?.selectedProvider || generation.provider || undefined,
        model: generation.model || undefined,
        createdAt: generation.createdAt,
      } satisfies ImageResult;
    });
    if (history.length) setImageResults(history);
  }

  async function createProject() {
    const name = window.prompt("Project name", "Untitled Studio Film")?.trim();
    if (!name) return;
    const response = await fetch("/api/studio/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description: "AI Studio media project", mode: "TEXT_TO_VIDEO" }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to create project");
    await loadProjects(data.project.id);
    setActiveNav("studio");
  }

  async function createDefaultProject() {
    const response = await fetch("/api/studio/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "AI Studio Test Project", description: "Local SDXL image generation project", mode: "TEXT_TO_IMAGE" }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to create default AI Studio project");
    return data.project as StudioProject;
  }

  async function ensureSelectedProject() {
    if (selectedProject) return selectedProject;
    const created = await createDefaultProject();
    setProjects((current) => [created, ...current.filter((project) => project.id !== created.id)]);
    await loadProject(created.id);
    return created;
  }

  async function updateProject(body: Record<string, unknown>, reload = true) {
    if (!selectedProject) return;
    const response = await fetch(`/api/studio/projects/${selectedProject.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Project update failed");
    if (reload) await loadProject(data.project.id);
  }

  async function saveSettings(nextSettings = settings, nextUploads = uploads) {
    if (!selectedProject) return;
    await updateProject({
      action: "settings",
      settings: {
        ...nextSettings,
        uploads: nextUploads,
        imagePrompt,
        imageSettings,
        imageReferences,
        imageResults,
      },
      styleLock: nextSettings.styleLock,
      aspectRatio: nextSettings.aspectRatio,
      resolution: nextSettings.resolution,
      durationSec: nextSettings.durationSec,
      fps: nextSettings.fps,
      seed: nextSettings.seed || null,
    }, false);
    setMessage("Settings saved");
  }

  async function loadProviderStatus() {
    const response = await fetch("/api/studio/provider/status", { method: "POST", cache: "no-store" });
    const data = await response.json();
    if (response.ok) setProviderStatuses(data.providers || []);
  }

  async function renameProject() {
    if (!selectedProject) return;
    const name = window.prompt("Rename project", selectedProject.name)?.trim();
    if (!name) return;
    await updateProject({ action: "rename", name });
    await loadProjects(selectedProject.id);
  }

  function applyTemplate(name: string) {
    const preset = templatePresets.find((template) => template.name === name);
    if (!preset) return;
    setPrompt(preset.prompt);
    const nextSettings = { ...settings, styleLock: preset.styleLock, cameraMotion: preset.cameraMotion, aspectRatio: preset.aspectRatio };
    setSettings(nextSettings);
    setMessage(`${name} template loaded`);
  }

  async function updateScene(scene: StudioScene, patch: Record<string, unknown>) {
    const response = await fetch(`/api/studio/scenes/${scene.id}/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", ...patch }),
    });
    if (!response.ok) throw new Error("Scene update failed");
    if (selectedProject) await loadProject(selectedProject.id);
  }

  async function sceneAction(scene: StudioScene, action: "duplicate" | "delete") {
    const response = await fetch(`/api/studio/scenes/${scene.id}/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!response.ok) throw new Error(`Scene ${action} failed`);
    if (selectedProject) await loadProject(selectedProject.id);
  }

  function updatePromptHistory(value: string) {
    const next = [value, ...promptHistory.filter((item) => item !== value)].slice(0, 8);
    setPromptHistory(next);
    window.localStorage.setItem("meldex_studio_prompt_history", JSON.stringify(next));
  }

  async function handleUpload(type: UploadedItem["type"], files?: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    const item = { id: `${type}-${Date.now()}`, type, name: file.name, dataUrl, mimeType: file.type, sizeBytes: file.size };
    const nextUploads = type === "avatar" ? [...uploads.filter((upload) => upload.type !== "avatar"), item] : [item, ...uploads.filter((upload) => upload.id !== item.id)].slice(0, 10);
    setUploads(nextUploads);
    if (type === "avatar") setSelectedAvatar(avatarSeed.length);
    await saveSettings(settings, nextUploads).catch(() => setMessage("Upload saved locally; project save failed"));
  }

  async function saveImageState(next?: {
    prompt?: string;
    imageSettings?: typeof imageSettings;
    references?: ImageReference[];
    results?: ImageResult[];
  }) {
    if (!selectedProject) return;
    await updateProject({
      action: "settings",
      settings: {
        ...settings,
        uploads,
        imagePrompt: next?.prompt ?? imagePrompt,
        imageSettings: next?.imageSettings ?? imageSettings,
        imageReferences: next?.references ?? imageReferences,
        imageResults: next?.results ?? imageResults,
      },
      styleLock: settings.styleLock,
      aspectRatio: settings.aspectRatio,
      resolution: settings.resolution,
      durationSec: settings.durationSec,
      fps: settings.fps,
      seed: settings.seed || null,
    }, false);
  }

  function setImageSetting<K extends keyof typeof imageSettings>(key: K, value: (typeof imageSettings)[K]) {
    const next = { ...imageSettings, [key]: value };
    setImageSettings(next);
    saveImageState({ imageSettings: next }).catch(() => undefined);
  }

  async function enhanceCurrentImagePrompt() {
    if (!imagePrompt.trim() || imageEnhancing || imageLoading) return;
    setImageEnhancing(true);
    setImageError("");
    setMessage("Enhancing prompt with Qwen3-Coder");
    try {
      const response = await fetch("/api/studio/image/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: imagePrompt }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Prompt enhancement failed");
      setImagePrompt(data.enhancedPrompt);
      setMessage("Prompt enhanced. Review it, then generate when ready.");
      await saveImageState({ prompt: data.enhancedPrompt }).catch(() => undefined);
    } catch (error) {
      const nextError = error instanceof Error ? error.message : "Prompt enhancement failed";
      setImageError(nextError);
      setMessage(nextError);
    } finally {
      setImageEnhancing(false);
    }
  }

  async function runImageGeneration() {
    if (!imagePrompt.trim() || imageLoading) return;
    if (imageSettings.imageModel === "Future Models") {
      setImageError("Future Models are visible for roadmap planning, but are not enabled yet.");
      return;
    }
    setImageLoading(true);
    setImageError("");
    setMessage("Preparing Comfy Cloud workflow");
    try {
      const project = await ensureSelectedProject();
      await saveImageState({ prompt: imagePrompt, imageSettings }).catch(() => undefined);
      const response = await fetch("/api/studio/image/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          prompt: imagePrompt,
          model: imageSettings.imageModel,
          imageScale: selectedImageScale.value,
          width: selectedImageScale.width,
          height: selectedImageScale.height,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 402) {
          setCreditBlocked({ message: data.error || "Not enough credits.", recommendedPlan: data.recommendedPlan });
          if (data.estimate) setCreditEstimate(data.estimate);
        }
        throw new Error(data.error || "Image generation failed");
      }
      const outputs = Array.isArray(data.outputs) ? data.outputs : [];
      const mappedOutputs: ImageResult[] = outputs.length ? outputs.map((output: Partial<ImageResult>, index: number) => ({
        id: index === 0 ? data.generation.id : `${data.generation.id}-${index}`,
        url: output.url,
        enhancedPrompt: imagePrompt,
        providerMessage: data.providerMessage,
        provider: data.selectedProvider || data.provider,
        model: data.model || imageSettings.imageModel,
        seed: output.seed,
        size: output.size || selectedImageScale.size,
        aspectRatio: output.aspectRatio || selectedImageScale.value,
        createdAt: data.generation.createdAt,
      })) : [{
        id: data.generation.id,
        enhancedPrompt: imagePrompt,
        providerMessage: data.providerMessage,
        provider: data.selectedProvider || data.provider,
        model: data.model || imageSettings.imageModel,
        size: selectedImageScale.size,
        aspectRatio: selectedImageScale.value,
        createdAt: data.generation.createdAt,
      }];
      const nextResults = [...mappedOutputs, ...imageResults].slice(0, 12);
      setImageResults(nextResults);
      if (data.usage) setCreditBalance((current) => ({ ...(current || data.usage), ...data.usage }));
      setMessage("Image generated");
      await saveImageState({ results: nextResults });
      await loadProject(project.id);
    } catch (error) {
      const nextError = error instanceof Error ? error.message : "Image generation failed";
      setImageError(nextError);
      setMessage(nextError);
    } finally {
      setImageLoading(false);
    }
  }

  async function reuseImageAsReference(result: ImageResult) {
    if (!result.url) return;
    const reference: ImageReference = {
      id: `image-ref-${Date.now()}`,
      type: imageSettings.referenceType,
      name: "Generated reference",
      dataUrl: result.url,
      mimeType: "image/webp",
      sizeBytes: 0,
    };
    const next = [reference, ...imageReferences].slice(0, 6);
    setImageReferences(next);
    await saveImageState({ references: next }).catch(() => undefined);
  }

  async function deleteImageResult(result: ImageResult) {
    const response = await fetch(`/api/studio/image/${encodeURIComponent(result.id)}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setImageError(data.error || "Unable to delete image");
      return;
    }
    const nextResults = imageResults.filter((item) => item.id !== result.id);
    setImageResults(nextResults);
    await saveImageState({ results: nextResults }).catch(() => undefined);
    setMessage("Image deleted");
  }

  function exportJson() {
    const payload = JSON.stringify({ project: selectedProject, generation: latestGeneration, scenes, timeline, uploads }, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${selectedProject?.name || "meldex-studio"}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function runGeneration() {
    if (!selectedProject || !prompt.trim() || loading) return;
    setLoading(true);
    setEvents([]);
    setMessage("Starting AI Studio pipeline");
    updatePromptHistory(prompt.trim());
    await saveSettings(settings).catch(() => undefined);
    try {
      const response = await fetch("/api/studio/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: selectedProject.id, prompt, settings }),
      });
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({ error: "Unable to start AI Studio" }));
        throw new Error(data.error || "Unable to start AI Studio");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() || "";
        for (const chunk of chunks) {
          const dataLine = chunk.split("\n").find((line) => line.startsWith("data: "));
          if (!dataLine) continue;
          const event = JSON.parse(dataLine.slice(6)) as StreamEvent;
          setEvents((current) => [...current, event].sort((a, b) => a.sequence - b.sequence));
          setMessage(event.message);
        }
      }
      await loadProject(selectedProject.id);
      await loadProviderStatus();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "AI Studio generation failed");
    } finally {
      setLoading(false);
    }
  }

  async function requestRender(mode: "storyboard_images" | "draft_preview" | "final_render" | "voice" | "music" | "sound_effects" | "lip_sync" | "subtitles" | "translation" | "export") {
    if (!selectedProject) return;
    setMessage("Checking local media providers");
    const response = await fetch("/api/studio/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: selectedProject.id, generationId: latestGeneration?.id, mode, settings }),
    });
    const data = await response.json().catch(() => ({ error: "Render request failed" }));
    if (!response.ok) {
      if (response.status === 402) {
        setCreditBlocked({ message: data.error || "Not enough credits.", recommendedPlan: data.recommendedPlan });
        if (data.estimate) setCreditEstimate(data.estimate);
      }
      setMessage(data.error === "Provider Not Installed" ? `Provider Not Installed: ${(data.missingProviders || []).map((provider: ProviderStatus) => provider.name).join(", ")}` : data.error || "Render request failed");
      await loadProject(selectedProject.id);
      return;
    }
    if (data.usage) setCreditBalance((current) => ({ ...(current || data.usage), ...data.usage }));
    setMessage(`${mode.replaceAll("_", " ")} queued`);
    await loadProject(selectedProject.id);
  }

  function setSetting<K extends keyof typeof settings>(key: K, value: (typeof settings)[K]) {
    const next = { ...settings, [key]: value };
    setSettings(next);
    saveSettings(next).catch(() => undefined);
  }

  const creditSummaryPanel = (
    <div className={cn("rounded-2xl border p-3", creditBlocked ? "border-amber-300/70 bg-amber-50 text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100" : studioTokens.soft)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] opacity-70">Estimated Cost</p>
          <p className="mt-1 text-2xl font-semibold">{creditLoading ? "..." : (creditEstimate?.credits ?? 0).toLocaleString()} <span className="text-sm font-medium opacity-65">Credits</span></p>
        </div>
        <div className="text-right text-[11px] leading-5 opacity-70">
          <p>{creditEstimate?.provider || "comfy_cloud"}</p>
          <p>{creditEstimate?.model || (activeNav === "image" ? imageSettings.imageModel : "Wan 2.x")}</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
        <div className={cn("rounded-xl border p-2", studioTokens.soft)}>
          <p className="opacity-60">User Credits</p>
          <p className="mt-1 font-semibold">{(creditBalance?.totalRemaining || 0).toLocaleString()}</p>
        </div>
        <div className={cn("rounded-xl border p-2", studioTokens.soft)}>
          <p className="opacity-60">After</p>
          <p className="mt-1 font-semibold">{Math.max(0, (creditBalance?.totalRemaining || 0) - (creditEstimate?.credits || 0)).toLocaleString()}</p>
        </div>
        <div className={cn("rounded-xl border p-2", studioTokens.soft)}>
          <p className="opacity-60">Time</p>
          <p className="mt-1 font-semibold">~{Math.ceil((creditEstimate?.processingSeconds || 0) / 60) || 1}m</p>
        </div>
      </div>
      {creditBlocked && (
        <div className="mt-3 rounded-xl border border-amber-300/60 bg-white/50 p-3 text-xs dark:border-amber-300/20 dark:bg-black/20">
          <p className="font-semibold">Not enough credits.</p>
          <p className="mt-1 opacity-75">{creditBlocked.message}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href="/billing" className="rounded-lg bg-violet-600 px-3 py-2 font-semibold text-white">Buy Credits</a>
            <a href="/settings/billing" className={cn("rounded-lg border px-3 py-2 font-semibold", studioTokens.soft)}>Upgrade Plan</a>
          </div>
        </div>
      )}
    </div>
  );

  const promptPanel = (
    <section className={cn("rounded-[22px] p-5", studioTokens.panel)}>
      <div className="mb-5 flex items-center gap-3">
        <span className="grid size-8 place-items-center rounded-full bg-violet-600 text-sm font-semibold text-white shadow-lg shadow-violet-600/30">1</span>
        <h2 className="text-base font-semibold">Choose your avatar</h2>
      </div>
      <div className="flex flex-wrap items-start gap-4">
        {avatarUrls.map((avatar, index) => (
          <button key={avatar} onClick={() => setSelectedAvatar(index)} className={cn("relative rounded-full p-1 transition hover:scale-105", selectedAvatar === index ? "bg-violet-500 shadow-lg shadow-violet-500/30" : "bg-transparent")}>
            <Image src={avatar} alt={`Avatar ${index + 1}`} width={64} height={64} unoptimized className="size-16 rounded-full object-cover ring-1 ring-white/20" />
            {selectedAvatar === index && <span className="absolute -bottom-1 -right-1 grid size-6 place-items-center rounded-full bg-violet-600 text-white"><Check className="size-3.5" /></span>}
          </button>
        ))}
        <button onClick={() => avatarInputRef.current?.click()} className={cn("grid size-16 place-items-center rounded-full border border-dashed transition hover:border-violet-400", theme === "dark" ? "border-white/20 bg-white/[0.03]" : "border-slate-300 bg-white")}>
          <Plus className="size-6" />
        </button>
        <input ref={avatarInputRef} type="file" accept="image/*" hidden onChange={(event) => void handleUpload("avatar", event.target.files)} />
        <div className="self-center text-xs font-medium">
          <button onClick={() => avatarInputRef.current?.click()} className={cn(studioTokens.muted, "hover:text-violet-400")}>Add Photo</button>
          {uploads.some((item) => item.type === "avatar") && <button onClick={() => { const next = uploads.filter((item) => item.type !== "avatar"); setUploads(next); setSelectedAvatar(0); void saveSettings(settings, next); }} className="ml-3 text-red-400 hover:text-red-300">Remove</button>}
        </div>
      </div>

      <div className="mt-10 mb-5 flex items-center gap-3">
        <span className="grid size-8 place-items-center rounded-full bg-violet-600 text-sm font-semibold text-white shadow-lg shadow-violet-600/30">2</span>
        <h2 className="text-base font-semibold">Describe your story</h2>
      </div>
      <div className={cn("rounded-2xl border p-4", theme === "dark" ? "border-white/10 bg-[#090f18]/78" : "border-slate-200 bg-white")}>
        <textarea
          ref={promptRef}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          maxLength={2000}
          className="min-h-[216px] w-full resize-none bg-transparent text-sm leading-6 text-slate-950 outline-none placeholder:text-slate-500 dark:text-white dark:placeholder:text-white/36"
          placeholder="Enter your story idea in any language..."
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className={cn("text-xs", studioTokens.muted)}>{prompt.length} / 2000</span>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setPrompt("")} disabled={!prompt} className={cn("h-9 rounded-xl border px-3 text-xs disabled:opacity-40", studioTokens.soft)}>Clear</button>
            <button onClick={() => setPrompt(fallbackPrompt())} className={cn("flex h-9 items-center gap-2 rounded-xl border px-3 text-xs", studioTokens.soft)}><Wand2 className="size-3.5" /> Use Example</button>
          </div>
        </div>
      </div>
      {promptHistory.length > 0 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {promptHistory.slice(0, 4).map((item) => <button key={item} onClick={() => setPrompt(item)} className={cn("max-w-[220px] shrink-0 truncate rounded-full border px-3 py-1.5 text-[11px]", studioTokens.soft)}>{item}</button>)}
        </div>
      )}

      <div className="mt-8 mb-5 flex items-center gap-3">
        <span className="grid size-8 place-items-center rounded-full bg-violet-600 text-sm font-semibold text-white shadow-lg shadow-violet-600/30">3</span>
        <h2 className="text-base font-semibold">Select style <span className={cn("font-normal", studioTokens.muted)}>(Optional)</span></h2>
      </div>
      <div className="flex flex-wrap gap-3">
        {styles.map((style) => (
          <button key={style} onClick={() => setSetting("styleLock", style)} className={cn("flex h-11 items-center gap-2 rounded-xl border px-4 text-xs font-semibold transition", settings.styleLock === style ? "border-violet-400 bg-violet-600 text-white shadow-lg shadow-violet-600/25" : `${studioTokens.soft} hover:border-violet-400/60`)}>
            {style === "3D Render" ? <Box className="size-3.5" /> : <ImageIcon className="size-3.5" />}
            {style}
          </button>
        ))}
      </div>
      <div className="mt-7 flex justify-end">
        <button onClick={runGeneration} disabled={!selectedProject || loading || !prompt.trim()} className="flex h-14 min-w-[190px] items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-violet-600 to-purple-600 px-6 text-sm font-semibold text-white shadow-xl shadow-violet-700/30 transition hover:scale-[1.015] disabled:opacity-45">
          {loading ? <RefreshCw className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          Generate Script
        </button>
      </div>
    </section>
  );

  const outputPanel = (
    <section className={cn("space-y-4 rounded-[22px] p-5", studioTokens.panel)}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Generated Script & Storyboard</h2>
        <p className={cn("mt-1 text-xs", studioTokens.muted)}>{localProvider?.message || "Local media providers will render when installed. Storyboard and prompts are ready."}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigator.clipboard?.writeText(latestGeneration?.enhancedPrompt || prompt)} className={cn("grid size-9 place-items-center rounded-xl border", studioTokens.soft)} title="Copy enhanced prompt"><Copy className="size-4" /></button>
          <button onClick={exportJson} disabled={!selectedProject} className={cn("grid size-9 place-items-center rounded-xl border disabled:opacity-40", studioTokens.soft)} title="Export JSON"><Upload className="size-4 rotate-180" /></button>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        {["Language", "Prompt", "Scenes", "Timeline"].map((label, index) => (
          <div key={label} className={cn("rounded-2xl border p-3", studioTokens.soft)}>
            <Check className={cn("mb-2 size-4", progress >= (index + 1) * 24 ? "text-emerald-400" : studioTokens.faint)} />
            <p className="text-xs font-medium">{label}</p>
          </div>
        ))}
      </div>
      <div className={cn("rounded-2xl border p-4 text-sm leading-6", studioTokens.soft)}>
        {latestGeneration?.enhancedPrompt || "Generate once to see the enhanced script, cinematic prompt, scenes, and timeline here."}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {scenes.length ? scenes.map((scene, index) => (
          <div key={scene.id || index} className={cn("rounded-2xl border p-4", studioTokens.soft)}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-violet-500 dark:text-violet-300">Scene {scene.order || index + 1} · {scene.durationSec}s · {settings.aspectRatio}</p>
                <h3 className="mt-2 font-semibold">{scene.title}</h3>
              </div>
              <button onClick={() => void sceneAction(scene, "delete")} className="text-red-400 hover:text-red-300" title="Delete scene"><Trash2 className="size-4" /></button>
            </div>
            <p className={cn("mt-3 line-clamp-4 text-xs leading-5", studioTokens.muted)}>{scene.prompt}</p>
            <div className="mt-3 flex flex-wrap gap-1.5 text-[10px]">
              {[scene.camera || settings.cameraMotion, scene.lighting || "Lighting", scene.emotion || "Mood"].map((tag) => <span key={tag} className="rounded-full bg-violet-500/12 px-2 py-1 text-violet-500 dark:text-violet-200">{tag}</span>)}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => { const next = window.prompt("Edit scene prompt", scene.prompt); if (next) void updateScene(scene, { prompt: next }); }} className={cn("rounded-lg border px-2 py-1 text-[11px]", studioTokens.soft)}>Edit</button>
              <button onClick={() => void sceneAction(scene, "duplicate")} className={cn("rounded-lg border px-2 py-1 text-[11px]", studioTokens.soft)}>Duplicate</button>
              <button onClick={() => void updateScene(scene, { durationSec: Math.max(1, scene.durationSec + 1) })} className={cn("rounded-lg border px-2 py-1 text-[11px]", studioTokens.soft)}>+1s</button>
            </div>
          </div>
        )) : templatePresets.slice(0, 2).map((template) => <button key={template.name} onClick={() => applyTemplate(template.name)} className={cn("rounded-2xl border border-dashed p-4 text-left text-sm", studioTokens.soft)}>{template.name}</button>)}
      </div>
      <div className={cn("flex h-16 items-center gap-2 overflow-x-auto rounded-2xl border p-2", studioTokens.soft)}>
        {timeline.length ? timeline.map((item, index) => <div key={`${item.scene}-${index}`} className="flex h-full min-w-[128px] items-center justify-center rounded-xl bg-gradient-to-r from-violet-600/70 to-cyan-400/30 px-3 text-xs font-medium text-white">{item.label}</div>) : <p className={cn("px-2 text-sm", studioTokens.muted)}>Timeline appears after generation.</p>}
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <button onClick={() => void requestRender("storyboard_images")} disabled={!selectedProject || !latestGeneration} className={cn("h-11 rounded-xl border text-sm font-semibold disabled:opacity-40", studioTokens.soft)}>Storyboard Images</button>
        <button onClick={() => void requestRender("draft_preview")} disabled={!selectedProject || !latestGeneration || Boolean(creditBlocked)} className={cn("h-11 rounded-xl border text-sm font-semibold disabled:opacity-40", studioTokens.soft)}>Instant Preview</button>
        <button onClick={() => void requestRender("final_render")} disabled={!selectedProject || !latestGeneration || Boolean(creditBlocked)} className="h-11 rounded-xl bg-violet-600 text-sm font-semibold text-white shadow-lg shadow-violet-600/25 disabled:opacity-40">Render Final</button>
      </div>
    </section>
  );

  const settingsPanel = (
    <aside className={cn("rounded-[18px] p-5", studioTokens.panel)}>
      <h2 className="mb-5 flex items-center gap-3 text-base font-semibold"><SlidersHorizontal className="size-5 text-violet-500 dark:text-violet-300" /> Generation Settings</h2>
      <div className="space-y-5">
        <label className={cn("block text-xs", studioTokens.muted)}>Model
          <select value={settings.model} onChange={(event) => setSetting("model", event.target.value)} className={cn("mt-2 h-11 w-full rounded-xl px-3 text-sm", studioTokens.input, "[color-scheme:light] dark:[color-scheme:dark]")}>
            <option>OpenRouter active model</option>
          </select>
        </label>
        <div>
          <p className={cn("mb-2 text-xs", studioTokens.muted)}>Resolution</p>
          <div className="grid grid-cols-2 gap-3">
            {resolutions.map((resolution) => (
              <button key={resolution.value} onClick={() => setSetting("resolution", resolution.value)} className={cn("h-16 rounded-xl border text-center transition", settings.resolution === resolution.value ? "border-violet-500 bg-violet-600 text-white shadow-lg shadow-violet-600/25" : `${studioTokens.soft} hover:border-violet-400/60`)}>
                <p className="text-sm font-semibold">{resolution.label}</p>
                <p className="mt-1 text-xs opacity-75">{resolution.sub}</p>
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className={cn("block text-xs", studioTokens.muted)}>Aspect Ratio
            <select value={settings.aspectRatio} onChange={(event) => setSetting("aspectRatio", event.target.value)} className={cn("mt-2 h-11 w-full rounded-xl px-3 text-sm", studioTokens.input, "[color-scheme:light] dark:[color-scheme:dark]")}>
              {ratios.map((ratio) => <option key={ratio}>{ratio}</option>)}
            </select>
          </label>
          <label className={cn("block text-xs", studioTokens.muted)}>Frame Rate (FPS)
            <select value={settings.fps} onChange={(event) => setSetting("fps", Number(event.target.value))} className={cn("mt-2 h-11 w-full rounded-xl px-3 text-sm", studioTokens.input, "[color-scheme:light] dark:[color-scheme:dark]")}>
              {fpsOptions.map((fps) => <option key={fps}>{fps}</option>)}
            </select>
          </label>
        </div>
        <div>
          <p className={cn("mb-2 text-xs", studioTokens.muted)}>Video Length <span className="float-right font-medium">{settings.durationSec}s</span></p>
          <div className="grid grid-cols-4 gap-2">
            {durationOptions.map((duration) => (
              <button
                key={duration}
                onClick={() => {
                  setDurationTouched(true);
                  setSetting("durationSec", duration);
                }}
                className={cn("h-10 rounded-xl border text-xs font-semibold transition", settings.durationSec === duration ? "border-violet-500 bg-violet-600 text-white shadow-lg shadow-violet-600/20" : studioTokens.soft)}
              >
                {duration === 60 ? "1 min" : `${duration}s`}
              </button>
            ))}
          </div>
        </div>
        {creditSummaryPanel}
        <div className="grid grid-cols-5 gap-2">
          {ratios.map((ratio) => (
            <button key={ratio} onClick={() => setSetting("aspectRatio", ratio)} className={cn("flex h-[70px] flex-col items-center justify-center gap-2 rounded-xl border text-xs transition", settings.aspectRatio === ratio ? "border-violet-500 bg-violet-600/12 text-violet-500 dark:text-violet-200" : `${studioTokens.soft} hover:border-violet-400/60`)}>
              <span className={cn("block rounded border-2", ratio === "9:16" || ratio === "3:4" ? "h-5 w-3" : ratio === "1:1" ? "size-4" : "h-3 w-5")} />
              {ratio}
            </button>
          ))}
        </div>
        <label className={cn("block text-xs", studioTokens.muted)}>Content Preference
          <select value={settings.contentPreference} onChange={(event) => setSetting("contentPreference", event.target.value)} className={cn("mt-2 h-11 w-full rounded-xl px-3 text-sm", studioTokens.input, "[color-scheme:light] dark:[color-scheme:dark]")}>
            <option>Auto</option><option>Realistic</option><option>Stylized</option><option>Product</option><option>Story</option>
          </select>
        </label>
        <label className={cn("block text-xs", studioTokens.muted)}>Camera Motion
          <select value={settings.cameraMotion} onChange={(event) => setSetting("cameraMotion", event.target.value)} className={cn("mt-2 h-11 w-full rounded-xl px-3 text-sm", studioTokens.input, "[color-scheme:light] dark:[color-scheme:dark]")}>
            {cameras.map((camera) => <option key={camera}>{camera}</option>)}
          </select>
        </label>
        <label className={cn("block text-xs", studioTokens.muted)}>Motion Strength <span className="float-right font-medium">{settings.motionStrength}</span>
          <input type="range" min={0} max={100} value={settings.motionStrength} onChange={(event) => setSetting("motionStrength", Number(event.target.value))} className="mt-3 w-full accent-violet-500" />
        </label>
        <label className={cn("block text-xs", studioTokens.muted)}>Consistency <span className="float-right font-medium">{settings.consistency}</span>
          <input type="range" min={0} max={100} value={settings.consistency} onChange={(event) => setSetting("consistency", Number(event.target.value))} className="mt-3 w-full accent-violet-500" />
        </label>
        <label className={cn("block text-xs", studioTokens.muted)}>Negative prompt
          <textarea value={settings.negativePrompt} onChange={(event) => setSetting("negativePrompt", event.target.value)} className={cn("mt-2 h-20 w-full resize-none rounded-xl p-3 text-sm", studioTokens.input)} />
        </label>
        <div>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Sparkles className="size-4 text-violet-500" /> Quick Add</h3>
          <div className="grid grid-cols-3 gap-2">
            {quickAdd.map((item) => (
              <button key={item.type} onClick={() => quickInputRefs.current[item.type]?.click()} className={cn("flex h-11 items-center justify-center gap-2 rounded-xl border text-xs font-medium", studioTokens.soft)}>
                <item.icon className="size-4" /> {item.label}
                <input ref={(node) => { quickInputRefs.current[item.type] = node; }} type="file" accept={item.accept} hidden onChange={(event) => void handleUpload(item.type, event.target.files)} />
              </button>
            ))}
          </div>
          {uploads.filter((item) => item.type !== "avatar").length > 0 && (
            <div className="mt-3 space-y-2">
              {uploads.filter((item) => item.type !== "avatar").map((item) => <div key={item.id} className={cn("flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-xs", studioTokens.soft)}><span className="min-w-0 flex-1 truncate">{item.name}</span><span className={studioTokens.faint}>{formatBytes(item.sizeBytes)}</span><button onClick={() => { const next = uploads.filter((upload) => upload.id !== item.id); setUploads(next); void saveSettings(settings, next); }}><X className="size-3.5" /></button></div>)}
            </div>
          )}
        </div>
      </div>
    </aside>
  );

  const referencePanel = (
    <aside className={cn("rounded-[18px] p-5", studioTokens.panel)}>
      <h2 className="mb-5 flex items-center gap-3 text-base font-semibold"><Play className="size-5 text-violet-500" /> Video - Reference</h2>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 dark:border-white/10 dark:bg-[#080d16]">
        {referenceAsset?.dataUrl ? (
          referenceAsset.type === "clip" ? <video src={referenceAsset.dataUrl} className="h-44 w-full object-cover" controls /> : <Image src={referenceAsset.dataUrl} alt={referenceAsset.name} width={320} height={176} unoptimized className="h-44 w-full object-cover" />
        ) : (
          <div className="relative h-44 overflow-hidden bg-[radial-gradient(circle_at_30%_25%,rgba(124,92,255,.55),transparent_24%),linear-gradient(135deg,#102033,#050911)]">
            <Image src={avatarUrls[selectedAvatar] || avatarUrls[0]} alt="Selected avatar" width={96} height={96} unoptimized className="absolute bottom-4 left-1/2 size-24 -translate-x-1/2 rounded-full object-cover ring-2 ring-white/20" />
            <div className="absolute inset-x-5 bottom-4 h-16 rounded-full bg-cyan-400/10 blur-2xl" />
          </div>
        )}
      </div>
      <div className="mt-4">
        <h3 className="font-semibold">@{session?.user?.name?.split(" ")?.[0]?.toLowerCase() || "meldex"}</h3>
        <p className={cn("mt-2 line-clamp-4 text-sm leading-6", studioTokens.muted)}>{latestGeneration?.storyboardJson?.summary || "Cinematic storyboard preview appears here after generation. Upload a frame or clip to use it as a visual reference."}</p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-lg bg-slate-200 px-2 py-1 dark:bg-white/8">Wan2.7</span>
          <span className="rounded-lg bg-slate-200 px-2 py-1 dark:bg-white/8">{settings.resolution.toUpperCase()}</span>
          <span className="rounded-lg bg-slate-200 px-2 py-1 dark:bg-white/8">{settings.aspectRatio}</span>
          <span className="rounded-lg bg-slate-200 px-2 py-1 dark:bg-white/8">{settings.durationSec}s</span>
        </div>
        <p className={cn("mt-4 text-xs", studioTokens.muted)}>Creation Time</p>
        <p className={cn("mt-1 text-sm", studioTokens.muted)}>{new Date(latestGeneration?.createdAt || Date.now()).toLocaleString()}</p>
        <div className="mt-5 grid grid-cols-[1fr_1fr_44px] gap-2">
          <button onClick={() => latestGeneration?.enhancedPrompt && setPrompt(latestGeneration.enhancedPrompt)} disabled={!latestGeneration?.enhancedPrompt} className={cn("h-11 rounded-xl border text-sm font-medium disabled:opacity-40", studioTokens.soft)}>Use</button>
          <button onClick={runGeneration} disabled={!selectedProject || loading} className={cn("h-11 rounded-xl border text-sm font-medium disabled:opacity-40", studioTokens.soft)}>{loading ? "Running" : "Rerun"}</button>
          <button onClick={() => setUploads(uploads.filter((item) => item.type !== "frame" && item.type !== "clip"))} className="grid h-11 place-items-center rounded-xl border border-violet-500/35 text-violet-500"><Trash2 className="size-4" /></button>
        </div>
      </div>
    </aside>
  );

  const imageCenterPanel = (
    <section className="mx-auto w-full max-w-[1500px]">
      <div className="grid gap-3 xl:grid-cols-[405px_minmax(0,1fr)]">
        <section className={cn("order-2 flex min-h-[620px] flex-col rounded-[22px] p-2 xl:order-2", studioTokens.panel)}>
          <div className="mb-1.5 flex shrink-0 flex-wrap items-center justify-between gap-2 px-1">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-white/45">Image Output</h2>
              <p className={cn("mt-0.5 text-[11px]", studioTokens.muted)}>
                {imageResults[0]?.url ? `${imageResults[0].model || imageSettings.imageModel} · ${imageResults[0].aspectRatio || selectedImageScale.value}` : "Generated image preview appears here."}
              </p>
            </div>
            <span className={cn("rounded-full border px-2.5 py-1 text-[11px] font-medium", studioTokens.soft)}>{selectedImageScale.size}</span>
          </div>

          {imageLoading ? (
            <div className="relative min-h-[560px] flex-1 overflow-hidden rounded-[20px] border border-white/10 bg-[#090909] p-5 text-white shadow-2xl shadow-violet-950/30">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(139,92,246,0.34),transparent_32%),radial-gradient(circle_at_78%_18%,rgba(217,70,239,0.18),transparent_30%),linear-gradient(135deg,rgba(255,255,255,.08),transparent_36%)]" />
              <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
              <div className="relative grid h-full place-items-center text-center">
                <div>
                  <div className="mx-auto grid size-16 place-items-center rounded-3xl bg-white/10 shadow-2xl shadow-violet-500/30 backdrop-blur">
                    <Sparkles className="size-7 animate-pulse text-violet-200" />
                  </div>
                  <p className="mt-6 text-2xl font-semibold">Generating Image...</p>
                  <p className="mt-2 text-sm text-white/62">Creating masterpiece with {imageSettings.imageModel}</p>
                  <div className="mx-auto mt-7 h-2 w-64 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full w-2/3 animate-pulse rounded-full bg-gradient-to-r from-violet-400 to-fuchsia-300" />
                  </div>
                  <p className="mt-4 text-xs text-white/42">Estimated time depends on Comfy Cloud queue and workflow runtime.</p>
                </div>
              </div>
            </div>
          ) : imageResults[0]?.url ? (
            <article className="flex min-h-[560px] flex-1 flex-col overflow-hidden rounded-[20px] border border-slate-200/70 bg-white/75 shadow-2xl shadow-slate-950/5 dark:border-white/10 dark:bg-white/[0.035] dark:shadow-black/30">
              <div className="relative grid min-h-[460px] flex-1 place-items-center bg-black">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageResults[0].url} alt="Generated image" className="h-full max-h-full w-full object-contain" />
                <button
                  onClick={() => setFullscreenImage(imageResults[0])}
                  className="absolute right-4 top-4 grid size-11 place-items-center rounded-2xl border border-white/15 bg-black/45 text-white shadow-xl backdrop-blur transition hover:bg-black/65"
                  aria-label="Open image fullscreen"
                >
                  <Maximize2 className="size-4" />
                </button>
              </div>
              <div className="flex shrink-0 flex-col gap-3 p-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{imageResults[0].model || imageSettings.imageModel}</p>
                  <p className={cn("mt-1 line-clamp-2 text-xs leading-5", studioTokens.muted)}>{imageResults[0].enhancedPrompt}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <a href={imageResults[0].url} download={`meldex-${Date.now()}.png`} className={cn("flex h-10 items-center gap-2 rounded-xl border px-3 text-xs font-semibold", studioTokens.soft)}><Download className="size-3.5" /> Download</a>
                  <button onClick={() => navigator.clipboard?.writeText(imageResults[0].enhancedPrompt)} className={cn("flex h-10 items-center gap-2 rounded-xl border px-3 text-xs font-semibold", studioTokens.soft)}><Copy className="size-3.5" /> Copy Prompt</button>
                  <button onClick={() => void runImageGeneration()} className={cn("flex h-10 items-center gap-2 rounded-xl border px-3 text-xs font-semibold", studioTokens.soft)}><RefreshCw className="size-3.5" /> Regenerate</button>
                  <button onClick={() => void reuseImageAsReference(imageResults[0])} className={cn("flex h-10 items-center gap-2 rounded-xl border px-3 text-xs font-semibold", studioTokens.soft)}><ImageIcon className="size-3.5" /> Use as Reference</button>
                  <button onClick={() => void deleteImageResult(imageResults[0])} className="flex h-10 items-center gap-2 rounded-xl border border-red-300/70 bg-red-50 px-3 text-xs font-semibold text-red-700 transition hover:bg-red-100 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-200"><Trash2 className="size-3.5" /> Delete</button>
                </div>
              </div>
            </article>
          ) : (
            <div className={cn("relative grid min-h-[560px] flex-1 place-items-center overflow-hidden rounded-[20px] border border-dashed text-center", studioTokens.soft)}>
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(139,92,246,.16),transparent_28%),radial-gradient(circle_at_78%_72%,rgba(14,165,233,.12),transparent_25%)]" />
              <div className="relative max-w-sm px-6">
                <div className="mx-auto grid size-16 place-items-center rounded-3xl bg-violet-500/10 text-violet-500">
                  <ImageIcon className="size-8" />
                </div>
                <p className="mt-5 text-lg font-semibold">No image generated yet</p>
                <p className={cn("mt-2 text-sm leading-6", studioTokens.muted)}>Write your prompt on the right and Meldex will render a real Comfy Cloud image here.</p>
              </div>
            </div>
          )}
        </section>

        <aside className={cn("order-1 flex h-fit flex-col rounded-[22px] p-2.5 xl:order-1", studioTokens.panel)}>
          <div className="mb-2 shrink-0">
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-white/45"><SlidersHorizontal className="size-4 text-violet-500" /> Image Controls</h2>
          </div>

          <div className="space-y-2">
            <label className="block">
              <span className={cn("text-xs font-medium uppercase tracking-[0.18em]", studioTokens.faint)}>Model</span>
              <select
                value={imageSettings.imageModel}
                onChange={(event) => {
                  setImageError("");
                  setImageSetting("imageModel", event.target.value);
                }}
                disabled={imageLoading || imageEnhancing}
                style={{
                  color: theme === "dark" ? "#ffffff" : "#0f172a",
                  backgroundColor: theme === "dark" ? "#0f1720" : "#ffffff",
                }}
                className={cn("mt-1 h-10 w-full appearance-none rounded-xl px-3 text-sm font-medium", studioTokens.input)}
                aria-label="Image generation model"
              >
                {imageModels.map((model) => <option key={model} className="bg-white text-slate-950 dark:bg-[#0f1720] dark:text-white">{model}</option>)}
              </select>
              <span className={cn("mt-1 block text-[11px]", studioTokens.muted)}>Provider: Comfy Cloud</span>
            </label>

            <div>
              <span className={cn("text-xs font-medium uppercase tracking-[0.18em]", studioTokens.faint)}>Image scale</span>
              <div className="mt-1 grid grid-cols-3 gap-1.5">
                {imageScalePresets.map((scale) => {
                  const active = selectedImageScale.value === scale.value;
                  return (
                    <button
                      key={scale.value}
                      onClick={() => {
                        setImageError("");
                        setImageSetting("aspectRatio", scale.value);
                      }}
                      disabled={imageLoading || imageEnhancing}
                      className={cn(
                        "rounded-xl border px-2.5 py-1.5 text-left transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50",
                        active ? "border-violet-500 bg-violet-600 text-white shadow-lg shadow-violet-600/20" : studioTokens.soft
                      )}
                    >
                      <span className="block text-xs font-semibold">{scale.value}</span>
                      <span className={cn("mt-0.5 block text-[11px]", active ? "text-white/72" : studioTokens.muted)}>{scale.label}</span>
                    </button>
                  );
                })}
              </div>
              <p className={cn("mt-0.5 text-[11px]", studioTokens.muted)}>{selectedImageScale.size}. Unsupported sizes return warning.</p>
            </div>

            <label className="block">
              <span className={cn("text-xs font-medium uppercase tracking-[0.18em]", studioTokens.faint)}>Prompt</span>
              <div className="relative mt-1">
                <textarea
                  ref={imagePromptRef}
                  value={imagePrompt}
                  onChange={(event) => {
                    setImagePrompt(event.target.value);
                    if (imageError) setImageError("");
                  }}
                  onBlur={() => saveImageState({ prompt: imagePrompt }).catch(() => undefined)}
                  onKeyDown={(event) => {
                    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                      event.preventDefault();
                      void runImageGeneration();
                    }
                  }}
                  disabled={imageLoading || imageEnhancing}
                  style={{
                    color: theme === "dark" ? "#ffffff" : "#0f172a",
                    backgroundColor: theme === "dark" ? "#0f1720" : "#ffffff",
                  }}
                  className={cn("h-[100px] min-h-0 w-full resize-none rounded-xl p-3 pr-12 text-sm leading-5 !placeholder:text-slate-500 dark:!placeholder:text-white/45", studioTokens.input)}
                  placeholder="Describe the image you want to generate..."
                  aria-label="Image prompt"
                />
                {imagePrompt && !imageLoading && !imageEnhancing && (
                  <button
                    onClick={() => {
                      setImagePrompt("");
                      setImageError("");
                    }}
                    className={cn("absolute right-4 top-4 grid size-9 place-items-center rounded-full", studioTokens.soft)}
                    aria-label="Clear prompt"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>
              <span className={cn("mt-0.5 block text-[11px]", studioTokens.muted)}>{imagePrompt.length} characters · Cmd/Ctrl + Enter</span>
            </label>
          </div>

          <div className="mt-2">
            {creditSummaryPanel}
          </div>

          <div className="mt-2 shrink-0 space-y-1.5">
            <div className="grid gap-2">
              <button
                onClick={enhanceCurrentImagePrompt}
                disabled={imageLoading || imageEnhancing || !imagePrompt.trim()}
                className={cn("flex h-10 items-center justify-center gap-2 rounded-xl border px-4 text-xs font-semibold transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45", studioTokens.soft, "text-slate-950 dark:text-white")}
              >
                {imageEnhancing ? <RefreshCw className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
                Enhance Prompt
              </button>
              <button
                onClick={runImageGeneration}
                disabled={imageLoading || imageEnhancing || !imagePrompt.trim() || Boolean(creditBlocked)}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 via-fuchsia-600 to-purple-600 px-4 text-sm font-semibold text-white shadow-2xl shadow-violet-700/25 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {imageLoading ? <RefreshCw className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                Generate Image
              </button>
            </div>

            {imageSettings.imageModel === "Future Models" && (
              <div className="rounded-2xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200">
                Future Models are not enabled yet. Pick FLUX.1 Schnell, FLUX Dev, SDXL, or Stable Diffusion XL.
              </div>
            )}
            {imageError && (
              <div className="rounded-2xl border border-red-300/70 bg-red-50 px-4 py-4 text-sm text-red-700 shadow-sm dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-200">
                <p className="font-semibold">Image generation needs attention</p>
                <p className="mt-1 leading-6">{imageError}</p>
                <button onClick={() => void runImageGeneration()} disabled={imageLoading || !imagePrompt.trim()} className="mt-3 h-9 rounded-xl bg-red-600 px-4 text-xs font-semibold text-white disabled:opacity-50">Retry</button>
              </div>
            )}
          </div>
        </aside>
      </div>
    </section>
  );

  return (
    <div className={cn(theme === "dark" && "dark")}>
      <div className={cn("min-h-screen overflow-hidden transition-colors", studioTokens.app)}>
        <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(124,92,255,.16),transparent_26%),radial-gradient(circle_at_90%_20%,rgba(0,208,255,.08),transparent_20%)] dark:bg-[radial-gradient(circle_at_50%_0%,rgba(124,92,255,.16),transparent_26%),radial-gradient(circle_at_90%_20%,rgba(0,208,255,.08),transparent_20%)]" />
        <header className={cn("relative z-20 flex items-center justify-between border-b px-6", activeNav === "image" ? "h-14" : "h-20", studioTokens.line, theme === "dark" ? "bg-[#050911]/88" : "bg-white/88", "backdrop-blur-xl")}>
          <div className="flex items-center gap-7">
            <a href="/dashboard" className="flex items-center gap-3">
              <span className={cn("grid place-items-center rounded-xl bg-violet-600 text-white shadow-lg shadow-violet-600/30", activeNav === "image" ? "size-8" : "size-9")}><Sparkles className="size-5" /></span>
              <span className={cn("font-bold tracking-tight", activeNav === "image" ? "text-xl" : "text-2xl")}>Meldex AI</span>
            </a>
            <div className="hidden items-center gap-3 md:flex">
              <span className="grid size-8 place-items-center rounded-xl bg-violet-600/15 text-violet-500">{activeNav === "image" ? <Frame className="size-4" /> : <Clapperboard className="size-4" />}</span>
              <span className={cn("font-semibold", activeNav === "image" ? "text-base" : "text-lg")}>{activeNav === "image" ? "AI Studio / Generate Image" : "AI Studio"}</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className={cn("grid place-items-center rounded-full border", activeNav === "image" ? "size-9" : "size-11", studioTokens.soft)} title="Switch theme">{theme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}</button>
            <button className={cn("relative grid place-items-center rounded-full border", activeNav === "image" ? "size-9" : "size-11", studioTokens.soft)} title="Notifications"><Bell className="size-5" /><span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-violet-600 text-[10px] font-bold text-white">3</span></button>
            <Image src={avatarUrls[selectedAvatar] || avatarUrls[0]} alt="Profile" width={44} height={44} unoptimized className={cn("rounded-full object-cover ring-2 ring-violet-500/40", activeNav === "image" ? "size-9" : "size-11")} />
            <button onClick={renameProject} className="hidden items-center gap-2 text-sm font-semibold md:flex">{session?.user?.name || "Dhaval"} <ChevronDown className="size-4" /></button>
          </div>
        </header>
        <div className={cn("relative z-10 grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)]", activeNav === "image" ? "min-h-[calc(100vh-56px)]" : "min-h-[calc(100vh-80px)]")}>
          <aside className={cn("hidden border-r p-5 lg:flex lg:flex-col", studioTokens.line, theme === "dark" ? "bg-[#070c14]/80" : "bg-white/78", "backdrop-blur-xl")}>
            <nav className="space-y-3">
              {navItems.map((item) => (
                <button key={item.key} onClick={() => { setActiveNav(item.key); if (item.key === "projects") void loadProjects(); if (item.key === "templates") setMobileTab("create"); }} className={cn("flex h-14 w-full items-center gap-4 rounded-xl px-4 text-left text-sm font-medium transition", activeNav === item.key ? "bg-violet-600/14 text-violet-500 dark:text-violet-300" : `${studioTokens.muted} hover:bg-violet-600/10 hover:text-violet-500`)}>
                  <item.icon className="size-5" /> {item.label}
                </button>
              ))}
            </nav>
            <div className="mt-auto space-y-4">
              <button className={cn("flex h-10 items-center gap-3 text-sm", studioTokens.muted)}><HelpCircle className="size-5" /> Help & Docs</button>
              <button onClick={() => setActiveNav("settings")} className={cn("flex h-10 items-center gap-3 text-sm", studioTokens.muted)}><Settings2 className="size-5" /> Settings</button>
              <div className={cn("rounded-xl p-4", studioTokens.panel)}>
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-violet-600/15 text-violet-500"><Aperture className="size-5" /></span>
                  <div><p className="text-sm font-semibold">Meldex Pro</p><p className={cn("text-xs", studioTokens.muted)}>Unlimited generations</p></div>
                </div>
                <a href="/billing" className="mt-4 flex h-10 items-center justify-center rounded-lg bg-violet-600 text-sm font-semibold text-white">Upgrade Plan</a>
              </div>
              <button className={cn("ml-auto grid size-9 place-items-center rounded-xl", studioTokens.soft)}><PanelLeftClose className="size-4" /></button>
            </div>
          </aside>
          <main className={cn("min-w-0", activeNav === "image" ? "p-2.5 xl:p-3" : "p-4 xl:p-6")}>
            {activeNav !== "image" && <div className="mb-5 flex flex-wrap items-center gap-2 lg:hidden">
              {["create", "settings", "storyboard", "assets"].map((tab) => <button key={tab} onClick={() => setMobileTab(tab)} className={cn("rounded-full border px-3 py-1.5 text-xs capitalize", mobileTab === tab ? "border-violet-500 bg-violet-600 text-white" : studioTokens.soft)}>{tab}</button>)}
            </div>}
            {activeNav === "image" ? (
              <div className="h-full min-w-0 overflow-hidden">
                {imageCenterPanel}
              </div>
            ) : (
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_344px_278px]">
                <section className={cn("min-w-0 space-y-4", mobileTab !== "create" && "hidden lg:block")}>
                  <div className="px-3 pt-2">
                    <div>
                      <h1 className="text-3xl font-bold tracking-tight">AI Studio</h1>
                      <p className={cn("mt-3 text-sm", studioTokens.muted)}>Describe your idea and AI will turn it into a cinematic video.</p>
                      <p className={cn("mt-2 text-xs", studioTokens.faint)}>{message}</p>
                    </div>
                  </div>
                  {activeNav === "projects" && (
                    <div className={cn("rounded-2xl p-4", studioTokens.panel)}>
                      <div className="mb-3 flex gap-2"><div className={cn("flex h-10 flex-1 items-center gap-2 rounded-xl border px-3", studioTokens.soft)}><Search className="size-4" /><input value={projectSearch} onChange={(event) => setProjectSearch(event.target.value)} placeholder="Search projects" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></div><button onClick={createProject} className="rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white">New</button></div>
                      <div className="grid gap-2 md:grid-cols-2">
                        {filteredProjects.map((project) => <button key={project.id} onClick={() => { void loadProject(project.id); setActiveNav("studio"); }} className={cn("rounded-xl border p-3 text-left", selectedProjectId === project.id ? "border-violet-500 bg-violet-600/12" : studioTokens.soft)}><p className="truncate text-sm font-semibold">{project.name}</p><p className={cn("mt-1 text-xs", studioTokens.muted)}>{project._count?.generations || 0} generations · {timeAgo(project.updatedAt)}</p></button>)}
                      </div>
                    </div>
                  )}
                  {promptPanel}
                  {false && outputPanel}
                </section>
                <div className={cn("space-y-4", mobileTab !== "settings" && "hidden xl:block")}>{settingsPanel}</div>
                <div className={cn("space-y-4", mobileTab !== "assets" && "hidden xl:block")}>{referencePanel}</div>
              </div>
            )}
          </main>
        </div>
        {fullscreenImage?.url && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/82 p-4 backdrop-blur-xl" role="dialog" aria-modal="true" aria-label="Generated image fullscreen">
            <button onClick={() => setFullscreenImage(null)} className="absolute right-5 top-5 grid size-11 place-items-center rounded-full border border-white/15 bg-white/10 text-white" aria-label="Close fullscreen image">
              <X className="size-5" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fullscreenImage.url} alt="Generated image fullscreen" className="max-h-[88vh] max-w-[94vw] rounded-[24px] object-contain shadow-2xl shadow-black" />
          </div>
        )}
      </div>
    </div>
  );
}
