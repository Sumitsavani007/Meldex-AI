"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useSession } from "next-auth/react";
import {
  Aperture,
  CheckCircle2,
  Clapperboard,
  Copy,
  Film,
  ImageIcon,
  Mic2,
  Music2,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Upload,
  Wand2,
} from "lucide-react";
import { UserPanelShell } from "@/components/user-panel-shell";
import { cn } from "@/lib/utils";

type StudioProject = {
  id: string;
  name: string;
  description?: string | null;
  styleLock?: string | null;
  resolution: string;
  durationSec: number;
  aspectRatio: string;
  updatedAt: string;
  generations?: StudioGeneration[];
  _count?: { assets: number; generations: number; scenes: number };
};

type StudioGeneration = {
  id: string;
  status: string;
  sourcePrompt: string;
  detectedLanguage?: string | null;
  enhancedPrompt?: string | null;
  storyboardJson?: StudioPlan | null;
  createdAt: string;
  scenes?: StudioScene[];
};

type StudioScene = {
  id: string;
  order: number;
  title: string;
  prompt: string;
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
  scenes?: StudioScene[];
  timeline?: Array<{ scene: number; start: number; end: number; label: string }>;
};

type StreamEvent = {
  sequence: number;
  type: string;
  message: string;
  payload?: Record<string, unknown>;
  timestamp: string;
};

const studioNav = [
  { label: "Projects", icon: Clapperboard },
  { label: "Recent", icon: RefreshCw },
  { label: "Templates", icon: Film },
  { label: "Assets", icon: ImageIcon },
  { label: "Brand Kit", icon: Aperture },
  { label: "Uploads", icon: Upload },
  { label: "AI Voices", icon: Mic2 },
  { label: "Music", icon: Music2 },
  { label: "Settings", icon: Settings2 },
];

const templates = ["Cinematic Product Reveal", "Gujarati Festival Story", "Luxury Fashion Reel", "YouTube Explainer", "TikTok Hook Pack"];
const styles = ["Cinematic", "Realistic", "Anime", "Pixar", "Cyberpunk", "3D", "Fantasy", "Oil Painting"];
const cameras = ["Dolly", "Drone", "Orbit", "Tracking", "Handheld", "Steadicam", "Zoom", "Tilt"];
const ratios = ["16:9", "9:16", "1:1", "4:5", "21:9"];

function timeAgo(value?: string) {
  if (!value) return "now";
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.max(1, Math.floor(diff / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function fallbackPrompt() {
  return "એક છોકરો વરસાદમાં દોડી રહ્યો છે, કેમેરા ધીમે ધીમે ઉપર જાય છે, વાદળો ખૂલે છે અને સૂર્ય નીકળે છે. Cinematic, emotional, premium.";
}

export default function StudioPage() {
  const { status } = useSession({ required: true });
  const [projects, setProjects] = useState<StudioProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedProject, setSelectedProject] = useState<StudioProject | null>(null);
  const [prompt, setPrompt] = useState(fallbackPrompt());
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("Ready");
  const [settings, setSettings] = useState({
    resolution: "1080p",
    durationSec: 8,
    aspectRatio: "16:9",
    fps: 24,
    seed: "",
    negativePrompt: "low quality, blurry, distorted faces, watermark",
    motionStrength: 56,
    cameraMotion: "Dolly",
    styleLock: "Cinematic",
    consistency: 74,
  });

  const latestGeneration = selectedProject?.generations?.[0];
  const scenes = latestGeneration?.scenes || latestGeneration?.storyboardJson?.scenes || [];
  const timeline = latestGeneration?.storyboardJson?.timeline || scenes.map((scene, index) => ({ scene: index + 1, start: index * 4, end: (index + 1) * 4, label: scene.title }));

  async function loadProjects(projectId = selectedProjectId) {
    const response = await fetch("/api/studio/projects", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to load AI Studio");
    const loaded = data.projects || [];
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
    setSelectedProject(data.project);
    setSelectedProjectId(id);
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
  }

  async function runGeneration() {
    if (!selectedProject || !prompt.trim() || loading) return;
    setLoading(true);
    setEvents([]);
    setMessage("Starting AI Studio pipeline");
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
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "AI Studio generation failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (status !== "authenticated") return;
    loadProjects().catch((error) => setMessage(error instanceof Error ? error.message : "Unable to load AI Studio"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const progress = useMemo(() => {
    if (!loading && latestGeneration?.status === "COMPLETED") return 100;
    if (!events.length) return 0;
    const map: Record<string, number> = {
      request_received: 8,
      language_detection: 18,
      prompt_enhancement: 32,
      scene_breakdown: 48,
      storyboard_ready: 68,
      shot_planner: 80,
      timeline_updated: 90,
      preview_ready: 96,
      done: 100,
    };
    return map[events.at(-1)?.type || ""] || 12;
  }, [events, loading, latestGeneration?.status]);

  return (
    <UserPanelShell title="AI Studio" eyebrow="Meldex Studio" description="Cinematic prompt enhancement, storyboard planning, timeline editing, and media project control.">
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#070812] text-white shadow-2xl shadow-violet-950/20">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(124,92,255,0.32),transparent_28%),radial-gradient(circle_at_80%_8%,rgba(0,208,255,0.18),transparent_24%),radial-gradient(circle_at_60%_90%,rgba(255,92,180,0.18),transparent_26%)]" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.08]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.8) 1px, transparent 1px)", backgroundSize: "42px 42px" }} />
        <div className="relative grid min-h-[calc(100vh-154px)] grid-cols-[220px_minmax(0,1fr)_320px]">
          <aside className="border-r border-white/10 bg-white/[0.035] p-4 backdrop-blur-xl">
            <div className="mb-5 flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-2xl bg-violet-500 shadow-lg shadow-violet-500/30"><Clapperboard className="size-5" /></span>
              <div>
                <p className="text-sm font-semibold">Meldex AI Studio</p>
                <p className="text-[11px] text-white/45">Media creation OS</p>
              </div>
            </div>
            <button onClick={createProject} className="mb-4 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-white text-sm font-semibold text-[#080912] transition hover:scale-[1.01]"><Plus className="size-4" /> New project</button>
            <nav className="space-y-1">
              {studioNav.map((item, index) => <button key={item.label} className={cn("flex h-9 w-full items-center gap-3 rounded-xl px-3 text-left text-[13px] transition", index === 0 ? "bg-white/12 text-white" : "text-white/62 hover:bg-white/8 hover:text-white")}><item.icon className="size-4" />{item.label}</button>)}
            </nav>
            <div className="mt-6">
              <div className="mb-2 flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/55"><Search className="size-3.5" /> Search projects</div>
              <div className="space-y-2">
                {projects.length ? projects.slice(0, 5).map((project) => (
                  <button key={project.id} onClick={() => loadProject(project.id)} className={cn("w-full rounded-xl border p-3 text-left transition", selectedProjectId === project.id ? "border-violet-400/50 bg-violet-400/12" : "border-white/10 bg-white/[0.035] hover:bg-white/8")}>
                    <div className="truncate text-xs font-semibold">{project.name}</div>
                    <div className="mt-1 text-[11px] text-white/45">{project._count?.generations || 0} generations · {timeAgo(project.updatedAt)}</div>
                  </button>
                )) : <p className="rounded-xl border border-white/10 p-3 text-xs text-white/45">Create your first Studio project.</p>}
              </div>
            </div>
          </aside>

          <main className="min-w-0 p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">{selectedProject?.name || "AI Studio"}</h1>
                <p className="text-sm text-white/52">{message}</p>
              </div>
              <div className="rounded-full border border-white/10 bg-white/8 px-3 py-1.5 text-xs text-white/65">OpenRouter · Text to Video planning</div>
            </div>

            <section className="overflow-hidden rounded-3xl border border-white/10 bg-black/30 shadow-2xl shadow-black/40">
              <div className="relative min-h-[340px] p-6">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(124,92,255,.34),transparent_32%)]" />
                <div className="relative flex h-full min-h-[300px] flex-col justify-between">
                  <div className="flex items-start justify-between">
                    <div className="rounded-2xl border border-white/10 bg-white/8 px-4 py-3 backdrop-blur">
                      <p className="text-xs uppercase tracking-[0.2em] text-violet-200/80">Canvas preview</p>
                      <p className="mt-2 max-w-xl text-3xl font-semibold leading-tight">{latestGeneration?.storyboardJson?.summary || "Turn any Gujarati, Hindi, English, or mixed prompt into a cinematic storyboard."}</p>
                    </div>
                    <div className="grid size-16 place-items-center rounded-3xl bg-white text-[#070812]"><Film className="size-7" /></div>
                  </div>
                  <div>
                    <div className="mb-3 h-2 overflow-hidden rounded-full bg-white/10"><motion.div className="h-full rounded-full bg-gradient-to-r from-violet-400 via-fuchsia-300 to-cyan-300" animate={{ width: `${progress}%` }} /></div>
                    <div className="grid grid-cols-4 gap-3">
                      {["Language", "Storyboard", "Timeline", "Export"].map((label, index) => <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.055] p-3"><CheckCircle2 className={cn("mb-2 size-4", progress >= (index + 1) * 24 ? "text-emerald-300" : "text-white/24")} /><p className="text-xs text-white/70">{label}</p></div>)}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="mt-4 grid grid-cols-[minmax(0,1.1fr)_minmax(320px,.9fr)] gap-4">
              <div className="rounded-3xl border border-white/10 bg-white/[0.045] p-4 backdrop-blur-xl">
                <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Prompt</h2><button onClick={() => setPrompt(fallbackPrompt())} className="text-xs text-violet-200 hover:text-white">Use Gujarati sample</button></div>
                <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} className="h-32 w-full resize-none rounded-2xl border border-white/10 bg-black/24 p-4 text-sm leading-6 outline-none transition focus:border-violet-300/60" placeholder="Describe any video idea in Gujarati, Hindi, English, or mixed language..." />
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex gap-2">{templates.slice(0, 3).map((item) => <button key={item} onClick={() => setPrompt(item)} className="rounded-full border border-white/10 px-3 py-1.5 text-[11px] text-white/60 hover:bg-white/8 hover:text-white">{item}</button>)}</div>
                  <button onClick={runGeneration} disabled={!selectedProject || loading || !prompt.trim()} className="flex h-11 items-center gap-2 rounded-2xl bg-white px-5 text-sm font-semibold text-[#070812] transition hover:scale-[1.015] disabled:opacity-45">{loading ? <RefreshCw className="size-4 animate-spin" /> : <Play className="size-4 fill-current" />} Generate</button>
                </div>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/[0.045] p-4">
                <h2 className="mb-3 font-semibold">Live pipeline</h2>
                <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                  {events.length ? events.map((event) => <div key={event.sequence} className="flex items-start gap-3 rounded-2xl bg-black/20 p-3 text-xs"><span className="mt-0.5 grid size-5 place-items-center rounded-full bg-violet-400/20 text-violet-100">{event.sequence}</span><div><p className="font-medium">{event.message}</p><p className="text-white/42">{event.type.replaceAll("_", " ")}</p></div></div>) : <p className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-white/45">Generation events stream here in realtime.</p>}
                </div>
              </div>
            </section>

            <section className="mt-4 rounded-3xl border border-white/10 bg-white/[0.045] p-4">
              <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Story timeline</h2><span className="text-xs text-white/45">{scenes.length || 0} editable scenes</span></div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {scenes.length ? scenes.map((scene, index) => <div key={scene.id || index} className="rounded-2xl border border-white/10 bg-black/24 p-4"><p className="text-xs text-violet-200">Scene {scene.order || index + 1} · {scene.durationSec}s</p><h3 className="mt-2 font-semibold">{scene.title}</h3><p className="mt-2 line-clamp-4 text-xs leading-5 text-white/55">{scene.prompt}</p><div className="mt-3 flex flex-wrap gap-1.5 text-[10px] text-white/50"><span className="rounded-full bg-white/8 px-2 py-1">{scene.camera || "Camera"}</span><span className="rounded-full bg-white/8 px-2 py-1">{scene.lighting || "Lighting"}</span></div></div>) : templates.slice(0, 4).map((item) => <div key={item} className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-white/45">{item}</div>)}
              </div>
              <div className="mt-4 flex h-14 items-center gap-2 overflow-hidden rounded-2xl border border-white/10 bg-black/24 p-2">
                {timeline.map((item, index) => <div key={`${item.scene}-${index}`} className="flex h-full min-w-[120px] items-center justify-center rounded-xl bg-gradient-to-r from-violet-500/40 to-cyan-400/25 px-3 text-xs">{item.label}</div>)}
              </div>
            </section>
          </main>

          <aside className="border-l border-white/10 bg-white/[0.035] p-4 backdrop-blur-xl">
            <h2 className="mb-4 flex items-center gap-2 font-semibold"><Wand2 className="size-4 text-violet-200" /> Generation settings</h2>
            <div className="space-y-4">
              <label className="block text-xs text-white/55">Model<select className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-black/24 px-3 text-sm text-white outline-none"><option>OpenRouter active model</option></select></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs text-white/55">Resolution<select value={settings.resolution} onChange={(e) => setSettings({ ...settings, resolution: e.target.value })} className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-black/24 px-3 text-sm text-white outline-none"><option>720p</option><option>1080p</option><option>4K</option></select></label>
                <label className="block text-xs text-white/55">FPS<input type="number" value={settings.fps} onChange={(e) => setSettings({ ...settings, fps: Number(e.target.value) })} className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-black/24 px-3 text-sm outline-none" /></label>
              </div>
              <label className="block text-xs text-white/55">Aspect ratio<div className="mt-2 grid grid-cols-3 gap-2">{ratios.map((ratio) => <button key={ratio} onClick={() => setSettings({ ...settings, aspectRatio: ratio })} className={cn("rounded-xl border px-2 py-2 text-xs", settings.aspectRatio === ratio ? "border-violet-300 bg-violet-400/20" : "border-white/10 bg-black/20 text-white/55")}>{ratio}</button>)}</div></label>
              <label className="block text-xs text-white/55">Duration <span className="float-right">{settings.durationSec}s</span><input type="range" min={2} max={60} value={settings.durationSec} onChange={(e) => setSettings({ ...settings, durationSec: Number(e.target.value) })} className="mt-2 w-full accent-violet-400" /></label>
              <label className="block text-xs text-white/55">Style lock<div className="mt-2 grid grid-cols-2 gap-2">{styles.map((style) => <button key={style} onClick={() => setSettings({ ...settings, styleLock: style })} className={cn("rounded-xl border px-2 py-2 text-xs", settings.styleLock === style ? "border-violet-300 bg-violet-400/20" : "border-white/10 bg-black/20 text-white/55")}>{style}</button>)}</div></label>
              <label className="block text-xs text-white/55">Camera motion<select value={settings.cameraMotion} onChange={(e) => setSettings({ ...settings, cameraMotion: e.target.value })} className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-black/24 px-3 text-sm text-white outline-none">{cameras.map((camera) => <option key={camera}>{camera}</option>)}</select></label>
              <label className="block text-xs text-white/55">Motion strength <span className="float-right">{settings.motionStrength}</span><input type="range" min={0} max={100} value={settings.motionStrength} onChange={(e) => setSettings({ ...settings, motionStrength: Number(e.target.value) })} className="mt-2 w-full accent-violet-400" /></label>
              <label className="block text-xs text-white/55">Consistency <span className="float-right">{settings.consistency}</span><input type="range" min={0} max={100} value={settings.consistency} onChange={(e) => setSettings({ ...settings, consistency: Number(e.target.value) })} className="mt-2 w-full accent-violet-400" /></label>
              <label className="block text-xs text-white/55">Negative prompt<textarea value={settings.negativePrompt} onChange={(e) => setSettings({ ...settings, negativePrompt: e.target.value })} className="mt-1 h-20 w-full resize-none rounded-xl border border-white/10 bg-black/24 p-3 text-sm outline-none" /></label>
              <button onClick={() => navigator.clipboard?.writeText(latestGeneration?.enhancedPrompt || prompt)} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/8 text-sm text-white/70 hover:bg-white/12"><Copy className="size-4" /> Copy enhanced prompt</button>
            </div>
          </aside>
        </div>
      </div>
    </UserPanelShell>
  );
}
