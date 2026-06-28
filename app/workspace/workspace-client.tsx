"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { AnimatePresence, motion } from "framer-motion";
import { isInternalWorkspaceFile, isUserVisibleWorkspaceFile } from "@/lib/workspace-file-visibility";
import {
  ArrowLeft,
  ArrowUpRight,
  Archive,
  Bell,
  CheckCircle2,
  ChevronRight,
  Copy,
  Download,
  FileJson,
  FileSpreadsheet,
  FileCode2,
  FileText,
  Folder,
  FolderOpen,
  Globe2,
  History,
  Edit3,
  Maximize2,
  MoreHorizontal,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Save,
  Settings,
  Sparkles,
  Square,
  Trash2,
  UserRound,
  X,
} from "lucide-react";

type TreeNode = {
  id?: string;
  name: string;
  path: string;
  type: "file" | "folder";
  status?: string;
  language?: string;
  children?: TreeNode[];
};

type Project = {
  id: string;
  name: string;
  slug: string;
  qualityScore: number;
  lastPreviewUrl?: string | null;
  createdAt?: string;
  updatedAt: string;
};

type Diff = {
  id?: string;
  path: string;
  operation: string;
  added: number;
  removed: number;
  oldContent?: string | null;
  newContent?: string | null;
};

type Task = {
  id: string;
  prompt: string;
  status: string;
  summary?: string | null;
  qualityScore: number;
  previewUrl?: string | null;
  createdAt: string;
  planJson?: string[] | null;
  diffs?: Diff[];
  logs?: Array<{ id: string; event: string; message: string; createdAt: string }>;
  runs?: Array<{ id: string; command: string; status: string; stdout?: string | null; stderr?: string | null }>;
  events?: StreamEvent[];
};

type StreamEvent = {
  sequence: number;
  type: string;
  message: string;
  payload?: Record<string, unknown>;
};

type WorkspaceState = {
  project: Project | null;
  projects: Project[];
  tree: TreeNode[];
  tasks: Task[];
  preview: { url: string; verified: boolean; httpStatus?: number; message?: string; status?: string; lastCheckedAt?: string } | null;
  memory: WorkspaceMemory | null;
};

type UsageWindow = {
  windowType: "FIVE_HOUR" | "WEEKLY" | "MONTHLY";
  creditsUsed: number;
  creditsLimit: number;
  resetAt: string;
};

type UsageState = {
  plan: {
    name: string;
    slug: string;
    maxContextTokens: number;
  };
  windows: Record<"FIVE_HOUR" | "WEEKLY" | "MONTHLY", UsageWindow>;
} | null;

type BottomTab = "TERMINAL" | "OUTPUT" | "PROBLEMS" | "LOGS" | "PREVIEW LOGS" | "GIT";
type CenterMode = "code" | "preview" | "split";
type RightTab = "CHAT" | "CHANGES" | "ACTIVITY" | "MEMORY" | "RULES";

type WorkspaceMemory = {
  projectSummary: string;
  architecture: string[];
  recentTasks: Array<{ prompt: string; summary: string; status: string; qualityScore: number; filesChanged: string[]; createdAt: string }>;
  recentDecisions: string[];
  knownIssues: string[];
  successfulFixes: string[];
  codingStyle: string[];
  designStyle: string[];
  lastSuccessfulCommands: string[];
  activePreviewCommand: string;
  updatedAt: string;
};

function flatten(nodes: TreeNode[]): TreeNode[] {
  return nodes.flatMap((node) => [node, ...(node.children ? flatten(node.children) : [])]);
}

function statusLabel(status?: string) {
  if (!status || status === "UNCHANGED") return "";
  return status === "CREATED" ? "Created" : status === "EDITED" ? "Edited" : status === "ROLLED_BACK" ? "Restored" : status;
}

function formatRuntimeMs(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return "—";
  if (numeric < 1000) return `${Math.round(numeric)}ms`;
  return `${(numeric / 1000).toFixed(numeric > 10000 ? 1 : 2)}s`;
}

function runtimeStatsFromEvent(event?: StreamEvent) {
  const payload = event?.payload || {};
  const direct = payload.runtimeStats;
  if (direct && typeof direct === "object") return direct as Record<string, unknown>;
  const timings = payload.timings;
  if (timings && typeof timings === "object") {
    return { responseTimeMs: (timings as Record<string, unknown>).modelResponseMs };
  }
  return null;
}

function fileIconFor(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".json")) return { Icon: FileJson, color: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-500/10" };
  if (lower.endsWith(".css")) return { Icon: FileCode2, color: "text-sky-500", bg: "bg-sky-50 dark:bg-sky-500/10" };
  if (lower.endsWith(".js") || lower.endsWith(".ts") || lower.endsWith(".tsx") || lower.endsWith(".jsx")) return { Icon: FileCode2, color: "text-violet-500", bg: "bg-violet-50 dark:bg-violet-500/10" };
  if (lower.endsWith(".md")) return { Icon: FileText, color: "text-slate-500", bg: "bg-slate-50 dark:bg-white/[0.05]" };
  if (lower.endsWith(".html")) return { Icon: FileSpreadsheet, color: "text-orange-500", bg: "bg-orange-50 dark:bg-orange-500/10" };
  return { Icon: FileText, color: "text-slate-500", bg: "bg-slate-50 dark:bg-white/[0.05]" };
}

function FileNode({ node, active, onOpen }: { node: TreeNode; active: string; onOpen: (file: string) => void }) {
  const [open, setOpen] = useState(true);
  const isFolder = node.type === "folder";
  const badge = statusLabel(node.status);
  const fileIcon = fileIconFor(node.name);
  const FileIcon = fileIcon.Icon;
  return (
    <div>
      <button
        onClick={() => isFolder ? setOpen(!open) : onOpen(node.path)}
        className={`flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-xs transition ${
          active === node.path
            ? "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-100"
            : "text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-white/8 dark:hover:text-white"
        }`}
      >
        {isFolder ? (
          <span className="grid size-5 shrink-0 place-items-center rounded-md bg-blue-50 text-blue-500 dark:bg-blue-500/10">
            {open ? <FolderOpen className="size-3.5" /> : <Folder className="size-3.5" />}
          </span>
        ) : (
          <span className={`grid size-5 shrink-0 place-items-center rounded-md ${fileIcon.bg} ${fileIcon.color}`}>
            <FileIcon className="size-3.5" />
          </span>
        )}
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
        {badge && <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-600 dark:text-emerald-300">{badge}</span>}
        {isFolder && <ChevronRight className={`size-3 shrink-0 transition ${open ? "rotate-90" : ""}`} />}
      </button>
      {isFolder && open && node.children?.length ? (
        <div className="ml-4 border-l border-slate-200 pl-2 dark:border-white/10">
          {node.children.map((child) => <FileNode key={child.path} node={child} active={active} onOpen={onOpen} />)}
        </div>
      ) : null}
    </div>
  );
}

export function WorkspaceClient({ projectId }: { projectId?: string }) {
  const { status } = useSession({ required: true });
  const router = useRouter();
  const [state, setState] = useState<WorkspaceState>({ project: null, projects: [], tree: [], tasks: [], preview: null, memory: null });
  const [prompt, setPrompt] = useState("Create a simple landing page");
  const [selectedFile, setSelectedFile] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("Ready");
  const [streamEvents, setStreamEvents] = useState<StreamEvent[]>([]);
  const [liveDiffs, setLiveDiffs] = useState<Diff[]>([]);
  const [liveFileStatuses, setLiveFileStatuses] = useState<Record<string, string>>({});
  const [liveCursor, setLiveCursor] = useState<{ path: string; line: number; column: number; percent?: number; lines?: number; characters?: number; fileSize?: number } | null>(null);
  const [livePreviewVersion, setLivePreviewVersion] = useState("");
  const [queuedPrompt, setQueuedPrompt] = useState("");
  const [previewAction, setPreviewAction] = useState<"idle" | "refreshing" | "stopping">("idle");
  const [previewStopped, setPreviewStopped] = useState(false);
  const [copiedPreview, setCopiedPreview] = useState(false);
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({
  });
  const [leftWidth, setLeftWidth] = useState(320);
  const [rightWidth, setRightWidth] = useState(360);
  const [fileSearch, setFileSearch] = useState("");
  const [showHiddenFiles, setShowHiddenFiles] = useState(false);
  const [showChangedOnly, setShowChangedOnly] = useState(false);
  const [sortMode, setSortMode] = useState<"name" | "type">("name");
  const [explorerMenuOpen, setExplorerMenuOpen] = useState(false);
  const [activityFilter, setActivityFilter] = useState("");
  const [activeRightTab, setActiveRightTab] = useState<RightTab>("CHAT");
  const [aiMenuOpen, setAiMenuOpen] = useState(false);
  const [aiHistoryOpen, setAiHistoryOpen] = useState(false);
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [aiSettingsTab, setAiSettingsTab] = useState("General");
  const [sendShortcut, setSendShortcut] = useState("Enter");
  const [selectedAiModel, setSelectedAiModel] = useState("MelDex 1.0");
  const [workMode, setWorkMode] = useState("local");
  const [centerMode, setCenterMode] = useState<CenterMode>("split");
  const [splitRatio, setSplitRatio] = useState(52);
  const [previewRotated, setPreviewRotated] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<"Desktop" | "Tablet" | "Mobile">("Desktop");
  const [previewMode, setPreviewMode] = useState<"Responsive" | "1440px" | "1280px" | "768px" | "390px">("Responsive");
  const [previewZoom, setPreviewZoom] = useState(100);
  const [memorySearch, setMemorySearch] = useState("");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: TreeNode } | null>(null);
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [editorContent, setEditorContent] = useState("");
  const [savedEditorContent, setSavedEditorContent] = useState("");
  const [savingFile, setSavingFile] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const [bottomTab, setBottomTab] = useState<BottomTab>("TERMINAL");
  const [bottomHeight, setBottomHeight] = useState(210);
  const [bottomCollapsed, setBottomCollapsed] = useState(true);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [previewFullscreen, setPreviewFullscreen] = useState(false);
  const [editorFullscreen, setEditorFullscreen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [terminalOutput, setTerminalOutput] = useState<string[]>(["Managed terminal ready."]);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [usage, setUsage] = useState<UsageState>(null);
  const abortRef = useRef<AbortController | null>(null);
  const loadingRef = useRef(false);
  const activeTask = state.tasks[0];
  const files = useMemo(() => flatten(state.tree).filter((node) => node.type === "file" && (showHiddenFiles || isUserVisibleWorkspaceFile(node.path))), [showHiddenFiles, state.tree]);
  const selectedNode = files.find((file) => file.path === selectedFile);
  const liveWritePending = savedEditorContent === "__meldex_live_write_pending__";
  const fileDirty = Boolean(selectedFile && !liveWritePending && editorContent !== savedEditorContent);
  const editorLanguage = selectedFile.endsWith(".html") ? "html" : selectedFile.endsWith(".css") ? "css" : selectedFile.endsWith(".json") ? "json" : selectedFile.endsWith(".md") ? "markdown" : selectedFile.endsWith(".ts") || selectedFile.endsWith(".tsx") ? "typescript" : selectedFile.endsWith(".js") || selectedFile.endsWith(".jsx") ? "javascript" : "plaintext";
  const visibleTree = useMemo(() => {
    const query = fileSearch.trim().toLowerCase();
    const prune = (nodes: TreeNode[]): TreeNode[] => nodes
      .map((node) => {
        if (node.type === "file") {
          if (!showHiddenFiles && !isUserVisibleWorkspaceFile(node.path)) return null;
          if (showChangedOnly && !node.status) return null;
          return !query || node.path.toLowerCase().includes(query) || node.name.toLowerCase().includes(query) ? node : null;
        }
        const children = prune(node.children || []);
        const selfMatches = !query || node.path.toLowerCase().includes(query) || node.name.toLowerCase().includes(query);
        if (!showHiddenFiles && !isUserVisibleWorkspaceFile(node.path)) return null;
        if (!children.length && !selfMatches) return null;
        if (!children.length && !query) return null;
        return { ...node, children };
      })
      .filter(Boolean) as TreeNode[];
    const sortTree = (nodes: TreeNode[]): TreeNode[] => [...nodes].sort((a, b) => {
      if (sortMode === "type") return Number(b.type === "folder") - Number(a.type === "folder") || (a.language || "").localeCompare(b.language || "") || a.name.localeCompare(b.name);
      return Number(b.type === "folder") - Number(a.type === "folder") || a.name.localeCompare(b.name);
    }).map((node) => ({ ...node, children: node.children ? sortTree(node.children) : undefined }));
    return sortTree(prune(state.tree));
  }, [fileSearch, showChangedOnly, showHiddenFiles, sortMode, state.tree]);
  const changed = liveDiffs.length ? liveDiffs : activeTask?.diffs || [];
  const currentPromptDiffs = liveDiffs;
  const hasPreviewFile = files.some((file) => file.path === "index.html");
  const previewVersion = [
    state.project?.updatedAt,
    state.preview?.lastCheckedAt,
    state.preview?.httpStatus,
    state.preview?.status,
    livePreviewVersion,
  ].filter(Boolean).join(":");
  const previewUrl = state.project ? `/api/workspaces/${state.project.id}/preview?v=${encodeURIComponent(previewVersion || String(Date.now()))}` : "";
  const previewDisplayUrl = state.preview?.url || (hasPreviewFile && state.project ? `/api/workspaces/${state.project.id}/preview` : "");
  const previewFullUrl = typeof window !== "undefined" && previewDisplayUrl ? `${window.location.origin}${previewDisplayUrl}` : previewDisplayUrl;
  const previewReady = Boolean(state.project && hasPreviewFile && previewDisplayUrl && !previewStopped);
  const previewStatus = previewAction === "refreshing"
    ? "Verifying"
    : previewAction === "stopping"
      ? "Stopping"
      : previewStopped
        ? "Stopped"
        : !state.project || !hasPreviewFile
          ? "Not started"
          : state.preview?.verified
            ? "Verified"
            : state.preview?.httpStatus
              ? "Failed"
              : loading
                ? "Starting"
                : "Running";
  const statusTone = previewStatus === "Verified"
    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200"
    : previewStatus === "Failed"
      ? "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-200"
      : previewStatus === "Stopped"
        ? "bg-slate-100 text-slate-600 dark:bg-white/8 dark:text-slate-300"
        : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-200";

  async function loadWorkspace(id = projectId) {
    if (status !== "authenticated") return;
    if (!id) {
      const response = await fetch("/api/workspaces", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load workspaces");
      if (data.projects?.[0]) {
        router.replace(`/workspace/${data.projects[0].id}`);
        return;
      }
      setState((current) => ({ ...current, projects: data.projects || [] }));
      return;
    }
    const response = await fetch(`/api/workspaces/${id}${showHiddenFiles ? "?showHidden=1" : ""}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to load workspace");
    setState({
      project: data.project,
      projects: [],
      tree: data.tree || [],
      tasks: data.tasks || [],
      preview: data.preview || null,
      memory: data.memory || null,
    });
    if (data.preview?.verified) setPreviewStopped(false);
    if (data.project?.createdAt) {
      const createdAt = new Date(data.project.createdAt).getTime();
      const key = `meldex:native-ide:onboarding:${data.project.id}`;
      if (Number.isFinite(createdAt) && Date.now() - createdAt < 10 * 60 * 1000 && window.localStorage.getItem(key) !== "dismissed") {
        setOnboardingOpen(true);
      }
    }
    const savedFolders = window.localStorage.getItem(`meldex.workspace.openFolders:${data.project.id}`);
    if (savedFolders) {
      try {
        setOpenFolders(JSON.parse(savedFolders) as Record<string, boolean>);
      } catch {
        setOpenFolders({});
      }
    } else {
      setOpenFolders({});
    }
  }

  async function loadUsage() {
    const response = await fetch("/api/usage", { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    setUsage(data.usage || null);
  }

  useEffect(() => {
    loadWorkspace().catch((error) => setMessage(error.message));
    loadUsage().catch(() => undefined);
  }, [status, projectId, showHiddenFiles]);

  useEffect(() => {
    if (!state.project?.id || !activeTask || !["RUNNING", "QUEUED"].includes(activeTask.status)) return;
    const timer = window.setInterval(() => {
      loadWorkspace(state.project?.id).catch(() => undefined);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [activeTask?.id, activeTask?.status, state.project?.id, showHiddenFiles]);

  async function createProject(seedPrompt?: string) {
    setLoading(true);
    try {
      const response = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: seedPrompt || "AI Workspace" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to create workspace");
      router.push(`/workspace/${data.project.id}/ide`);
      if (seedPrompt) setPrompt(seedPrompt);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to create workspace");
    } finally {
      setLoading(false);
    }
  }

  async function runAgent(overridePrompt?: string) {
    const effectivePrompt = overridePrompt || prompt;
    if (loadingRef.current) {
      setQueuedPrompt(effectivePrompt);
      setMessage("Queued · will run next");
      return;
    }
    if (!state.project) {
      await createProject(effectivePrompt);
      return;
    }
    setLoading(true);
    loadingRef.current = true;
    setStreamEvents([]);
    setLiveDiffs([]);
    setLiveFileStatuses({});
    setMessage("Understanding request");
    setTerminalOutput((current) => [`$ meldex-agent workspace "${effectivePrompt}"`, "Starting managed agent stream...", ...current.slice(0, 80)]);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch(`/api/workspaces/${state.project.id}/agent/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: effectivePrompt }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({ error: "Unable to start stream" })) as { error?: string };
        throw new Error(data.error || "Unable to start stream");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let latestPreviewRefresh = 0;
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
          setStreamEvents((current) => [...current, event].sort((a, b) => a.sequence - b.sequence));
          setMessage(event.message);
          setTerminalOutput((current) => [`${event.type}: ${event.message}`, ...current].slice(0, 180));
          if (event.type === "current_step" || event.type === "taskStatus" || event.type === "previewStatus" || event.type === "heartbeat") {
            setMessage(event.message);
          }
          if (event.type === "file_opened" || event.type === "editorOpenFile") {
            const payload = event.payload || {};
            if (typeof payload.path === "string") {
              const path = payload.path;
              setCenterMode("code");
              setPreviewFullscreen(false);
              setEditorFullscreen(false);
              setSelectedFile(path);
              setOpenTabs((current) => current.includes(path) ? current : [...current, path]);
              setEditorContent(typeof payload.content === "string" ? payload.content : "");
              setSavedEditorContent(typeof payload.content === "string" ? payload.content : "");
              setLiveFileStatuses((current) => ({ ...current, [path]: "Reading" }));
            }
          }
          if (event.type === "file_write_started") {
            const payload = event.payload || {};
            if (typeof payload.path === "string") {
              const path = payload.path;
              setSelectedFile(path);
              setOpenTabs((current) => current.includes(path) ? current : [...current, path]);
              setEditorContent("");
              setSavedEditorContent("__meldex_live_write_pending__");
              setLiveCursor({ path, line: 1, column: 0, percent: 0, lines: 0, characters: 0, fileSize: 0 });
              setLiveFileStatuses((current) => ({ ...current, [path]: "Queued" }));
              await loadWorkspace(state.project.id).catch(() => undefined);
            }
          }
          if (event.type === "file_writing" || event.type === "creating_file" || event.type === "updating_file") {
            const payload = event.payload || {};
            if (typeof payload.path === "string") {
              const path = payload.path;
              setSelectedFile(path);
              setOpenTabs((current) => current.includes(path) ? current : [...current, path]);
              setLiveFileStatuses((current) => ({ ...current, [path]: "Writing" }));
              await loadWorkspace(state.project.id).catch(() => undefined);
            }
          }
          if (event.type === "editorApplyChunk") {
            const payload = event.payload || {};
            if (typeof payload.path === "string") {
              const path = payload.path;
              const line = Number(payload.cursorLine || 1);
              const column = Number(payload.cursorColumn || 0);
              setSelectedFile(path);
              setLiveCursor((current) => ({ ...(current || { path, line, column }), path, line, column }));
              setLiveFileStatuses((current) => ({ ...current, [path]: "Typing" }));
            }
          }
          if (event.type === "file_progress") {
            const payload = event.payload || {};
            if (typeof payload.path === "string") {
              const percent = typeof payload.percent === "number" ? ` ${payload.percent}%` : "";
              const path = payload.path;
              setSelectedFile(path);
              setLiveCursor({
                path,
                line: Number(payload.cursorLine || 1),
                column: Number(payload.cursorColumn || 0),
                percent: typeof payload.percent === "number" ? payload.percent : undefined,
                lines: typeof payload.lines === "number" ? payload.lines : undefined,
                characters: typeof payload.characters === "number" ? payload.characters : undefined,
                fileSize: typeof payload.fileSize === "number" ? payload.fileSize : undefined,
              });
              setLiveFileStatuses((current) => ({ ...current, [path]: `Typing${percent}` }));
            }
          }
          if (event.type === "file_write_chunk") {
            const payload = event.payload || {};
            if (typeof payload.path === "string" && typeof payload.chunk === "string") {
              const path = payload.path;
              setSelectedFile(path);
              setOpenTabs((current) => current.includes(path) ? current : [...current, path]);
              setEditorContent((current) => current + payload.chunk);
              setLiveFileStatuses((current) => ({ ...current, [path]: "Editing" }));
            }
          }
          if (event.type === "live_diff_updated") {
            const payload = event.payload || {};
            if (typeof payload.path === "string") {
              setLiveDiffs((current) => {
                const next = current.filter((item) => item.path !== payload.path);
                next.push({
                  path: payload.path as string,
                  operation: String(payload.operation || "edit"),
                  added: Number(payload.added || 0),
                  removed: Number(payload.removed || 0),
                });
                return next;
              });
            }
          }
          if (event.type === "preview_hot_reload") {
            const payload = event.payload || {};
            setPreviewStopped(false);
            setLivePreviewVersion(String(payload.version || Date.now()));
            const now = Date.now();
            if (now - latestPreviewRefresh > 500) {
              latestPreviewRefresh = now;
              await loadWorkspace(state.project.id).catch(() => undefined);
            }
          }
          if (event.type === "file_save_started" || event.type === "editorSaveState") {
            const payload = event.payload || {};
            if (typeof payload.path === "string") {
              setLiveFileStatuses((current) => ({ ...current, [payload.path as string]: payload.state === "saved" ? "Completed" : "Saving" }));
            }
          }
          if (event.type === "file_saved") {
            const payload = event.payload || {};
            if (typeof payload.path === "string") {
              const path = payload.path;
              if (typeof payload.content === "string") {
                setSelectedFile(path);
                setEditorContent(payload.content);
                setSavedEditorContent(payload.content);
              }
              setLiveFileStatuses((current) => ({ ...current, [path]: "Completed" }));
              setLiveCursor((current) => current?.path === path ? null : current);
              setTimeout(() => {
                setLiveFileStatuses((current) => {
                  const next = { ...current };
                  delete next[path];
                  return next;
                });
              }, 2200);
              await loadWorkspace(state.project.id).catch(() => undefined);
            }
          }
          if (event.type === "error") {
            setBottomTab("PROBLEMS");
            setBottomCollapsed(false);
          }
          if (event.type === "server_starting") {
            setBottomTab("PREVIEW LOGS");
            setBottomCollapsed(false);
          }
          if (event.type === "explorerRefresh") {
            await loadWorkspace(state.project.id).catch(() => undefined);
          }
          if (event.type === "diff_ready" || event.type === "file_created" || event.type === "file_updated" || event.type === "file_deleted") {
            const payload = event.payload || {};
            if (typeof payload.path === "string") {
              setLiveDiffs((current) => {
                const next = current.filter((item) => item.path !== payload.path);
                next.push({
                  path: payload.path as string,
                  operation: String(payload.operation || "edit"),
                  added: Number(payload.added || 0),
                  removed: Number(payload.removed || 0),
                });
                return next;
              });
            }
            const now = Date.now();
            if (now - latestPreviewRefresh > 500) {
              latestPreviewRefresh = now;
              await loadWorkspace(state.project.id).catch(() => undefined);
            }
          }
          if (event.type === "preview_verified" || event.type === "done") {
            await loadWorkspace(state.project.id).catch(() => undefined);
            await loadUsage().catch(() => undefined);
            if (event.type === "preview_verified") setTimeout(() => setBottomCollapsed(true), 1400);
          }
        }
      }
      await loadWorkspace(state.project.id);
      await loadUsage().catch(() => undefined);
    } catch (error) {
      if (controller.signal.aborted) setMessage("Task cancelled");
      else {
        setMessage(error instanceof Error ? error.message : "Workspace agent failed");
        setBottomTab("PROBLEMS");
        setBottomCollapsed(false);
      }
      await loadWorkspace(state.project.id).catch(() => undefined);
      await loadUsage().catch(() => undefined);
    } finally {
      setLoading(false);
      loadingRef.current = false;
      abortRef.current = null;
      if (queuedPrompt.trim()) {
        const next = queuedPrompt;
        setQueuedPrompt("");
        setPrompt(next);
        setTimeout(() => void runAgent(next), 100);
      }
    }
  }

  function stopTask() {
    abortRef.current?.abort();
    setLoading(false);
    setMessage("Task cancelled");
    setTerminalOutput((current) => ["Task cancelled by user.", ...current].slice(0, 180));
  }

  async function openFile(filePath: string) {
    if (!state.project) return;
    const response = await fetch(`/api/workspaces/${state.project.id}/files?path=${encodeURIComponent(filePath)}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || "Unable to open file");
      return;
    }
    setCenterMode("code");
    setPreviewFullscreen(false);
    setEditorFullscreen(false);
    setSelectedFile(filePath);
    const latestContent = typeof data.content === "string" ? data.content : "";
    setEditorContent(latestContent);
    setSavedEditorContent(latestContent);
    setOpenTabs((current) => current.includes(filePath) ? current : [...current, filePath]);
    const debug = data.debug || {};
    setTerminalOutput((current) => [
      `EDITOR_FILE_LOAD_DEBUG path=${filePath} storedLength=${latestContent.length} editorLength=${latestContent.length} source=${debug.source || "storage"} updatedAt=${debug.updatedAt || "unknown"}`,
      ...current,
    ].slice(0, 180));
    setMessage(latestContent.length ? `Opened ${filePath}` : `File corruption warning: ${filePath} is empty in storage`);
  }

  async function createWorkspaceFile(filePath?: string, content = "") {
    if (!state.project) return;
    const path = filePath || window.prompt("New file path", "app/page.tsx")?.trim();
    if (!path) return;
    const response = await fetch(`/api/workspaces/${state.project.id}/files`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, content, status: "CREATED" }),
    });
    const data = await response.json();
    setMessage(response.ok ? `Created ${path}` : data.error || "Create file failed");
    await loadWorkspace(state.project.id);
    if (response.ok) await openFile(path);
  }

  async function createWorkspaceFolder(parentPath = "") {
    const folderName = window.prompt("New folder name", "components")?.trim();
    if (!folderName) return;
    const cleanParent = parentPath.replace(/\/$/, "");
    const cleanFolder = folderName.replace(/^\/+|\/+$/g, "");
    if (!state.project) return;
    const folderPath = `${cleanParent ? `${cleanParent}/` : ""}${cleanFolder}`;
    const response = await fetch(`/api/workspaces/${state.project.id}/files`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: folderPath, type: "folder" }),
    });
    const data = await response.json().catch(() => ({}));
    setMessage(response.ok ? `Created folder ${folderPath}` : data.error || "Create folder failed");
    await loadWorkspace(state.project.id);
  }

  async function renameFile(node: TreeNode) {
    if (!state.project) return;
    const nextPath = window.prompt("Rename path", node.path)?.trim();
    if (!nextPath || nextPath === node.path) return;
    const response = await fetch(`/api/workspaces/${state.project.id}/files`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromPath: node.path, toPath: nextPath }),
    });
    const data = await response.json().catch(() => ({}));
    setMessage(response.ok ? `Renamed ${node.path}` : data.error || "Rename failed");
    if (selectedFile === node.path) {
      setSelectedFile(nextPath);
      setOpenTabs((current) => current.map((item) => item === node.path ? nextPath : item));
    }
    await loadWorkspace(state.project.id);
  }

  async function deleteFile(node: TreeNode) {
    if (!state.project) return;
    if (!window.confirm(`Delete ${node.path}?`)) return;
    const endpoint = node.type === "file" && node.id
      ? `/api/workspaces/${state.project.id}/files/${node.id}`
      : `/api/workspaces/${state.project.id}/files?path=${encodeURIComponent(node.path)}`;
    const response = await fetch(endpoint, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    setMessage(response.ok ? `Deleted ${node.path}` : data.error || "Delete failed");
    if (selectedFile === node.path || selectedFile.startsWith(`${node.path}/`)) {
      setSelectedFile("");
      setEditorContent("");
      setSavedEditorContent("");
    }
    setOpenTabs((current) => current.filter((item) => item !== node.path && !item.startsWith(`${node.path}/`)));
    await loadWorkspace(state.project.id);
  }

  async function saveCurrentFile(manual = true) {
    if (!state.project || !selectedFile || !fileDirty) return;
    if (liveWritePending) return;
    if (savedEditorContent.trim().length > 0 && editorContent.trim().length === 0) {
      setMessage(`Refusing to overwrite ${selectedFile} with empty content`);
      setBottomTab("PROBLEMS");
      setBottomCollapsed(false);
      return;
    }
    setSavingFile(true);
    const response = selectedNode?.id ? await fetch(`/api/workspaces/${state.project.id}/files/${selectedNode.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: editorContent, status: "EDITED" }),
    }) : await fetch(`/api/workspaces/${state.project.id}/files`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: selectedFile, content: editorContent, status: "EDITED" }),
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) {
      setSavedEditorContent(editorContent);
      setMessage(manual ? `Saved ${selectedFile}` : `Autosaved ${selectedFile}`);
      if (/\.(html|css|js|jsx|ts|tsx)$/i.test(selectedFile)) setTimeout(() => void refreshPreview(), 350);
      await loadWorkspace(state.project.id);
    } else {
      setMessage(data.error || "Save failed");
    }
    setSavingFile(false);
  }

  async function duplicateFile(node: TreeNode) {
    if (!state.project || node.type !== "file") return;
    const response = await fetch(`/api/workspaces/${state.project.id}/files?path=${encodeURIComponent(node.path)}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || "Duplicate failed");
      return;
    }
    const dot = node.path.lastIndexOf(".");
    const nextPath = dot > -1 ? `${node.path.slice(0, dot)} copy${node.path.slice(dot)}` : `${node.path} copy`;
    await createWorkspaceFile(nextPath, data.content || "");
  }

  function downloadProjectZip() {
    if (!state.project) return;
    window.location.href = `/api/workspaces/${state.project.id}/download`;
    setMessage("Project ZIP download started");
  }

  async function downloadFile(node: TreeNode) {
    if (!state.project || node.type !== "file") return;
    const response = await fetch(`/api/workspaces/${state.project.id}/files?path=${encodeURIComponent(node.path)}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || "Download file failed");
      return;
    }
    const blob = new Blob([data.content || ""], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = node.name;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage(`Downloaded ${node.path}`);
  }

  async function refreshPreview() {
    if (!state.project) return;
    setPreviewAction("refreshing");
    setPreviewStopped(false);
    const response = await fetch(`/api/workspaces/${state.project.id}/run`, { method: "POST" });
    const data = await response.json();
    if (!response.ok) setMessage(data.error || "Preview failed");
    else setMessage(data.verification?.message || "Preview refreshed");
    await loadWorkspace(state.project.id);
    setPreviewAction("idle");
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveCurrentFile();
      }
      if ((event.metaKey || event.ctrlKey) && (event.key.toLowerCase() === "k" || (event.shiftKey && event.key.toLowerCase() === "p"))) {
        event.preventDefault();
        setCommandPaletteOpen(true);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "r") {
        event.preventDefault();
        void refreshPreview();
      }
      if (event.key === "Escape") setContextMenu(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  useEffect(() => {
    if (!editorRef.current || !liveCursor || liveCursor.path !== selectedFile) return;
    const lines = editorContent.split("\n");
    const targetLine = Math.max(1, Math.min(liveCursor.line, lines.length));
    const prefix = lines.slice(0, targetLine - 1).join("\n");
    const position = prefix.length + (targetLine > 1 ? 1 : 0) + Math.min(liveCursor.column, lines[targetLine - 1]?.length || 0);
    editorRef.current.selectionStart = position;
    editorRef.current.selectionEnd = position;
    editorRef.current.scrollTop = editorRef.current.scrollHeight;
  }, [editorContent, liveCursor, selectedFile]);

  useEffect(() => {
    const left = window.localStorage.getItem("meldex.workspace.leftWidth");
    const right = window.localStorage.getItem("meldex.workspace.rightWidth");
    const bottom = window.localStorage.getItem("meldex.workspace.bottomHeight");
    const collapsed = window.localStorage.getItem("meldex.workspace.bottomCollapsed");
    if (left) setLeftWidth(Math.min(420, Math.max(260, Number(left))));
    if (right) setRightWidth(Math.min(460, Math.max(320, Number(right))));
    if (bottom) setBottomHeight(Math.min(380, Math.max(120, Number(bottom))));
    if (collapsed) setBottomCollapsed(collapsed === "true");
  }, []);

  useEffect(() => {
    window.localStorage.setItem("meldex.workspace.leftWidth", String(leftWidth));
    window.localStorage.setItem("meldex.workspace.rightWidth", String(rightWidth));
    window.localStorage.setItem("meldex.workspace.bottomHeight", String(bottomHeight));
    window.localStorage.setItem("meldex.workspace.bottomCollapsed", String(bottomCollapsed));
  }, [leftWidth, rightWidth, bottomHeight, bottomCollapsed]);

  useEffect(() => {
    if (!state.project?.id) return;
    const key = `meldex.workspace.view.${state.project.id}`;
    const raw = window.localStorage.getItem(key);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as Partial<{ centerMode: CenterMode; splitRatio: number; activeFile: string; previewDevice: "Desktop" | "Tablet" | "Mobile"; previewMode: "Responsive" | "1440px" | "1280px" | "768px" | "390px"; previewZoom: number }>;
      if (saved.centerMode && ["code", "preview", "split"].includes(saved.centerMode)) setCenterMode(saved.centerMode);
      if (saved.splitRatio) setSplitRatio(Math.min(72, Math.max(32, Number(saved.splitRatio))));
      if (saved.previewDevice) setPreviewDevice(saved.previewDevice);
      if (saved.previewMode) setPreviewMode(saved.previewMode);
      if (saved.previewZoom) setPreviewZoom(Number(saved.previewZoom));
      if (typeof (saved as { showHiddenFiles?: unknown }).showHiddenFiles === "boolean") setShowHiddenFiles(Boolean((saved as { showHiddenFiles?: boolean }).showHiddenFiles));
      if (saved.activeFile && files.some((file) => file.path === saved.activeFile)) void openFile(saved.activeFile);
    } catch {}
  }, [state.project?.id]);

  useEffect(() => {
    if (!state.project?.id) return;
    window.localStorage.setItem(`meldex.workspace.view.${state.project.id}`, JSON.stringify({
      centerMode,
      splitRatio,
      activeFile: selectedFile,
      previewDevice,
      previewMode,
      previewZoom,
      showHiddenFiles,
    }));
  }, [centerMode, splitRatio, selectedFile, previewDevice, previewMode, previewZoom, showHiddenFiles, state.project?.id]);

  useEffect(() => {
    if (!state.project?.id) return;
    window.localStorage.setItem(`meldex.workspace.openFolders:${state.project.id}`, JSON.stringify(openFolders));
  }, [openFolders, state.project?.id]);

  useEffect(() => {
    if (!fileDirty || !selectedFile) return;
    const timeout = window.setTimeout(() => void saveCurrentFile(false), 1400);
    return () => window.clearTimeout(timeout);
  }, [editorContent, selectedFile]);

  function resetLayout() {
    setLeftWidth(320);
    setRightWidth(360);
    setBottomHeight(210);
    setLeftCollapsed(false);
    setRightCollapsed(false);
    setBottomCollapsed(true);
    setPreviewFullscreen(false);
    setEditorFullscreen(false);
    setMessage("Layout reset");
  }

  function selectPreviewDevice(device: "Desktop" | "Tablet" | "Mobile") {
    setPreviewDevice(device);
    if (device === "Desktop") setPreviewMode("1280px");
    if (device === "Tablet") setPreviewMode("768px");
    if (device === "Mobile") setPreviewMode("390px");
  }

  function toggleAiPanel() {
    setRightCollapsed((value) => !value);
    if (rightCollapsed) setActiveRightTab("CHAT");
  }

  function dismissOnboarding() {
    if (state.project?.id) window.localStorage.setItem(`meldex:native-ide:onboarding:${state.project.id}`, "dismissed");
    setOnboardingOpen(false);
  }

  function startBottomResize(event: React.MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = bottomHeight;
    const onMove = (moveEvent: MouseEvent) => {
      setBottomHeight(Math.min(380, Math.max(120, startHeight - (moveEvent.clientY - startY))));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  async function copyPreviewUrl() {
    if (!previewFullUrl) return;
    await navigator.clipboard?.writeText(previewFullUrl);
    setCopiedPreview(true);
    setMessage("Preview URL copied");
    setTimeout(() => setCopiedPreview(false), 1800);
  }

  function startResize(side: "left" | "right", event: React.MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startLeft = leftWidth;
    const startRight = rightWidth;
    const onMove = (moveEvent: MouseEvent) => {
      if (side === "left") {
        setLeftWidth(Math.min(420, Math.max(260, startLeft + moveEvent.clientX - startX)));
      } else {
        setRightWidth(Math.min(460, Math.max(320, startRight - (moveEvent.clientX - startX))));
      }
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function startSplitResize(event: React.MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    const container = (event.currentTarget.parentElement as HTMLElement | null);
    const bounds = container?.getBoundingClientRect();
    if (!bounds) return;
    const onMove = (moveEvent: MouseEvent) => {
      const next = ((moveEvent.clientX - bounds.left) / bounds.width) * 100;
      setSplitRatio(Math.min(72, Math.max(32, next)));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function collapseAllFolders() {
    setOpenFolders({});
    setMessage("Explorer collapsed");
  }

  function expandAllFolders() {
    const next: Record<string, boolean> = {};
    flatten(state.tree).forEach((node) => {
      if (node.type === "folder") next[node.path] = true;
    });
    setOpenFolders(next);
    setMessage("Explorer expanded");
  }

  function revealActiveFile() {
    if (!selectedFile) {
      setMessage("Open a file first");
      return;
    }
    const parts = selectedFile.split("/");
    const next = { ...openFolders };
    parts.slice(0, -1).reduce((current, part) => {
      const path = current ? `${current}/${part}` : part;
      next[path] = true;
      return path;
    }, "");
    setOpenFolders(next);
    setFileSearch("");
    setMessage(`Revealed ${selectedFile}`);
  }

  function toggleShowHiddenFiles() {
    setShowHiddenFiles((value) => !value);
  }

  async function copySelectedPath() {
    if (!selectedFile) return;
    await navigator.clipboard?.writeText(selectedFile);
    setMessage("Path copied");
  }

  async function exportTaskHistory() {
    if (!state.tasks.length) {
      setMessage("No task history to export");
      return;
    }
    const blob = new Blob([JSON.stringify(state.tasks, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${state.project?.slug || "workspace"}-task-history.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage("Task history exported");
  }

  function clearWorkspaceCacheNotice() {
    setMessage("Workspace cache is stored internally and hidden from the project explorer.");
  }


  const conversationEvents = [...(activeTask?.events || []), ...streamEvents]
    .sort((a, b) => a.sequence - b.sequence)
    .filter((event, index, list) => list.findIndex((item) => item.type === event.type && item.message === event.message) === index);
  const latestRuntimeEvent = [...conversationEvents].reverse().find((event) => event.type === "speed_benchmark" || event.type === "done");
  const runtimeStats = runtimeStatsFromEvent(latestRuntimeEvent);
  const filteredActivityEvents = conversationEvents.filter((event) => {
    const query = activityFilter.trim().toLowerCase();
    return !query || event.type.toLowerCase().includes(query) || event.message.toLowerCase().includes(query);
  });
  const previewWidth = previewMode === "1440px" ? 1440 : previewMode === "1280px" ? 1280 : previewMode === "768px" ? 768 : previewMode === "390px" ? 390 : previewDevice === "Mobile" ? 390 : previewDevice === "Tablet" ? 768 : 1180;
  const previewFrameWidth = previewMode === "Responsive" && previewDevice === "Desktop" ? "100%" : previewRotated && previewDevice !== "Desktop" ? `${Math.min(1180, Math.max(previewWidth, 760))}px` : `${previewWidth}px`;
  const memoryItems = [
    state.memory?.projectSummary ? `Summary: ${state.memory.projectSummary}` : "",
    ...(state.memory?.recentDecisions || []).map((item) => `Decision: ${item}`),
    ...(state.memory?.knownIssues || []).map((item) => `Issue: ${item}`),
    ...(state.memory?.successfulFixes || []).map((item) => `Fix: ${item}`),
    ...(state.memory?.designStyle || []).map((item) => `Style: ${item}`),
  ].filter((item) => item.toLowerCase().includes(memorySearch.toLowerCase()));
  const commandList = [
    { label: "Create file", action: () => void createWorkspaceFile() },
    { label: "Create folder", action: () => void createWorkspaceFolder() },
    { label: "Save file", action: () => void saveCurrentFile(), disabled: !selectedFile || !fileDirty, reason: "Open and edit a file first" },
    { label: "Download project ZIP", action: downloadProjectZip, disabled: !state.project, reason: "Open a workspace first" },
    { label: "Run project", action: () => void runAgent(), disabled: loading || !prompt.trim(), reason: "Enter a prompt or wait for current task" },
    { label: "Stop server/task", action: stopTask, disabled: !loading, reason: "No running task" },
    { label: "Restart preview", action: () => void refreshPreview(), disabled: !state.project, reason: "Open a workspace first" },
    { label: "Reset layout", action: resetLayout },
    { label: "Toggle left panel", action: () => setLeftCollapsed((value) => !value) },
    { label: "Toggle right panel", action: () => setRightCollapsed((value) => !value) },
    { label: "Toggle bottom panel", action: () => setBottomCollapsed((value) => !value) },
    { label: "Fullscreen preview", action: () => setPreviewFullscreen((value) => !value) },
    { label: "Fullscreen editor", action: () => setEditorFullscreen((value) => !value) },
    { label: "Rollback last task", action: () => setMessage("Rollback is available from task history; direct rollback requires task selection."), disabled: true, reason: "Select a task snapshot first" },
  ].filter((command) => command.label.toLowerCase().includes(commandQuery.toLowerCase()));
  const renderExplorerNode = (node: TreeNode, depth = 0): ReactNode => {
    const liveStatus = liveFileStatuses[node.path];
    const badge = liveStatus || statusLabel(node.status);
    const internal = isInternalWorkspaceFile(node.path);
    if (node.type === "file") {
      const fileIcon = fileIconFor(node.name);
      const Icon = fileIcon.Icon;
      return (
        <button
          key={node.path}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setContextMenu({ x: event.clientX, y: event.clientY, node });
          }}
          onClick={() => openFile(node.path)}
          className={`flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] transition ${internal ? "opacity-55" : ""} ${
            selectedFile === node.path
              ? "bg-[#6D4AFF]/10 text-[#6D4AFF] dark:bg-[#7C5CFF]/18 dark:text-white"
              : "text-[#374151] hover:bg-[#F6F7FB] dark:text-[#D1D5DB] dark:hover:bg-[#1A1E27]"
          }`}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
        >
          <Icon className={`size-4 shrink-0 ${fileIcon.color}`} />
          <span className="min-w-0 flex-1 truncate">{node.name}</span>
          {internal && <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-600 dark:text-amber-300">Internal</span>}
          {badge && <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-600 dark:text-emerald-300">{badge}</span>}
        </button>
      );
    }
    const open = openFolders[node.path] ?? false;
    return (
      <div key={node.path}>
        <button
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setContextMenu({ x: event.clientX, y: event.clientY, node });
          }}
          onClick={() => setOpenFolders((current) => ({ ...current, [node.path]: !open }))}
          className={`flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] text-[#374151] transition duration-200 hover:bg-[#F6F7FB] dark:text-[#D1D5DB] dark:hover:bg-[#1A1E27] ${internal ? "opacity-55" : ""}`}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
        >
          <ChevronRight className={`size-3.5 shrink-0 text-[#6B7280] transition ${open ? "rotate-90" : ""}`} />
          <span className="grid size-5 shrink-0 place-items-center rounded-md bg-amber-100 text-amber-600 dark:bg-amber-400/12 dark:text-amber-300">
            {open ? <FolderOpen className="size-3.5" /> : <Folder className="size-3.5" />}
          </span>
          <span className="min-w-0 flex-1 truncate">{node.name}</span>
          {internal && <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-600 dark:text-amber-300">Internal</span>}
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="overflow-hidden"
            >
              {(node.children || []).map((child) => renderExplorerNode(child, depth + 1))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <div onClick={() => { setContextMenu(null); setExplorerMenuOpen(false); }} className="h-screen overflow-hidden bg-[#f6f7fb] font-sans text-[13px] text-[#111827] antialiased transition-colors dark:bg-[#0B0D12] dark:text-white">
      <main className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[var(--workspace-left)_minmax(620px,1fr)_var(--workspace-right)]" style={{ "--workspace-left": leftCollapsed || previewFullscreen || editorFullscreen ? "0px" : `${leftWidth}px`, "--workspace-right": rightCollapsed || previewFullscreen || editorFullscreen ? "0px" : `${rightWidth}px` } as React.CSSProperties}>
        <aside className={`relative min-h-0 border-r border-[#E5E7EB] bg-white/92 shadow-[8px_0_40px_rgba(15,23,42,0.04)] backdrop-blur-xl dark:border-[#22252D] dark:bg-[#111318]/95 ${leftCollapsed || previewFullscreen || editorFullscreen ? "hidden" : "hidden lg:flex lg:flex-col"}`}>
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-[#E5E7EB] px-4 dark:border-[#22252D]">
            <div className="flex items-center gap-2">
              <div className="grid size-7 place-items-center rounded-lg bg-[#6D4AFF] text-white shadow-lg shadow-violet-500/20">
                <Sparkles className="size-4" />
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6B7280] dark:text-[#9CA3AF]">Explorer</div>
                <div className="text-sm font-semibold">Meldex</div>
              </div>
            </div>
            <button onClick={(event) => { event.stopPropagation(); setExplorerMenuOpen((value) => !value); }} className="grid size-8 place-items-center rounded-lg text-[#6B7280] transition hover:bg-[#F6F7FB] dark:text-[#9CA3AF] dark:hover:bg-[#1A1E27]" title="Explorer actions">
              <MoreHorizontal className="size-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            <button className="mb-2 flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] font-semibold uppercase tracking-[0.03em] hover:bg-[#F6F7FB] dark:hover:bg-[#1A1E27]">
              <ChevronRight className="size-3.5 rotate-90 text-[#6B7280] dark:text-[#9CA3AF]" />
              MELDEX-WORKSPACE
            </button>
            <div className="mb-3 flex h-8 items-center gap-2 rounded-lg border border-[#E5E7EB] bg-[#F6F7FB] px-2 text-[#6B7280] dark:border-[#22252D] dark:bg-[#0B0D12] dark:text-[#9CA3AF]">
              <Search className="size-3.5" />
              <input value={fileSearch} onChange={(event) => setFileSearch(event.target.value)} className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-[#9CA3AF]" placeholder="Search files" />
            </div>
            {showHiddenFiles && (
              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] leading-4 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                Internal files are shown. Editing them may break the IDE.
              </div>
            )}

            <div className="space-y-0.5">
              {visibleTree.length ? visibleTree.map((node) => renderExplorerNode(node)) : <div className="rounded-lg border border-dashed border-[#E5E7EB] p-3 text-[12px] text-[#6B7280] dark:border-[#22252D] dark:text-[#9CA3AF]">No project files yet. Ask Meldex AI to create your app.</div>}
            </div>
          </div>

          {explorerMenuOpen && (
            <div className="absolute right-3 top-11 z-40 w-72 overflow-hidden rounded-xl border border-[#E5E7EB] bg-white py-2 text-[12px] shadow-2xl dark:border-[#22252D] dark:bg-[#111318]" onClick={(event) => event.stopPropagation()}>
              {[
                ["New File", () => void createWorkspaceFile()],
                ["New Folder", () => void createWorkspaceFolder()],
                ["Save Current File", () => void saveCurrentFile(), !selectedFile || !fileDirty, "Open and edit a file first"],
                ["Save All", () => void saveCurrentFile(), !fileDirty, "No unsaved editor changes"],
                ["Rename Selected", () => selectedNode && void renameFile(selectedNode), !selectedNode, "Select a file first"],
                ["Delete Selected", () => selectedNode && void deleteFile(selectedNode), !selectedNode, "Select a file first"],
                ["Duplicate Selected", () => selectedNode && void duplicateFile(selectedNode), !selectedNode, "Select a file first"],
                ["Copy Path", () => void copySelectedPath(), !selectedFile, "Select a file first"],
                ["Upload File", () => setMessage("Upload is not available in this release"), true, "Upload is not available in this release"],
                ["Download Selected File", () => selectedNode && void downloadFile(selectedNode), !selectedNode, "Select a file first"],
                ["Download Project ZIP", downloadProjectZip, !state.project, "Open a workspace first"],
                ["Refresh Explorer", () => void loadWorkspace()],
                ["Reveal Active File", revealActiveFile, !selectedFile, "Open a file first"],
                ["Collapse All", collapseAllFolders],
                ["Expand All", expandAllFolders],
                ["Project Settings", () => setMessage("Project settings are managed from workspace settings."), true, "Project settings are not available in this release"],
                [showHiddenFiles ? "Hide Internal Files" : "Show Hidden Files", toggleShowHiddenFiles],
                [sortMode === "name" ? "Sort by Type" : "Sort by Name", () => setSortMode(sortMode === "name" ? "type" : "name")],
                [showChangedOnly ? "Show All Files" : "Show Changed Files Only", () => setShowChangedOnly((value) => !value)],
                ["Export Task History", () => void exportTaskHistory(), !state.tasks.length, "No task history yet"],
                ["Clear Workspace Cache", clearWorkspaceCacheNotice],
                ["Command Palette", () => setCommandPaletteOpen(true)],
              ].map(([label, action, disabled, reason]) => (
                <button
                  key={String(label)}
                  disabled={Boolean(disabled)}
                  title={disabled ? String(reason) : String(label)}
                  onClick={() => {
                    if (disabled || typeof action !== "function") return;
                    action();
                    setExplorerMenuOpen(false);
                  }}
                  className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-[#F6F7FB] disabled:cursor-not-allowed disabled:opacity-45 dark:hover:bg-[#1A1E27]"
                >
                  <span>{String(label)}</span>
                  {disabled ? <span className="max-w-[130px] truncate text-[10px] text-[#6B7280] dark:text-[#9CA3AF]">{String(reason)}</span> : null}
                </button>
              ))}
            </div>
          )}

          <div className="shrink-0 border-t border-[#E5E7EB] dark:border-[#22252D]">
            <button disabled title="Outline appears after symbol indexing is available" className="flex h-10 w-full cursor-not-allowed items-center gap-2 px-4 text-left text-[12px] font-semibold uppercase tracking-[0.08em] text-[#9CA3AF] opacity-70"><ChevronRight className="size-3.5" /> Outline</button>
            <button disabled title="Timeline appears after file history is available" className="flex h-10 w-full cursor-not-allowed items-center gap-2 border-t border-[#E5E7EB] px-4 text-left text-[12px] font-semibold uppercase tracking-[0.08em] text-[#9CA3AF] opacity-70 dark:border-[#22252D]"><ChevronRight className="size-3.5" /> Timeline</button>
          </div>
          <div onMouseDown={(event) => startResize("left", event)} className="absolute right-[-3px] top-0 z-20 hidden h-full w-1 cursor-col-resize bg-transparent transition hover:bg-[#6D4AFF]/70 lg:block" />
        </aside>

        <section className="flex min-h-0 flex-col bg-[#F6F7FB] dark:bg-[#0B0D12]">
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[#E5E7EB] bg-white/74 px-4 backdrop-blur-xl dark:border-[#22252D] dark:bg-[#111318]/70">
            <div className="flex h-9 items-center overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-sm dark:border-[#22252D] dark:bg-[#111318]">
              <button className="flex h-full items-center gap-2 border-r border-[#E5E7EB] px-3 text-sm font-semibold dark:border-[#22252D]"><Globe2 className="size-4 text-[#6D4AFF]" /> Meldex IDE</button>
              <button onClick={refreshPreview} disabled={!state.project || previewAction !== "idle"} className="grid h-full w-9 place-items-center text-[#6B7280] hover:bg-[#F6F7FB] disabled:opacity-40 dark:text-[#9CA3AF] dark:hover:bg-[#1A1E27]"><RefreshCw className={`size-4 ${previewAction === "refreshing" ? "animate-spin" : ""}`} /></button>
            </div>
            <div className="ml-1 flex h-9 items-center rounded-xl border border-[#E5E7EB] bg-white p-1 shadow-sm dark:border-[#22252D] dark:bg-[#111318]">
              {(["code", "preview", "split"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setCenterMode(mode)}
                  className={`h-7 rounded-lg px-3 text-xs font-semibold capitalize transition ${centerMode === mode ? "bg-[#6D4AFF] text-white shadow-sm" : "text-[#6B7280] hover:bg-[#F6F7FB] dark:text-[#9CA3AF] dark:hover:bg-[#1A1E27]"}`}
                >
                  {mode === "code" ? "Code" : mode === "preview" ? "Preview" : "Split"}
                </button>
              ))}
            </div>
            <button onClick={() => setBottomCollapsed((value) => !value)} className={`rounded-lg border px-3 py-2 text-xs font-medium hover:bg-[#F6F7FB] dark:hover:bg-[#1A1E27] ${!bottomCollapsed ? "border-[#6D4AFF]/40 bg-[#6D4AFF]/8 text-[#6D4AFF]" : "border-[#E5E7EB] dark:border-[#22252D]"}`}>Terminal</button>
            <button onClick={toggleAiPanel} className={`rounded-lg border px-3 py-2 text-xs font-medium hover:bg-[#F6F7FB] dark:hover:bg-[#1A1E27] ${rightCollapsed ? "border-[#E5E7EB] dark:border-[#22252D]" : "border-[#6D4AFF]/40 bg-[#6D4AFF]/8 text-[#6D4AFF]"}`}>AI</button>
            <button onClick={() => setCommandPaletteOpen((value) => !value)} className={`rounded-lg border px-3 py-2 text-xs font-medium hover:bg-[#F6F7FB] dark:hover:bg-[#1A1E27] ${commandPaletteOpen ? "border-[#6D4AFF]/40 bg-[#6D4AFF]/8 text-[#6D4AFF]" : "border-[#E5E7EB] dark:border-[#22252D]"}`}>Search</button>
            <button onClick={resetLayout} className="ml-auto rounded-lg border border-[#E5E7EB] px-3 py-2 text-xs font-medium hover:bg-[#F6F7FB] dark:border-[#22252D] dark:hover:bg-[#1A1E27]">Reset</button>
          </div>

          {(centerMode === "preview" || previewFullscreen) && <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[#E5E7EB] bg-white/88 px-4 dark:border-[#22252D] dark:bg-[#111318]/88">
            <button disabled title="Preview history is not available in this release" className="grid size-8 cursor-not-allowed place-items-center rounded-lg text-[#9CA3AF]"><ChevronRight className="size-4 rotate-180" /></button>
            <button disabled title="Preview history is not available in this release" className="grid size-8 cursor-not-allowed place-items-center rounded-lg text-[#9CA3AF]"><ChevronRight className="size-4" /></button>
            <button onClick={refreshPreview} disabled={!state.project || previewAction !== "idle"} className="grid size-8 place-items-center rounded-lg text-[#6B7280] hover:bg-[#F6F7FB] disabled:opacity-40 dark:text-[#9CA3AF] dark:hover:bg-[#1A1E27]"><RefreshCw className={`size-4 ${previewAction === "refreshing" ? "animate-spin" : ""}`} /></button>
            <div className="mx-2 flex h-8 min-w-0 flex-1 items-center gap-2 rounded-xl border border-[#E5E7EB] bg-[#F6F7FB] px-3 text-[12px] text-[#6B7280] dark:border-[#22252D] dark:bg-[#0B0D12] dark:text-[#9CA3AF]"><Globe2 className="size-3.5" /><span className="truncate">{previewFullUrl || "https://meldex.workspace/preview"}</span></div>
            <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${statusTone}`}>{state.preview?.httpStatus ? `HTTP ${state.preview.httpStatus}` : previewStatus}</span>
            <select value={previewDevice} onChange={(event) => selectPreviewDevice(event.target.value as typeof previewDevice)} className="h-8 rounded-lg border border-[#E5E7EB] bg-white px-2 text-[12px] outline-none dark:border-[#22252D] dark:bg-[#111318]"><option>Desktop</option><option>Tablet</option><option>Mobile</option></select>
            <select value={previewMode} onChange={(event) => setPreviewMode(event.target.value as typeof previewMode)} className="h-8 rounded-lg border border-[#E5E7EB] bg-white px-2 text-[12px] outline-none dark:border-[#22252D] dark:bg-[#111318]"><option>Responsive</option><option>1440px</option><option>1280px</option><option>768px</option><option>390px</option></select>
            <select value={previewZoom} onChange={(event) => setPreviewZoom(Number(event.target.value))} className="h-8 rounded-lg border border-[#E5E7EB] bg-white px-2 text-[12px] outline-none dark:border-[#22252D] dark:bg-[#111318]"><option value={75}>75%</option><option value={90}>90%</option><option value={100}>100%</option><option value={125}>125%</option></select>
            <button onClick={() => setPreviewRotated((value) => !value)} disabled={previewDevice === "Desktop"} title={previewDevice === "Desktop" ? "Rotate is available for tablet/mobile preview" : "Rotate device"} className="grid size-8 place-items-center rounded-lg border border-[#E5E7EB] bg-white text-[#6B7280] hover:bg-[#F6F7FB] disabled:opacity-40 dark:border-[#22252D] dark:bg-[#111318] dark:text-[#9CA3AF]"><RotateCcw className="size-4" /></button>
            {previewReady ? <a href={previewDisplayUrl} target="_blank" rel="noopener noreferrer" className="grid size-8 place-items-center rounded-lg border border-[#E5E7EB] bg-white text-[#6B7280] hover:bg-[#F6F7FB] dark:border-[#22252D] dark:bg-[#111318] dark:text-[#9CA3AF]"><ArrowUpRight className="size-4" /></a> : <button disabled className="grid size-8 place-items-center rounded-lg border border-[#E5E7EB] text-[#9CA3AF] dark:border-[#22252D]"><ArrowUpRight className="size-4" /></button>}
            <button onClick={copyPreviewUrl} disabled={!previewReady} className="grid size-8 place-items-center rounded-lg border border-[#E5E7EB] bg-white text-[#6B7280] hover:bg-[#F6F7FB] disabled:opacity-40 dark:border-[#22252D] dark:bg-[#111318] dark:text-[#9CA3AF]" title="Copy Preview URL">{copiedPreview ? <CheckCircle2 className="size-4" /> : <Copy className="size-4" />}</button>
            <button onClick={() => setPreviewFullscreen((value) => !value)} className="grid size-8 place-items-center rounded-lg border border-[#E5E7EB] bg-white text-[#6B7280] hover:bg-[#F6F7FB] dark:border-[#22252D] dark:bg-[#111318] dark:text-[#9CA3AF]" title="Fullscreen preview"><Maximize2 className="size-4" /></button>
            <button onClick={refreshPreview} disabled={!state.project || previewAction !== "idle"} className="grid size-8 place-items-center rounded-lg border border-[#E5E7EB] bg-white text-[#6B7280] hover:bg-[#F6F7FB] disabled:opacity-40 dark:border-[#22252D] dark:bg-[#111318] dark:text-[#9CA3AF]"><RotateCcw className="size-4" /></button>
          </div>}

          <div className={`${centerMode === "split" && !previewFullscreen && !editorFullscreen ? "flex" : "block"} min-h-0 flex-1 overflow-hidden p-3`}>
            {(centerMode === "code" || centerMode === "split" || editorFullscreen) && !previewFullscreen && (
              <div className={`min-h-0 overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-sm dark:border-[#22252D] dark:bg-[#111318] ${editorFullscreen ? "fixed inset-3 z-40" : ""}`} style={centerMode === "split" && !editorFullscreen ? { width: `${splitRatio}%` } : { width: "100%", height: "100%" }}>
                <div className="flex h-10 items-center justify-between border-b border-[#E5E7EB] bg-[#F6F7FB] px-3 dark:border-[#22252D] dark:bg-[#0B0D12]">
                  <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
                    {openTabs.length ? openTabs.map((tab) => (
                      <button key={tab} onClick={() => void openFile(tab)} className={`flex h-8 max-w-[220px] items-center gap-2 rounded-lg px-3 text-xs ${selectedFile === tab ? "bg-white text-[#111827] shadow-sm dark:bg-[#1A1E27] dark:text-white" : "text-[#6B7280] hover:bg-white/70 dark:text-[#9CA3AF] dark:hover:bg-[#1A1E27]"}`}>
                        <span className="truncate">{tab}</span>
                        {selectedFile === tab && fileDirty ? <span className="size-1.5 rounded-full bg-[#6D4AFF]" /> : null}
                      </button>
                    )) : <span className="text-xs text-[#6B7280] dark:text-[#9CA3AF]">Open a file from Explorer to edit.</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => void saveCurrentFile()} disabled={!fileDirty || savingFile} className="grid size-8 place-items-center rounded-lg text-[#6B7280] hover:bg-white disabled:opacity-40 dark:text-[#9CA3AF] dark:hover:bg-[#1A1E27]" title="Save file"><Save className="size-4" /></button>
                    <button onClick={() => setEditorFullscreen((value) => !value)} className="grid size-8 place-items-center rounded-lg text-[#6B7280] hover:bg-white dark:text-[#9CA3AF] dark:hover:bg-[#1A1E27]" title="Fullscreen editor"><Maximize2 className="size-4" /></button>
                  </div>
                </div>
                {selectedFile && (
                  <div className="flex h-8 items-center justify-between border-b border-[#E5E7EB] bg-white px-3 text-[11px] text-[#6B7280] dark:border-[#22252D] dark:bg-[#111318] dark:text-[#9CA3AF]">
                    <div className="flex min-w-0 items-center gap-2">
                      <FileCode2 className="size-3.5 shrink-0 text-[#6D4AFF]" />
                      <span className="truncate font-medium text-[#374151] dark:text-[#D1D5DB]">{selectedFile}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {liveCursor?.path === selectedFile ? <span className="rounded-full bg-[#7C5CFF]/10 px-2 py-0.5 font-semibold text-[#6D4AFF] dark:bg-[#7C5CFF]/20 dark:text-violet-200">Ln {liveCursor.line}, Col {liveCursor.column}</span> : null}
                      <span>{editorLanguage}</span>
                      <span>{editorContent.split("\n").length} lines</span>
                      {liveCursor?.path === selectedFile && typeof liveCursor.percent === "number" ? <span>{liveCursor.percent}% typed</span> : null}
                      <span>{fileDirty ? "unsaved" : "saved"}</span>
                    </div>
                  </div>
                )}
                <div className={selectedFile ? "h-[calc(100%-4.5rem)]" : "h-[calc(100%-2.5rem)]"}>
                  {selectedFile ? (
                    <textarea
                      key={selectedFile}
                      ref={editorRef}
                      value={editorContent}
                      onChange={(event) => setEditorContent(event.target.value)}
                      spellCheck={false}
                      aria-label={`Code editor for ${selectedFile}`}
                      className="h-full w-full resize-none bg-white p-4 font-mono text-[13px] leading-6 text-[#111827] outline-none selection:bg-[#7C5CFF]/20 dark:bg-[#0B0D12] dark:text-[#E5E7EB]"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-[#6B7280] dark:text-[#9CA3AF]">Select a file to open the code editor.</div>
                  )}
                </div>
              </div>
            )}
            {centerMode === "split" && !previewFullscreen && !editorFullscreen ? <div onMouseDown={startSplitResize} className="mx-2 h-full w-1 cursor-col-resize rounded-full bg-transparent hover:bg-[#6D4AFF]/70" /> : null}
            {(centerMode === "preview" || centerMode === "split" || previewFullscreen) && !editorFullscreen && (
            <div className={`mx-auto flex h-full min-h-0 flex-col rounded-xl border border-[#E5E7EB] bg-white shadow-[0_24px_90px_rgba(15,23,42,0.10)] dark:border-[#22252D] dark:bg-[#111318] dark:shadow-[0_24px_90px_rgba(0,0,0,0.38)] ${previewFullscreen ? "fixed inset-3 z-40 max-w-none" : ""}`} style={centerMode === "split" && !previewFullscreen ? { width: `${100 - splitRatio}%` } : { width: "100%", maxWidth: centerMode === "preview" ? "none" : 1180 }}>
              <div className="flex h-10 shrink-0 items-center gap-2 border-b border-[#E5E7EB] px-3 dark:border-[#22252D]">
                <div className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold"><Globe2 className="size-4 shrink-0 text-[#6D4AFF]" /><span className="truncate">{previewFullUrl || "Live Preview"}</span></div>
                <span className={`rounded-full px-2 py-1 text-[11px] ${statusTone}`}>{state.preview?.httpStatus ? `HTTP ${state.preview.httpStatus}` : previewStatus}</span>
                <button onClick={refreshPreview} disabled={!state.project || previewAction !== "idle"} title="Refresh preview" className="grid size-7 place-items-center rounded-lg hover:bg-[#F6F7FB] disabled:opacity-40 dark:hover:bg-[#1A1E27]"><RefreshCw className={`size-3.5 ${previewAction === "refreshing" ? "animate-spin" : ""}`} /></button>
                {previewReady ? <a href={previewDisplayUrl} target="_blank" rel="noopener noreferrer" title="Open preview" className="grid size-7 place-items-center rounded-lg hover:bg-[#F6F7FB] dark:hover:bg-[#1A1E27]"><ArrowUpRight className="size-3.5" /></a> : <button disabled title="Preview is not ready" className="grid size-7 place-items-center rounded-lg opacity-40"><ArrowUpRight className="size-3.5" /></button>}
                <button onClick={copyPreviewUrl} disabled={!previewReady} title="Copy preview URL" className="grid size-7 place-items-center rounded-lg hover:bg-[#F6F7FB] disabled:opacity-40 dark:hover:bg-[#1A1E27]">{copiedPreview ? <CheckCircle2 className="size-3.5" /> : <Copy className="size-3.5" />}</button>
                {centerMode === "split" && <select value={previewDevice} onChange={(event) => selectPreviewDevice(event.target.value as typeof previewDevice)} className="h-7 rounded-lg border border-[#E5E7EB] bg-white px-1.5 text-[11px] outline-none dark:border-[#22252D] dark:bg-[#111318]"><option>Desktop</option><option>Tablet</option><option>Mobile</option></select>}
                {centerMode === "split" && <select value={previewZoom} onChange={(event) => setPreviewZoom(Number(event.target.value))} className="h-7 rounded-lg border border-[#E5E7EB] bg-white px-1.5 text-[11px] outline-none dark:border-[#22252D] dark:bg-[#111318]"><option value={75}>75%</option><option value={90}>90%</option><option value={100}>100%</option><option value={125}>125%</option></select>}
              </div>
              <div className="min-h-0 flex-1 overflow-auto bg-[#edf0f7] p-4 dark:bg-black">
                <div className="mx-auto h-full origin-top overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-black/5 transition-all duration-200 dark:bg-black dark:ring-white/10" style={{ width: previewFrameWidth, maxWidth: "100%", transform: `scale(${previewZoom / 100})`, transformOrigin: "top center" }}>
                  {previewReady ? <iframe key={previewUrl} src={previewUrl} className="h-full w-full rounded-b-xl bg-white" sandbox="allow-scripts allow-forms" /> : <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_50%_0%,rgba(124,92,255,0.18),transparent_36%),linear-gradient(180deg,#0B0D12,#111318)] p-10 text-white"><div className="max-w-2xl text-center"><div className="mx-auto mb-5 grid size-12 place-items-center rounded-2xl bg-[#7C5CFF] shadow-xl shadow-violet-500/25"><Sparkles className="size-6" /></div><p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-violet-200">The Ultimate AI Coding Platform</p><h2 className="text-5xl font-bold tracking-tight">Build Anything<br />with <span className="text-[#7C5CFF]">AI Power</span></h2><p className="mx-auto mt-5 max-w-xl text-base leading-7 text-[#D1D5DB]">Meldex AI combines agents, preview, memory, and code generation into one production workspace.</p><button onClick={() => void runAgent()} className="mt-8 rounded-xl bg-[#7C5CFF] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-500/25"><Play className="mr-2 inline size-4" /> Start Building</button></div></div>}
                </div>
              </div>
            </div>
            )}
          </div>
          {!bottomCollapsed && (
            <div className="relative shrink-0 border-t border-[#E5E7EB] bg-white dark:border-[#22252D] dark:bg-[#111318]" style={{ height: bottomHeight }}>
              <div onMouseDown={startBottomResize} className="absolute left-0 top-[-3px] h-1 w-full cursor-row-resize bg-transparent hover:bg-[#6D4AFF]/70" />
              <div className="flex h-9 items-center justify-between border-b border-[#E5E7EB] px-3 dark:border-[#22252D]">
                <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.08em]">
                  {(["TERMINAL", "PROBLEMS", "OUTPUT", "LOGS", "GIT", "PREVIEW LOGS"] as const).map((tab) => <button key={tab} onClick={() => setBottomTab(tab)} className={`rounded-lg px-3 py-1.5 ${bottomTab === tab ? "bg-[#6D4AFF]/10 text-[#6D4AFF] dark:bg-[#7C5CFF]/15 dark:text-white" : "text-[#6B7280] hover:bg-[#F6F7FB] dark:text-[#9CA3AF] dark:hover:bg-[#1A1E27]"}`}>{tab}</button>)}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => { setTerminalOutput(["Output cleared."]); setMessage("Terminal output cleared"); }} className="rounded-lg border border-[#E5E7EB] px-2 py-1 text-xs dark:border-[#22252D]">Clear</button>
                  <button onClick={() => void navigator.clipboard?.writeText(terminalOutput.join("\n"))} className="rounded-lg border border-[#E5E7EB] px-2 py-1 text-xs dark:border-[#22252D]">Copy</button>
                  <button onClick={() => setBottomCollapsed(true)} className="rounded-lg border border-[#E5E7EB] px-2 py-1 text-xs dark:border-[#22252D]">Collapse</button>
                </div>
              </div>
              <pre className="h-[calc(100%-2.25rem)] overflow-auto p-3 font-mono text-xs leading-5 text-[#374151] dark:text-[#D1D5DB]">{bottomTab === "TERMINAL" ? terminalOutput.join("\n") : bottomTab === "OUTPUT" ? message : bottomTab === "PROBLEMS" ? "No blocking problems detected in the current workspace UI session." : bottomTab === "GIT" ? changed.map((diff) => `${diff.path} +${diff.added} -${diff.removed}`).join("\n") || "No changed files yet." : bottomTab === "PREVIEW LOGS" ? state.preview?.message || "Preview logs will appear after verification." : conversationEvents.map((event) => `${event.type}: ${event.message}`).join("\n") || "No logs yet."}</pre>
            </div>
          )}
          <div className="flex h-7 shrink-0 items-center justify-between border-t border-[#E5E7EB] bg-white px-4 text-[11px] text-[#6B7280] dark:border-[#22252D] dark:bg-[#111318] dark:text-[#9CA3AF]"><span>{state.project?.name || "MELDEX-WORKSPACE"} · {selectedFile || "no file selected"}</span><span>{fileDirty ? "Unsaved changes" : message}</span></div>
        </section>

        <aside className={`relative min-h-0 flex-col border-l border-[#E5E7EB] bg-white/96 text-[#111827] shadow-[-10px_0_55px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-[#22252D] dark:bg-[#0B0D12]/98 dark:text-[#F9FAFB] dark:shadow-[-10px_0_55px_rgba(0,0,0,0.32)] ${rightCollapsed || previewFullscreen || editorFullscreen ? "hidden" : "flex"}`}>
          <div onMouseDown={(event) => startResize("right", event)} className="absolute left-[-3px] top-0 z-20 hidden h-full w-1 cursor-col-resize bg-transparent transition hover:bg-[#6D4AFF]/70 lg:block" />
          <div className="flex h-[54px] shrink-0 items-center justify-between border-b border-[#E5E7EB] px-5 dark:border-[#22252D]">
            <div className="flex h-full items-center">
              <button onClick={() => setActiveRightTab("CHAT")} className="relative h-full text-[12px] font-semibold uppercase tracking-[0.04em] text-[#111827] transition dark:text-white">
                MELDEX AI
                <span className="absolute inset-x-[-4px] bottom-0 h-0.5 rounded-full bg-[#7C5CFF] shadow-[0_0_14px_rgba(124,92,255,0.45)] dark:shadow-[0_0_14px_rgba(124,92,255,0.9)]" />
              </button>
            </div>
            <div className="relative flex items-center gap-1 text-[#6B7280] dark:text-[#A5ADBA]">
              <button onClick={() => { setPrompt(""); setStreamEvents([]); setLiveDiffs([]); setQueuedPrompt(""); setActiveRightTab("CHAT"); setMessage("New chat ready"); }} className="grid size-7 place-items-center rounded-lg transition hover:bg-[#F6F7FB] hover:text-[#111827] dark:hover:bg-[#1A1E27] dark:hover:text-white" title="New chat"><Plus className="size-3.5" /></button>
              <button onClick={() => { setAiHistoryOpen((open) => !open); setAiMenuOpen(false); setAiSettingsOpen(false); }} className="grid size-7 place-items-center rounded-lg transition hover:bg-[#F6F7FB] hover:text-[#111827] dark:hover:bg-[#1A1E27] dark:hover:text-white" title="Chat history"><History className="size-3.5" /></button>
              <button onClick={() => loadWorkspace().catch((error) => setMessage(error.message))} className="grid size-7 place-items-center rounded-lg transition hover:bg-[#F6F7FB] hover:text-[#111827] dark:hover:bg-[#1A1E27] dark:hover:text-white" title={loading ? "Command running" : "Sync Meldex AI"}><RefreshCw className={`size-3.5 ${loading ? "animate-spin text-[#7C5CFF]" : ""}`} /></button>
              <button onClick={() => { setAiSettingsOpen(true); setAiHistoryOpen(false); setAiMenuOpen(false); }} className="grid size-7 place-items-center rounded-lg transition hover:bg-[#F6F7FB] hover:text-[#111827] dark:hover:bg-[#1A1E27] dark:hover:text-white" title="Meldex AI settings"><Settings className="size-3.5" /></button>
              <button onClick={() => { setAiMenuOpen((open) => !open); setAiHistoryOpen(false); setAiSettingsOpen(false); }} className="grid size-7 place-items-center rounded-lg transition hover:bg-[#F6F7FB] hover:text-[#111827] dark:hover:bg-[#1A1E27] dark:hover:text-white" title="More actions"><MoreHorizontal className="size-3.5" /></button>
              {aiHistoryOpen && !aiSettingsOpen && (
                <div className="absolute right-10 top-10 z-[80] w-72 overflow-hidden rounded-2xl border border-[#D8DEE8] bg-white p-2 text-sm text-[#111827] shadow-[0_22px_70px_rgba(15,23,42,0.24)] ring-1 ring-black/5 dark:border-[#2A2E39] dark:bg-[#0F1117] dark:text-[#E5E7EB] dark:shadow-[0_22px_70px_rgba(0,0,0,0.7)] dark:ring-white/10">
                  <div className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#6B7280] dark:text-[#A5ADBA]">Chat history</div>
                  <div className="max-h-72 overflow-y-auto">
                    {state.tasks.length ? state.tasks.slice(0, 8).map((task) => (
                      <button
                        key={task.id}
                        onClick={() => { setPrompt(task.prompt); setActiveRightTab("CHAT"); setAiHistoryOpen(false); setMessage(task.summary || task.status); }}
                        className="block w-full rounded-xl px-3 py-2 text-left transition hover:bg-[#F6F7FB] dark:hover:bg-[#1A1E27]"
                      >
                        <div className="truncate text-[13px] font-medium">{task.prompt}</div>
                        <div className="mt-0.5 truncate text-[11px] text-[#6B7280] dark:text-[#9CA3AF]">{task.status} · {new Date(task.createdAt).toLocaleString()}</div>
                      </button>
                    )) : <div className="px-3 py-4 text-xs text-[#6B7280] dark:text-[#9CA3AF]">No chat history yet.</div>}
                  </div>
                </div>
              )}
              {aiMenuOpen && !aiSettingsOpen && (
                <div className="absolute right-0 top-10 z-[80] w-48 overflow-hidden rounded-2xl border border-[#D8DEE8] bg-white p-1.5 text-sm text-[#111827] shadow-[0_22px_70px_rgba(15,23,42,0.24)] ring-1 ring-black/5 dark:border-[#2A2E39] dark:bg-[#0F1117] dark:text-[#E5E7EB] dark:shadow-[0_22px_70px_rgba(0,0,0,0.7)] dark:ring-white/10">
                  <button onClick={() => { const next = window.prompt("Rename chat", prompt || activeTask?.prompt || "Meldex AI chat"); if (next?.trim()) { setPrompt(next.trim()); setMessage("Chat renamed"); } setAiMenuOpen(false); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition hover:bg-[#F6F7FB] dark:hover:bg-[#1A1E27]"><Edit3 className="size-3.5 text-[#6B7280] dark:text-[#A5ADBA]" /> Rename chat</button>
                  <button onClick={() => { setMessage("Chat archived"); setAiMenuOpen(false); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition hover:bg-[#F6F7FB] dark:hover:bg-[#1A1E27]"><Archive className="size-3.5 text-[#6B7280] dark:text-[#A5ADBA]" /> Archive chat</button>
                  <button onClick={() => { void navigator.clipboard?.writeText(activeTask?.summary || prompt || ""); setMessage("Chat copied"); setAiMenuOpen(false); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition hover:bg-[#F6F7FB] dark:hover:bg-[#1A1E27]"><Copy className="size-3.5 text-[#6B7280] dark:text-[#A5ADBA]" /> Copy</button>
                </div>
              )}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 [scrollbar-color:#CBD5E1_transparent] dark:[scrollbar-color:#2A2E39_transparent]">
            {activeRightTab === "CHAT" && <>
              <div className="mb-4 flex items-center gap-3">
                <button onClick={() => router.push("/workspace")} className="grid size-8 place-items-center rounded-lg text-[#6B7280] transition hover:bg-[#F6F7FB] hover:text-[#111827] dark:text-[#D1D5DB] dark:hover:bg-[#1A1E27] dark:hover:text-white" title="Back to workspaces"><ArrowLeft className="size-4" /></button>
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-semibold text-[#111827] dark:text-white">{activeTask?.prompt || prompt || "Run Meldex AI"}</div>
                  <div className="mt-1 text-[12px] text-[#6B7280] dark:text-[#9CA3AF]">{loading ? "Working" : message}</div>
                </div>
              </div>
              {files.length > 0 && (
                <button onClick={() => setActiveRightTab("CHANGES")} className="mb-5 flex items-center gap-2 rounded-lg px-1 text-[13px] text-[#6B7280] transition hover:text-[#111827] dark:text-[#D1D5DB] dark:hover:text-white">
                  <FileText className="size-4" />
                  Read {Math.min(files.length, 4)} file{Math.min(files.length, 4) === 1 ? "" : "s"}
                  <ChevronRight className="size-3.5" />
                </button>
              )}
              <div className="space-y-4 text-[14px] leading-7 text-[#111827] dark:text-[#F9FAFB]">
                <p>{loading ? "I'll update the workspace and verify the result in preview." : activeTask?.summary || "Tell Meldex AI what to build or change next."}</p>
                {runtimeStats && (
                  <div className="grid grid-cols-2 gap-2 rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] p-3 text-[12px] leading-5 text-[#6B7280] dark:border-[#22252D] dark:bg-[#0B0D12] dark:text-[#9CA3AF]">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.12em] text-[#94A3B8] dark:text-[#6B7280]">Model</div>
                      <div className="truncate font-medium text-[#111827] dark:text-[#F9FAFB]">{String(runtimeStats.modelLabel || runtimeStats.model || "Meldex AI")}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.12em] text-[#94A3B8] dark:text-[#6B7280]">Response</div>
                      <div className="font-medium text-[#111827] dark:text-[#F9FAFB]">{formatRuntimeMs(runtimeStats.responseTimeMs)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.12em] text-[#94A3B8] dark:text-[#6B7280]">Tokens/sec</div>
                      <div className="font-medium text-[#111827] dark:text-[#F9FAFB]">{typeof runtimeStats.tokensPerSecond === "number" ? runtimeStats.tokensPerSecond : "—"}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.12em] text-[#94A3B8] dark:text-[#6B7280]">Result</div>
                      <div className="font-medium text-[#111827] dark:text-[#F9FAFB]">{String(runtimeStats.filesWritten ?? "—")} files · {String(runtimeStats.previewStatus || "pending")}</div>
                    </div>
                  </div>
                )}
                {currentPromptDiffs.length > 0 && <p className="flex items-center gap-2 text-[#6B7280] dark:text-[#D1D5DB]"><Edit3 className="size-4" /> Edited {currentPromptDiffs.length} file{currentPromptDiffs.length === 1 ? "" : "s"}</p>}
                {loading && <p className="flex items-center gap-2">{message || "Working"} <span className="size-2 animate-pulse rounded-full bg-[#7C5CFF]" /></p>}
              </div>
              {currentPromptDiffs.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-5 overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white/88 shadow-[0_16px_40px_rgba(15,23,42,0.08)] dark:border-[#22252D] dark:bg-[#111318]/86 dark:shadow-[0_16px_40px_rgba(0,0,0,0.28)]">
                  <div className="flex items-center justify-between border-b border-[#E5E7EB] px-4 py-3 dark:border-[#22252D]">
                    <div className="text-[14px] font-medium">{currentPromptDiffs.length} file{currentPromptDiffs.length === 1 ? "" : "s"} changed <span className="ml-2 text-emerald-500">+{currentPromptDiffs.reduce((sum, file) => sum + file.added, 0)}</span> <span className="text-red-400">-{currentPromptDiffs.reduce((sum, file) => sum + file.removed, 0)}</span></div>
                    <button onClick={() => setActiveRightTab("CHANGES")} className="rounded-full border border-[#E5E7EB] px-3 py-1.5 text-[13px] transition hover:bg-[#F6F7FB] dark:border-[#2A2E39] dark:hover:bg-[#1A1E27]">Review</button>
                  </div>
                  <div className="divide-y divide-[#E5E7EB] dark:divide-[#22252D]">
                    {currentPromptDiffs.slice(0, 5).map((diff) => (
                      <div key={diff.path} className="group flex items-center gap-2 px-4 py-3 text-[13px]">
                        <FileCode2 className="size-4 shrink-0 text-[#6B7280] dark:text-[#D1D5DB]" />
                        <button onClick={() => openFile(diff.path)} className="min-w-0 flex-1 truncate text-left hover:text-[#6D4AFF]">{diff.path}</button>
                        <span className="text-emerald-500">+{diff.added}</span>
                        <span className="text-red-400">-{diff.removed}</span>
                        <button onClick={() => { void navigator.clipboard?.writeText(diff.path); setMessage("Path copied"); }} className="grid size-7 place-items-center rounded-lg opacity-70 transition hover:bg-[#F6F7FB] group-hover:opacity-100 dark:hover:bg-[#1A1E27]" title="Copy path"><Copy className="size-3.5" /></button>
                        <button disabled title="Revert individual file is not available until diff review is opened" className="grid size-7 cursor-not-allowed place-items-center rounded-lg opacity-35"><RotateCcw className="size-3.5" /></button>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
              {queuedPrompt && (
                <div className="mt-4 rounded-2xl border border-[#E5E7EB] bg-white/70 p-4 text-[13px] dark:border-[#22252D] dark:bg-[#111318]/70">
                  <div className="mb-2 font-medium">Queue</div>
                  <div className="rounded-xl bg-[#F6F7FB] p-3 text-[#6B7280] dark:bg-[#1A1E27] dark:text-[#D1D5DB]">{queuedPrompt}</div>
                </div>
              )}
            </>}
            {activeRightTab === "RULES" && <div className="space-y-3 text-sm"><div className="rounded-xl border border-[#E5E7EB] p-4 dark:border-[#22252D]"><div className="font-semibold">Workspace Rules</div><p className="mt-2 text-[#6B7280] dark:text-[#9CA3AF]">Rules are loaded from memory and orchestration. Raw secrets are never shown.</p></div>{(state.memory?.codingStyle || []).concat(state.memory?.designStyle || []).slice(0, 8).map((item) => <div key={item} className="rounded-lg bg-[#F6F7FB] p-3 dark:bg-[#1A1E27]">{item}</div>)}</div>}
            {activeRightTab === "CHANGES" && (
              <div className="space-y-2">
                {(changed.length ? changed.map((diff) => ({ path: diff.path, added: diff.added, removed: diff.removed })) : files.map((file) => ({ path: file.path, added: 0, removed: 0 }))).length ? (changed.length ? changed.map((diff) => ({ path: diff.path, added: diff.added, removed: diff.removed })) : files.map((file) => ({ path: file.path, added: 0, removed: 0 }))).map((file) => (
                  <div key={file.path} className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-[#F6F7FB] dark:hover:bg-[#1A1E27]">
                    <FileText className="size-4 shrink-0 text-[#6B7280] dark:text-[#A5ADBA]" />
                    <button onClick={() => openFile(file.path)} className="min-w-0 flex-1 truncate text-left text-sm">
                      {file.path}
                    </button>
                    <span className="text-[11px] text-emerald-500">+{file.added}</span>
                    <span className="text-[11px] text-red-500">-{file.removed}</span>
                    <button
                      onClick={() => {
                        void navigator.clipboard?.writeText(file.path);
                        setMessage("Path copied");
                      }}
                      className="grid size-7 place-items-center rounded-lg text-[#6B7280] hover:bg-[#F6F7FB] dark:text-[#9CA3AF] dark:hover:bg-white/10"
                      title="Copy file path"
                    >
                      <Copy className="size-3.5" />
                    </button>
                  </div>
                )) : <div className="text-[#6B7280] dark:text-[#9CA3AF]">No changes yet.</div>}
                <div className="grid grid-cols-3 gap-2 pt-2">
                  <button disabled title="Apply is automatic after generation in this release" className="rounded-lg border border-[#E5E7EB] py-2 text-xs opacity-45 dark:border-[#22252D]">Apply</button>
                  <button disabled title="Reject requires a selected diff snapshot" className="rounded-lg border border-[#E5E7EB] py-2 text-xs opacity-45 dark:border-[#22252D]">Reject</button>
                  <button disabled title="Rollback requires selecting a task snapshot" className="rounded-lg border border-[#E5E7EB] py-2 text-xs opacity-45 dark:border-[#22252D]">Rollback</button>
                </div>
              </div>
            )}
            {activeRightTab === "ACTIVITY" && <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border border-[#E5E7EB] px-2 dark:border-[#22252D]"><Search className="size-3.5" /><input value={activityFilter} onChange={(event) => setActivityFilter(event.target.value)} className="min-w-0 flex-1 bg-transparent text-xs outline-none" placeholder="Filter events" /></div>
                <button onClick={() => void navigator.clipboard?.writeText(filteredActivityEvents.map((event) => `${event.type}: ${event.message}`).join("\n"))} disabled={!filteredActivityEvents.length} className="rounded-lg border border-[#E5E7EB] px-3 py-2 text-xs disabled:opacity-45 dark:border-[#22252D]">Copy</button>
              </div>
              {filteredActivityEvents.length ? filteredActivityEvents.map((event) => <div key={`${event.sequence}-${event.type}`} className="rounded-lg border border-[#E5E7EB] p-3 text-xs dark:border-[#22252D]"><div className="font-semibold">{event.type.replaceAll("_", " ")}</div><div className="mt-1 text-[#6B7280] dark:text-[#9CA3AF]">{event.message}</div></div>) : <div className="text-[#6B7280] dark:text-[#9CA3AF]">Activity appears during generation.</div>}
            </div>}
            {activeRightTab === "MEMORY" && <div className="space-y-3"><div className="flex h-8 items-center gap-2 rounded-lg border border-[#E5E7EB] px-2 dark:border-[#22252D]"><Search className="size-3.5" /><input value={memorySearch} onChange={(event) => setMemorySearch(event.target.value)} className="min-w-0 flex-1 bg-transparent text-xs outline-none" placeholder="Search memory" /></div><button onClick={async () => { if (!state.project || !window.confirm("Clear workspace memory?")) return; const response = await fetch(`/api/workspaces/${state.project.id}/memory`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clear: true }) }); setMessage(response.ok ? "Memory cleared" : "Memory clear failed"); await loadWorkspace(state.project.id); }} className="rounded-lg border border-red-200 px-3 py-2 text-xs text-red-600 dark:border-red-500/30 dark:text-red-300">Clear memory</button>{memoryItems.length ? memoryItems.map((item) => <div key={item} className="rounded-lg bg-[#F6F7FB] p-3 text-xs dark:bg-[#1A1E27]">{item}</div>) : <div className="text-[#6B7280] dark:text-[#9CA3AF]">No matching memory.</div>}</div>}
          </div>
          <div className="shrink-0 border-t border-[#E5E7EB] p-4 dark:border-[#22252D]">
            <div className="rounded-2xl border border-[#E5E7EB]/70 bg-white/92 p-3 shadow-[0_14px_34px_rgba(15,23,42,0.08)] transition focus-within:border-[#7C5CFF] dark:border-[#22252D] dark:bg-[#111318]/92 dark:shadow-[0_14px_34px_rgba(0,0,0,0.28)]">
              <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if ((sendShortcut === "Enter" && event.key === "Enter" && !event.shiftKey) || ((event.metaKey || event.ctrlKey) && event.key === "Enter")) { event.preventDefault(); if (!loading && prompt.trim()) void runAgent(); } }} rows={3} className="w-full resize-none bg-transparent text-[14px] leading-6 outline-none placeholder:text-[#9CA3AF]" placeholder="Ask for follow-up changes..." />
              <div className="mt-3 flex items-center justify-between gap-3 text-[12px] text-[#6B7280] dark:text-[#9CA3AF]">
                <div className="flex min-w-0 items-center gap-2">
                  <button className="flex h-8 items-center gap-1.5 rounded-full border border-[#E5E7EB] px-3 text-amber-700 transition hover:bg-amber-50 dark:border-[#2A2E39] dark:text-amber-300 dark:hover:bg-amber-500/10" title="Workspace access is scoped to this project"><Sparkles className="size-3.5" /> Full access</button>
                  <select value={selectedAiModel} onChange={(event) => setSelectedAiModel(event.target.value)} className="h-9 w-[142px] shrink-0 rounded-full border border-[#E5E7EB] bg-white px-3 text-[12px] font-semibold leading-none text-[#374151] outline-none transition hover:bg-[#F6F7FB] dark:border-[#2A2E39] dark:bg-[#111318] dark:text-[#F3F4F6] dark:hover:bg-[#1A1E27]" title={`Model${usage?.plan.name ? ` · ${usage.plan.name}` : ""}`}>
                    <option>MelDex 1.0</option>
                  </select>
                </div>
                <button onClick={() => loading ? stopTask() : void runAgent()} disabled={!loading && !prompt.trim()} className="grid size-9 shrink-0 place-items-center rounded-full bg-[#111827] text-white shadow-sm transition hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-45 dark:bg-white dark:text-[#0B0D12]">{loading ? <Square className="size-4 fill-current" /> : <Play className="size-4" />}</button>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between text-[12px] text-[#6B7280] dark:text-[#9CA3AF]">
              <button onClick={() => setWorkMode(workMode === "local" ? "cloud" : "local")} className="flex items-center gap-1 transition hover:text-[#111827] dark:hover:text-white"><Globe2 className="size-3.5" /> Work {workMode === "local" ? "locally" : "in cloud"} <ChevronRight className={`size-3 transition ${workMode === "cloud" ? "rotate-90" : ""}`} /></button>
              <div className="flex items-center gap-3"><button disabled title="Team controls are not available in this release" className="opacity-45"><UserRound className="size-4" /></button><button onClick={() => { setAiSettingsOpen(true); setAiHistoryOpen(false); setAiMenuOpen(false); }} title="Notifications and settings"><Bell className="size-4" /></button></div>
            </div>
          </div>
          <AnimatePresence>
            {aiSettingsOpen && (
              <motion.div initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 28 }} transition={{ duration: 0.18 }} className="absolute inset-0 z-[70] flex flex-col border-l border-[#D8DEE8] bg-[#FCFCFD] text-[#111827] shadow-[-28px_0_90px_rgba(15,23,42,0.22)] ring-1 ring-black/5 dark:border-[#2A2E39] dark:bg-[#0B0D12] dark:text-white dark:shadow-[-28px_0_90px_rgba(0,0,0,0.65)] dark:ring-white/10">
                <div className="flex h-16 shrink-0 items-center justify-between border-b border-[#E5E7EB] px-6 dark:border-[#22252D]">
                  <h2 className="text-xl font-semibold">Meldex settings</h2>
                  <button onClick={() => setAiSettingsOpen(false)} className="grid size-9 place-items-center rounded-lg text-[#6B7280] transition hover:bg-[#F6F7FB] hover:text-[#111827] dark:text-[#D1D5DB] dark:hover:bg-[#1A1E27] dark:hover:text-white" title="Close settings"><X className="size-5" /></button>
                </div>
                <div className="grid min-h-0 flex-1 grid-cols-[148px_minmax(0,1fr)]">
                  <nav className="border-r border-[#E5E7EB] p-3 dark:border-[#22252D]">
                    {["General", "Configuration", "Personalization", "Usage & billing", "Hooks", "Plugins", "Chat Settings"].map((item) => (
                      <button key={item} onClick={() => setAiSettingsTab(item)} className={`mb-1 block w-full rounded-lg px-3 py-2 text-left text-[13px] transition ${aiSettingsTab === item ? "bg-[#7C5CFF]/12 text-[#6D4AFF] dark:bg-[#7C5CFF]/25 dark:text-white" : "text-[#6B7280] hover:bg-[#F6F7FB] dark:text-[#D1D5DB] dark:hover:bg-[#1A1E27]"}`}>{item}</button>
                    ))}
                  </nav>
                  <div className="overflow-y-auto p-6">
                    <h3 className="mb-7 text-xl font-semibold">{aiSettingsTab}</h3>
                    <div className="space-y-7 text-sm">
                      <label className="block">
                        <span className="font-semibold">Language</span>
                        <span className="mt-1 block text-[13px] text-[#6B7280] dark:text-[#9CA3AF]">Language for the app UI</span>
                        <select className="mt-3 h-10 w-full rounded-lg border border-[#E5E7EB] bg-white px-3 outline-none dark:border-[#2A2E39] dark:bg-[#111318]"><option>Auto detect</option><option>English</option><option>Gujarati friendly</option></select>
                      </label>
                      <label className="block">
                        <span className="font-semibold">Speed</span>
                        <span className="mt-1 block text-[13px] text-[#6B7280] dark:text-[#9CA3AF]">Choose how quickly Meldex AI runs across chats and agent tasks</span>
                        <select className="mt-3 h-10 w-full rounded-lg border border-[#E5E7EB] bg-white px-3 outline-none dark:border-[#2A2E39] dark:bg-[#111318]"><option>Standard</option><option>Fast</option><option>Careful</option></select>
                      </label>
                      <div>
                        <div className="font-semibold">Code review</div>
                        <div className="mt-1 text-[13px] leading-5 text-[#6B7280] dark:text-[#9CA3AF]">Start review in the current workspace when possible or launch a separate review chat</div>
                        <div className="mt-3 grid grid-cols-2 rounded-lg border border-[#E5E7EB] p-1 dark:border-[#2A2E39]"><button className="rounded-md bg-[#7C5CFF] px-3 py-2 text-white">Inline</button><button className="rounded-md px-3 py-2 text-[#6B7280] dark:text-[#D1D5DB]">Detached</button></div>
                      </div>
                      <label className="block">
                        <span className="font-semibold">Composer</span>
                        <span className="mt-1 block text-[13px] text-[#6B7280] dark:text-[#9CA3AF]">Send shortcut</span>
                        <select value={sendShortcut} onChange={(event) => setSendShortcut(event.target.value)} className="mt-3 h-10 w-full rounded-lg border border-[#E5E7EB] bg-white px-3 outline-none dark:border-[#2A2E39] dark:bg-[#111318]"><option>Enter</option><option>⌘ Enter</option></select>
                      </label>
                    </div>
                    <div className="mt-12 flex items-center justify-end gap-3"><button onClick={() => setSendShortcut("Enter")} className="text-sm text-[#6B7280] dark:text-[#9CA3AF]">Reset to defaults</button><button onClick={() => { setAiSettingsOpen(false); setMessage("Meldex AI settings saved"); }} className="rounded-lg bg-[#7C5CFF] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/20">Save changes</button></div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </aside>
      </main>
      {commandPaletteOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-4 pt-[12vh] backdrop-blur-sm" onClick={() => setCommandPaletteOpen(false)}>
          <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-2xl dark:border-[#22252D] dark:bg-[#111318]" onClick={(event) => event.stopPropagation()}>
            <div className="flex h-12 items-center gap-3 border-b border-[#E5E7EB] px-4 dark:border-[#22252D]">
              <Search className="size-4 text-[#6B7280] dark:text-[#9CA3AF]" />
              <input autoFocus value={commandQuery} onChange={(event) => setCommandQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setCommandPaletteOpen(false); }} className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Run a command..." />
            </div>
            <div className="max-h-[420px] overflow-y-auto p-2">
              {commandList.map((command) => (
                <button
                  key={command.label}
                  disabled={command.disabled}
                  title={command.disabled ? command.reason : command.label}
                  onClick={() => {
                    command.action();
                    setCommandPaletteOpen(false);
                    setCommandQuery("");
                  }}
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm hover:bg-[#F6F7FB] disabled:cursor-not-allowed disabled:opacity-45 dark:hover:bg-[#1A1E27]"
                >
                  <span>{command.label}</span>
                  {command.disabled ? <span className="text-[11px] text-[#6B7280] dark:text-[#9CA3AF]">{command.reason}</span> : null}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {onboardingOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#0B0D12]/70 p-6 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-[#22252D] bg-[#111318] p-6 text-white shadow-2xl shadow-black/40">
            <div className="flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-xl bg-[#7C5CFF] shadow-lg shadow-violet-500/25">
                <Sparkles className="size-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Welcome to Meldex IDE</h2>
                <p className="mt-1 text-sm text-[#9CA3AF]">Your workspace is ready. Build, edit, preview, and iterate with Meldex AI.</p>
              </div>
            </div>
            <div className="mt-5 grid gap-3 text-sm">
              {["Open real workspace files", "Ask Meldex AI to build", "Edit with the native code editor", "Run and verify preview"].map((item, index) => (
                <div key={item} className="flex items-center gap-3 rounded-xl border border-[#22252D] bg-[#0B0D12] p-3">
                  <span className="grid size-6 place-items-center rounded-full bg-[#7C5CFF]/15 text-xs text-[#C4B5FD]">{index + 1}</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={dismissOnboarding} className="rounded-lg border border-[#2A2E39] px-4 py-2 text-sm font-semibold text-[#D1D5DB] hover:bg-[#1A1E27]">Skip</button>
              <button onClick={dismissOnboarding} className="rounded-lg bg-[#7C5CFF] px-4 py-2 text-sm font-semibold text-white">Start building</button>
            </div>
          </div>
        </div>
      )}
      {contextMenu && (
        <div style={{ left: contextMenu.x, top: contextMenu.y }} className="fixed z-50 w-44 overflow-hidden rounded-xl border border-[#E5E7EB] bg-white py-1 text-[12px] shadow-2xl dark:border-[#22252D] dark:bg-[#111318]">
          <button onClick={() => { const parent = contextMenu.node.type === "folder" ? contextMenu.node.path : contextMenu.node.path.split("/").slice(0, -1).join("/"); const base = parent ? `${parent}/new-file.txt` : "new-file.txt"; setContextMenu(null); void createWorkspaceFile(base); }} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[#F6F7FB] dark:hover:bg-[#1A1E27]"><Plus className="size-3.5" /> New File</button>
          <button onClick={() => { const base = contextMenu.node.type === "folder" ? contextMenu.node.path : contextMenu.node.path.split("/").slice(0, -1).join("/"); setContextMenu(null); void createWorkspaceFolder(base); }} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[#F6F7FB] dark:hover:bg-[#1A1E27]"><Folder className="size-3.5" /> New Folder</button>
          <button onClick={() => { const node = contextMenu.node; setContextMenu(null); void renameFile(node); }} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[#F6F7FB] dark:hover:bg-[#1A1E27]"><Edit3 className="size-3.5" /> Rename</button>
          <button onClick={() => { const node = contextMenu.node; setContextMenu(null); void duplicateFile(node); }} disabled={contextMenu.node.type !== "file"} title={contextMenu.node.type !== "file" ? "Duplicate is available for files" : "Duplicate file"} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[#F6F7FB] disabled:cursor-not-allowed disabled:opacity-45 dark:hover:bg-[#1A1E27]"><Copy className="size-3.5" /> Duplicate</button>
          <button onClick={() => { const node = contextMenu.node; setContextMenu(null); void downloadFile(node); }} disabled={contextMenu.node.type !== "file"} title={contextMenu.node.type !== "file" ? "Use Download Project ZIP for folders" : "Download file"} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[#F6F7FB] disabled:cursor-not-allowed disabled:opacity-45 dark:hover:bg-[#1A1E27]"><Download className="size-3.5" /> Download</button>
          <button onClick={() => { const node = contextMenu.node; setContextMenu(null); void deleteFile(node); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"><Trash2 className="size-3.5" /> Delete</button>
          <button onClick={() => { void navigator.clipboard?.writeText(contextMenu.node.path); setMessage("Path copied"); setContextMenu(null); }} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[#F6F7FB] dark:hover:bg-[#1A1E27]"><Copy className="size-3.5" /> Copy Path</button>
        </div>
      )}
    </div>
  );

}
