"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  Copy,
  FileJson,
  FileSpreadsheet,
  FileCode2,
  FileText,
  Folder,
  FolderOpen,
  Globe2,
  History,
  Edit3,
  Mic,
  MoreHorizontal,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  Sparkles,
  Square,
  Trash2,
  Upload,
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
  const [queuedPrompt, setQueuedPrompt] = useState("");
  const [previewAction, setPreviewAction] = useState<"idle" | "refreshing" | "stopping">("idle");
  const [previewStopped, setPreviewStopped] = useState(false);
  const [copiedPreview, setCopiedPreview] = useState(false);
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({
  });
  const [leftWidth, setLeftWidth] = useState(320);
  const [rightWidth, setRightWidth] = useState(360);
  const [fileSearch, setFileSearch] = useState("");
  const [activeRightTab, setActiveRightTab] = useState<"CHAT" | "RULES" | "FILES" | "ACTIVITY" | "MEMORY">("CHAT");
  const [previewDevice, setPreviewDevice] = useState<"Desktop" | "Tablet" | "Mobile">("Desktop");
  const [previewMode, setPreviewMode] = useState<"Responsive" | "1440px" | "1920px">("Responsive");
  const [previewZoom, setPreviewZoom] = useState(100);
  const [memorySearch, setMemorySearch] = useState("");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: TreeNode } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const loadingRef = useRef(false);
  const activeTask = state.tasks[0];
  const files = useMemo(() => flatten(state.tree).filter((node) => node.type === "file"), [state.tree]);
  const visibleTree = useMemo(() => {
    const query = fileSearch.trim().toLowerCase();
    const prune = (nodes: TreeNode[]): TreeNode[] => nodes
      .map((node) => {
        if (node.type === "file") {
          if (node.name === ".gitkeep") return null;
          return !query || node.path.toLowerCase().includes(query) || node.name.toLowerCase().includes(query) ? node : null;
        }
        const children = prune(node.children || []);
        const selfMatches = !query || node.path.toLowerCase().includes(query) || node.name.toLowerCase().includes(query);
        if (!children.length && !selfMatches) return null;
        if (!children.length && !query) return null;
        return { ...node, children };
      })
      .filter(Boolean) as TreeNode[];
    return prune(state.tree);
  }, [fileSearch, state.tree]);
  const changed = liveDiffs.length ? liveDiffs : activeTask?.diffs || [];
  const totalAdded = changed.reduce((sum, diff) => sum + diff.added, 0);
  const totalRemoved = changed.reduce((sum, diff) => sum + diff.removed, 0);
  const hasPreviewFile = files.some((file) => file.path === "index.html");
  const previewVersion = [
    state.project?.updatedAt,
    state.preview?.lastCheckedAt,
    state.preview?.httpStatus,
    state.preview?.status,
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
    const response = await fetch(`/api/workspaces/${id}`, { cache: "no-store" });
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
    const folders = flatten(data.tree || []).filter((node) => node.type === "folder");
    setOpenFolders((current) => {
      const next = { ...current };
      for (const folder of folders) if (next[folder.path] === undefined) next[folder.path] = true;
      return next;
    });
  }

  useEffect(() => {
    loadWorkspace().catch((error) => setMessage(error.message));
  }, [status, projectId]);

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
      router.push(`/workspace/${data.project.id}`);
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
    setMessage("Thinking");
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
          }
        }
      }
      await loadWorkspace(state.project.id);
    } catch (error) {
      if (controller.signal.aborted) setMessage("Task cancelled");
      else setMessage(error instanceof Error ? error.message : "Workspace agent failed");
      await loadWorkspace(state.project.id).catch(() => undefined);
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
  }

  async function openFile(filePath: string) {
    if (!state.project) return;
    const response = await fetch(`/api/workspaces/${state.project.id}/files?path=${encodeURIComponent(filePath)}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || "Unable to open file");
      return;
    }
    setSelectedFile(filePath);
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
  }

  async function createWorkspaceFolder(parentPath = "") {
    const folderName = window.prompt("New folder name", "components")?.trim();
    if (!folderName) return;
    const cleanParent = parentPath.replace(/\/$/, "");
    const cleanFolder = folderName.replace(/^\/+|\/+$/g, "");
    await createWorkspaceFile(`${cleanParent ? `${cleanParent}/` : ""}${cleanFolder}/.gitkeep`, "");
  }

  async function renameFile(node: TreeNode) {
    if (!state.project || !node.id || node.type !== "file") return;
    const nextPath = window.prompt("Rename file", node.path)?.trim();
    if (!nextPath || nextPath === node.path) return;
    const readResponse = await fetch(`/api/workspaces/${state.project.id}/files?path=${encodeURIComponent(node.path)}`, { cache: "no-store" });
    const readData = await readResponse.json();
    if (!readResponse.ok) {
      setMessage(readData.error || "Rename failed");
      return;
    }
    await createWorkspaceFile(nextPath, readData.content || "");
    const deleteResponse = await fetch(`/api/workspaces/${state.project.id}/files/${node.id}`, { method: "DELETE" });
    const deleteData = await deleteResponse.json().catch(() => ({}));
    setMessage(deleteResponse.ok ? `Renamed ${node.path}` : deleteData.error || "Rename cleanup failed");
    await loadWorkspace(state.project.id);
  }

  async function deleteFile(node: TreeNode) {
    if (!state.project || !node.id || node.type !== "file") return;
    if (!window.confirm(`Delete ${node.path}?`)) return;
    const response = await fetch(`/api/workspaces/${state.project.id}/files/${node.id}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    setMessage(response.ok ? `Deleted ${node.path}` : data.error || "Delete failed");
    if (selectedFile === node.path) setSelectedFile("");
    await loadWorkspace(state.project.id);
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
    const left = window.localStorage.getItem("meldex.workspace.leftWidth");
    const right = window.localStorage.getItem("meldex.workspace.rightWidth");
    if (left) setLeftWidth(Math.min(420, Math.max(260, Number(left))));
    if (right) setRightWidth(Math.min(460, Math.max(320, Number(right))));
  }, []);

  useEffect(() => {
    window.localStorage.setItem("meldex.workspace.leftWidth", String(leftWidth));
    window.localStorage.setItem("meldex.workspace.rightWidth", String(rightWidth));
  }, [leftWidth, rightWidth]);

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


  const rootFiles = ["package.json", "next.config.ts", "README.md", "tsconfig.json", ".env", ".gitignore"];
  const generatedFiles = files.filter((file) => !rootFiles.includes(file.name));
  const checklist = [
    ["Planning", true],
    ["Analysis", Boolean(activeTask || streamEvents.length)],
    ["Components", changed.length > 0 || files.length > 0],
    ["UI", Boolean(state.preview?.verified)],
    ["Testing", previewStatus === "Verified"],
  ] as const;
  const conversationEvents = [...(activeTask?.events || []), ...streamEvents]
    .sort((a, b) => a.sequence - b.sequence)
    .filter((event, index, list) => list.findIndex((item) => item.type === event.type && item.message === event.message) === index);
  const previewWidth = previewMode === "1440px" ? 1440 : previewMode === "1920px" ? 1920 : previewDevice === "Mobile" ? 390 : previewDevice === "Tablet" ? 820 : 1180;
  const memoryItems = [
    state.memory?.projectSummary ? `Summary: ${state.memory.projectSummary}` : "",
    ...(state.memory?.recentDecisions || []).map((item) => `Decision: ${item}`),
    ...(state.memory?.knownIssues || []).map((item) => `Issue: ${item}`),
    ...(state.memory?.successfulFixes || []).map((item) => `Fix: ${item}`),
    ...(state.memory?.designStyle || []).map((item) => `Style: ${item}`),
  ].filter((item) => item.toLowerCase().includes(memorySearch.toLowerCase()));
  const renderExplorerNode = (node: TreeNode, depth = 0): ReactNode => {
    const badge = statusLabel(node.status);
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
          className={`flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] transition ${
            selectedFile === node.path
              ? "bg-[#6D4AFF]/10 text-[#6D4AFF] dark:bg-[#7C5CFF]/18 dark:text-white"
              : "text-[#374151] hover:bg-[#F6F7FB] dark:text-[#D1D5DB] dark:hover:bg-[#1A1E27]"
          }`}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
        >
          <Icon className={`size-4 shrink-0 ${fileIcon.color}`} />
          <span className="min-w-0 flex-1 truncate">{node.name}</span>
          {badge && <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-600 dark:text-emerald-300">{badge}</span>}
        </button>
      );
    }
    const open = openFolders[node.path] ?? true;
    return (
      <div key={node.path}>
        <button
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setContextMenu({ x: event.clientX, y: event.clientY, node });
          }}
          onClick={() => setOpenFolders((current) => ({ ...current, [node.path]: !open }))}
          className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] text-[#374151] transition duration-200 hover:bg-[#F6F7FB] dark:text-[#D1D5DB] dark:hover:bg-[#1A1E27]"
          style={{ paddingLeft: `${8 + depth * 14}px` }}
        >
          <ChevronRight className={`size-3.5 shrink-0 text-[#6B7280] transition ${open ? "rotate-90" : ""}`} />
          <span className="grid size-5 shrink-0 place-items-center rounded-md bg-amber-100 text-amber-600 dark:bg-amber-400/12 dark:text-amber-300">
            {open ? <FolderOpen className="size-3.5" /> : <Folder className="size-3.5" />}
          </span>
          <span className="min-w-0 flex-1 truncate">{node.name}</span>
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
    <div onClick={() => setContextMenu(null)} className="h-screen overflow-hidden bg-[#f6f7fb] font-sans text-[13px] text-[#111827] antialiased transition-colors dark:bg-[#0B0D12] dark:text-white">
      <main className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[var(--workspace-left)_minmax(620px,1fr)_var(--workspace-right)]" style={{ "--workspace-left": `${leftWidth}px`, "--workspace-right": `${rightWidth}px` } as React.CSSProperties}>
        <aside className="relative hidden min-h-0 border-r border-[#E5E7EB] bg-white/92 shadow-[8px_0_40px_rgba(15,23,42,0.04)] backdrop-blur-xl dark:border-[#22252D] dark:bg-[#111318]/95 lg:flex lg:flex-col">
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
            <button className="grid size-8 place-items-center rounded-lg text-[#6B7280] transition hover:bg-[#F6F7FB] dark:text-[#9CA3AF] dark:hover:bg-[#1A1E27]" title="Explorer actions">
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

            <div className="space-y-0.5">
              {visibleTree.length ? visibleTree.map((node) => renderExplorerNode(node)) : <div className="rounded-lg border border-dashed border-[#E5E7EB] p-3 text-[12px] text-[#6B7280] dark:border-[#22252D] dark:text-[#9CA3AF]">No files yet. Run a prompt to generate the workspace.</div>}
            </div>
          </div>

          <div className="shrink-0 border-t border-[#E5E7EB] dark:border-[#22252D]">
            <button className="flex h-10 w-full items-center gap-2 px-4 text-left text-[12px] font-semibold uppercase tracking-[0.08em] text-[#374151] hover:bg-[#F6F7FB] dark:text-[#D1D5DB] dark:hover:bg-[#1A1E27]"><ChevronRight className="size-3.5" /> Outline</button>
            <button className="flex h-10 w-full items-center gap-2 border-t border-[#E5E7EB] px-4 text-left text-[12px] font-semibold uppercase tracking-[0.08em] text-[#374151] hover:bg-[#F6F7FB] dark:border-[#22252D] dark:text-[#D1D5DB] dark:hover:bg-[#1A1E27]"><ChevronRight className="size-3.5" /> Timeline</button>
          </div>
          <div onMouseDown={(event) => startResize("left", event)} className="absolute right-[-3px] top-0 z-20 hidden h-full w-1 cursor-col-resize bg-transparent transition hover:bg-[#6D4AFF]/70 lg:block" />
        </aside>

        <section className="flex min-h-0 flex-col bg-[#F6F7FB] dark:bg-[#0B0D12]">
          <div className="flex h-12 shrink-0 items-center border-b border-[#E5E7EB] bg-white/74 px-4 backdrop-blur-xl dark:border-[#22252D] dark:bg-[#111318]/70">
            <div className="flex h-9 items-center overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-sm dark:border-[#22252D] dark:bg-[#111318]">
              <button className="flex h-full items-center gap-2 border-r border-[#E5E7EB] px-3 text-sm font-semibold dark:border-[#22252D]"><Globe2 className="size-4 text-[#6D4AFF]" /> Preview</button>
              <button onClick={refreshPreview} disabled={!state.project || previewAction !== "idle"} className="grid h-full w-9 place-items-center text-[#6B7280] hover:bg-[#F6F7FB] disabled:opacity-40 dark:text-[#9CA3AF] dark:hover:bg-[#1A1E27]"><RefreshCw className={`size-4 ${previewAction === "refreshing" ? "animate-spin" : ""}`} /></button>
            </div>
            <button disabled className="ml-2 grid size-9 cursor-not-allowed place-items-center rounded-xl text-[#9CA3AF] opacity-60" title="Multiple preview tabs are not available in this release"><Plus className="size-4" /></button>
          </div>

          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[#E5E7EB] bg-white/88 px-4 dark:border-[#22252D] dark:bg-[#111318]/88">
            <button disabled title="Preview history is not available in this release" className="grid size-8 cursor-not-allowed place-items-center rounded-lg text-[#9CA3AF]"><ChevronRight className="size-4 rotate-180" /></button>
            <button disabled title="Preview history is not available in this release" className="grid size-8 cursor-not-allowed place-items-center rounded-lg text-[#9CA3AF]"><ChevronRight className="size-4" /></button>
            <button onClick={refreshPreview} disabled={!state.project || previewAction !== "idle"} className="grid size-8 place-items-center rounded-lg text-[#6B7280] hover:bg-[#F6F7FB] disabled:opacity-40 dark:text-[#9CA3AF] dark:hover:bg-[#1A1E27]"><RefreshCw className={`size-4 ${previewAction === "refreshing" ? "animate-spin" : ""}`} /></button>
            <div className="mx-2 flex h-8 min-w-0 flex-1 items-center gap-2 rounded-xl border border-[#E5E7EB] bg-[#F6F7FB] px-3 text-[12px] text-[#6B7280] dark:border-[#22252D] dark:bg-[#0B0D12] dark:text-[#9CA3AF]"><Globe2 className="size-3.5" /><span className="truncate">{previewFullUrl || "https://meldex.workspace/preview"}</span></div>
            <select value={previewDevice} onChange={(event) => setPreviewDevice(event.target.value as typeof previewDevice)} className="h-8 rounded-lg border border-[#E5E7EB] bg-white px-2 text-[12px] outline-none dark:border-[#22252D] dark:bg-[#111318]"><option>Desktop</option><option>Tablet</option><option>Mobile</option></select>
            <select value={previewMode} onChange={(event) => setPreviewMode(event.target.value as typeof previewMode)} className="h-8 rounded-lg border border-[#E5E7EB] bg-white px-2 text-[12px] outline-none dark:border-[#22252D] dark:bg-[#111318]"><option>Responsive</option><option>1440px</option><option>1920px</option></select>
            <select value={previewZoom} onChange={(event) => setPreviewZoom(Number(event.target.value))} className="h-8 rounded-lg border border-[#E5E7EB] bg-white px-2 text-[12px] outline-none dark:border-[#22252D] dark:bg-[#111318]"><option value={75}>75%</option><option value={90}>90%</option><option value={100}>100%</option><option value={125}>125%</option></select>
            {previewReady ? <a href={previewDisplayUrl} target="_blank" rel="noopener noreferrer" className="grid size-8 place-items-center rounded-lg border border-[#E5E7EB] bg-white text-[#6B7280] hover:bg-[#F6F7FB] dark:border-[#22252D] dark:bg-[#111318] dark:text-[#9CA3AF]"><ArrowUpRight className="size-4" /></a> : <button disabled className="grid size-8 place-items-center rounded-lg border border-[#E5E7EB] text-[#9CA3AF] dark:border-[#22252D]"><ArrowUpRight className="size-4" /></button>}
            <button onClick={refreshPreview} disabled={!state.project || previewAction !== "idle"} className="grid size-8 place-items-center rounded-lg border border-[#E5E7EB] bg-white text-[#6B7280] hover:bg-[#F6F7FB] disabled:opacity-40 dark:border-[#22252D] dark:bg-[#111318] dark:text-[#9CA3AF]"><RotateCcw className="size-4" /></button>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-5">
            <div className="mx-auto flex h-full min-h-[620px] max-w-[1180px] flex-col rounded-xl border border-[#E5E7EB] bg-white shadow-[0_24px_90px_rgba(15,23,42,0.10)] dark:border-[#22252D] dark:bg-[#111318] dark:shadow-[0_24px_90px_rgba(0,0,0,0.38)]">
              <div className="flex h-10 shrink-0 items-center justify-between border-b border-[#E5E7EB] px-4 dark:border-[#22252D]"><div className="flex items-center gap-2 text-sm font-semibold"><Globe2 className="size-4 text-[#6D4AFF]" /> Live Preview</div><div className="flex items-center gap-2 text-[12px]"><span className={`rounded-full px-2 py-1 ${statusTone}`}>{state.preview?.httpStatus ? `HTTP ${state.preview.httpStatus}` : previewStatus}</span><button onClick={copyPreviewUrl} disabled={!previewReady} className="grid size-7 place-items-center rounded-lg hover:bg-[#F6F7FB] disabled:opacity-40 dark:hover:bg-[#1A1E27]">{copiedPreview ? <CheckCircle2 className="size-4" /> : <Copy className="size-4" />}</button></div></div>
              <div className="min-h-0 flex-1 overflow-auto bg-[#edf0f7] p-4 dark:bg-black">
                <div className="mx-auto h-full origin-top overflow-hidden rounded-b-xl bg-white transition-all duration-200 dark:bg-black" style={{ width: previewMode === "Responsive" ? "100%" : `${previewWidth}px`, maxWidth: "100%", transform: `scale(${previewZoom / 100})`, transformOrigin: "top center" }}>
                  {previewReady ? <iframe key={previewUrl} src={previewUrl} className="h-full w-full rounded-b-xl bg-white" sandbox="allow-scripts allow-forms" /> : <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_50%_0%,rgba(124,92,255,0.18),transparent_36%),linear-gradient(180deg,#0B0D12,#111318)] p-10 text-white"><div className="max-w-2xl text-center"><div className="mx-auto mb-5 grid size-12 place-items-center rounded-2xl bg-[#7C5CFF] shadow-xl shadow-violet-500/25"><Sparkles className="size-6" /></div><p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-violet-200">The Ultimate AI Coding Platform</p><h2 className="text-5xl font-bold tracking-tight">Build Anything<br />with <span className="text-[#7C5CFF]">AI Power</span></h2><p className="mx-auto mt-5 max-w-xl text-base leading-7 text-[#D1D5DB]">Meldex AI combines agents, preview, memory, and code generation into one production workspace.</p><button onClick={() => void runAgent()} className="mt-8 rounded-xl bg-[#7C5CFF] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-500/25"><Play className="mr-2 inline size-4" /> Start Building</button></div></div>}
                </div>
              </div>
            </div>
          </div>
          <div className="flex h-7 shrink-0 items-center justify-between border-t border-[#E5E7EB] bg-white px-4 text-[11px] text-[#6B7280] dark:border-[#22252D] dark:bg-[#111318] dark:text-[#9CA3AF]"><span>{state.project?.name || "MELDEX-WORKSPACE"}</span><span>{message}</span></div>
        </section>

        <aside className="relative flex min-h-0 flex-col border-l border-[#E5E7EB] bg-white/94 shadow-[-8px_0_44px_rgba(15,23,42,0.05)] backdrop-blur-xl dark:border-[#22252D] dark:bg-[#111318]/96">
          <div onMouseDown={(event) => startResize("right", event)} className="absolute left-[-3px] top-0 z-20 hidden h-full w-1 cursor-col-resize bg-transparent transition hover:bg-[#6D4AFF]/70 lg:block" />
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-[#E5E7EB] px-5 dark:border-[#22252D]"><div className="text-sm font-semibold uppercase tracking-[0.08em]">Codex</div><div className="flex items-center gap-1 text-[#6B7280] dark:text-[#9CA3AF]"><button onClick={() => setPrompt("")} className="grid size-8 place-items-center rounded-lg hover:bg-[#F6F7FB] dark:hover:bg-[#1A1E27]" title="New chat"><Plus className="size-4" /></button><button disabled className="grid size-8 cursor-not-allowed place-items-center rounded-lg opacity-45" title="Conversation history is not available in this release"><History className="size-4" /></button><button onClick={() => loadWorkspace().catch((error) => setMessage(error.message))} className="grid size-8 place-items-center rounded-lg hover:bg-[#F6F7FB] dark:hover:bg-[#1A1E27]" title="Refresh"><RefreshCw className="size-4" /></button><button disabled className="grid size-8 cursor-not-allowed place-items-center rounded-lg opacity-45" title="Workspace settings are managed automatically"><Settings className="size-4" /></button><button disabled className="grid size-8 cursor-not-allowed place-items-center rounded-lg opacity-45" title="More actions are not available in this release"><MoreHorizontal className="size-4" /></button></div></div>
          <div className="flex h-11 shrink-0 items-center gap-4 border-b border-[#E5E7EB] px-5 text-[12px] font-semibold uppercase tracking-[0.08em] dark:border-[#22252D]">{(["CHAT","RULES","FILES","ACTIVITY","MEMORY"] as const).map((tab) => <button key={tab} onClick={() => setActiveRightTab(tab)} className={`h-full border-b-2 ${activeRightTab === tab ? "border-[#6D4AFF] text-[#111827] dark:border-[#7C5CFF] dark:text-white" : "border-transparent text-[#6B7280] hover:text-[#111827] dark:text-[#9CA3AF] dark:hover:text-white"}`}>{tab}</button>)}</div>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {activeRightTab === "CHAT" && <>
            <div className="ml-auto max-w-[310px] rounded-xl border border-[#E5E7EB] bg-[#F6F7FB] p-4 text-sm leading-6 shadow-sm dark:border-[#22252D] dark:bg-[#1A1E27]/62">{activeTask?.prompt || prompt || "Create a responsive landing page for Meldex AI with a hero section, features section, and modern dark theme."}</div>
            <div className="mt-7 flex items-center gap-3 text-sm font-semibold"><span className="grid size-7 place-items-center rounded-full bg-[#6D4AFF]/10 text-[#6D4AFF] dark:bg-[#7C5CFF]/15 dark:text-[#A996FF]"><Sparkles className="size-4" /></span>Codex</div>
            <div className="mt-4 space-y-3">{checklist.map(([label, done], index) => (<div key={label} className="flex items-center gap-3 text-sm"><span className={`grid size-5 place-items-center rounded-full ${done ? "text-emerald-500" : index === checklist.findIndex(([, state]) => !state) ? "text-white ring-1 ring-[#6B7280]" : "text-[#6B7280] ring-1 ring-[#374151]"}`}>{done ? <CheckCircle2 className="size-4" /> : <span className="size-2 rounded-full bg-current" />}</span><span className={done ? "text-[#111827] dark:text-white" : "text-[#6B7280] dark:text-[#9CA3AF]"}>{label}</span></div>))}</div>
            <div className="mt-4 grid grid-cols-3 gap-2"><button onClick={stopTask} disabled={!loading} className="rounded-lg border border-[#E5E7EB] py-2 text-xs disabled:opacity-40 dark:border-[#22252D]">Stop</button><button onClick={() => activeTask && void runAgent(activeTask.prompt)} disabled={loading || !activeTask} className="rounded-lg border border-[#E5E7EB] py-2 text-xs disabled:opacity-40 dark:border-[#22252D]">Retry</button><button onClick={() => void runAgent("Continue previous task")} disabled={loading} className="rounded-lg border border-[#E5E7EB] py-2 text-xs disabled:opacity-40 dark:border-[#22252D]">Continue</button></div>
            <div className="mt-4 text-[11px] text-[#6B7280] dark:text-[#9CA3AF]">Model: Qwen3-Coder · Events: {conversationEvents.length} · Status: {loading ? "Streaming" : "Idle"}</div>
            </>}
            {activeRightTab === "RULES" && <div className="space-y-3 text-sm"><div className="rounded-xl border border-[#E5E7EB] p-4 dark:border-[#22252D]"><div className="font-semibold">Workspace Rules</div><p className="mt-2 text-[#6B7280] dark:text-[#9CA3AF]">Rules are loaded from memory and orchestration. Raw secrets are never shown.</p></div>{(state.memory?.codingStyle || []).concat(state.memory?.designStyle || []).slice(0, 8).map((item) => <div key={item} className="rounded-lg bg-[#F6F7FB] p-3 dark:bg-[#1A1E27]">{item}</div>)}</div>}
            {activeRightTab === "FILES" && (
              <div className="space-y-2">
                {files.length ? files.map((file) => (
                  <div key={file.path} className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-[#F6F7FB] dark:hover:bg-[#1A1E27]">
                    <FileText className="size-4 shrink-0 text-[#6B7280]" />
                    <button onClick={() => openFile(file.path)} className="min-w-0 flex-1 truncate text-left text-sm">
                      {file.path}
                    </button>
                    <button
                      onClick={() => {
                        void navigator.clipboard?.writeText(file.path);
                        setMessage("Path copied");
                      }}
                      className="grid size-7 place-items-center rounded-lg text-[#6B7280] hover:bg-white/70 dark:text-[#9CA3AF] dark:hover:bg-white/10"
                      title="Copy file path"
                    >
                      <Copy className="size-3.5" />
                    </button>
                  </div>
                )) : <div className="text-[#6B7280]">No generated files yet.</div>}
              </div>
            )}
            {activeRightTab === "ACTIVITY" && <div className="space-y-2">{conversationEvents.length ? conversationEvents.map((event) => <div key={`${event.sequence}-${event.type}`} className="rounded-lg border border-[#E5E7EB] p-3 text-xs dark:border-[#22252D]"><div className="font-semibold">{event.type.replaceAll("_", " ")}</div><div className="mt-1 text-[#6B7280] dark:text-[#9CA3AF]">{event.message}</div></div>) : <div className="text-[#6B7280]">Activity appears during generation.</div>}</div>}
            {activeRightTab === "MEMORY" && <div className="space-y-3"><div className="flex h-8 items-center gap-2 rounded-lg border border-[#E5E7EB] px-2 dark:border-[#22252D]"><Search className="size-3.5" /><input value={memorySearch} onChange={(event) => setMemorySearch(event.target.value)} className="min-w-0 flex-1 bg-transparent text-xs outline-none" placeholder="Search memory" /></div><button onClick={async () => { if (!state.project || !window.confirm("Clear workspace memory?")) return; const response = await fetch(`/api/workspaces/${state.project.id}/memory`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clear: true }) }); setMessage(response.ok ? "Memory cleared" : "Memory clear failed"); await loadWorkspace(state.project.id); }} className="rounded-lg border border-red-200 px-3 py-2 text-xs text-red-600 dark:border-red-500/30">Clear memory</button>{memoryItems.length ? memoryItems.map((item) => <div key={item} className="rounded-lg bg-[#F6F7FB] p-3 text-xs dark:bg-[#1A1E27]">{item}</div>) : <div className="text-[#6B7280]">No matching memory.</div>}</div>}
            {activeRightTab === "CHAT" && <>
            <div className="mt-7 rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm dark:border-[#22252D] dark:bg-[#0B0D12]/40"><div className="mb-3 flex items-center justify-between text-sm font-semibold"><span>{generatedFiles.length || changed.length || files.length} files</span><span className="text-[11px] font-medium text-[#6B7280] dark:text-[#9CA3AF]">+{totalAdded} -{totalRemoved}</span></div><div className="max-h-52 space-y-2 overflow-y-auto pr-1">{(changed.length ? changed.map((diff) => ({ path: diff.path, name: diff.path.split("/").pop() || diff.path, added: diff.added })) : files.slice(0, 10).map((file) => ({ path: file.path, name: file.name, added: 0 }))).map((file) => (<button key={file.path} onClick={() => openFile(file.path)} className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] hover:bg-[#F6F7FB] dark:hover:bg-[#1A1E27]"><span className="text-emerald-500">+</span><span className="min-w-0 flex-1 truncate">{file.path}</span>{file.added ? <span className="text-[11px] text-emerald-500">+{file.added}</span> : null}</button>))}</div></div>
            <div className="mt-5 rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm dark:border-[#22252D] dark:bg-[#0B0D12]/40"><div className="mb-3 text-sm font-semibold">Activity</div><div className="max-h-44 space-y-2 overflow-y-auto text-[12px] text-[#6B7280] dark:text-[#9CA3AF]">{conversationEvents.length ? conversationEvents.slice(-9).map((event) => <div key={`${event.sequence}-${event.type}`} className="truncate">{event.message}</div>) : <div>Ready to build.</div>}</div></div>
            </>}
          </div>
          <div className="shrink-0 border-t border-[#E5E7EB] p-4 dark:border-[#22252D]"><div className="rounded-xl border border-[#E5E7EB] bg-[#F6F7FB] p-3 shadow-sm transition focus-within:border-[#6D4AFF] dark:border-[#22252D] dark:bg-[#0B0D12] dark:focus-within:border-[#7C5CFF]"><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if ((event.key === "Enter" && !event.shiftKey) || ((event.metaKey || event.ctrlKey) && event.key === "Enter")) { event.preventDefault(); if (!loading && prompt.trim()) void runAgent(); } }} rows={3} className="w-full resize-none bg-transparent text-sm leading-6 outline-none placeholder:text-[#9CA3AF]" placeholder="Ask Codex anything..." /><div className="mt-3 flex items-center justify-between text-[12px] text-[#6B7280] dark:text-[#9CA3AF]"><div className="flex items-center gap-3"><button disabled title="Attach context is not available in this release" className="flex cursor-not-allowed items-center gap-1 opacity-45"><Upload className="size-3.5" /> Add context</button><button disabled title="Voice input is not available in this release" className="cursor-not-allowed opacity-45"><Mic className="size-3.5" /></button></div><button onClick={() => loading ? stopTask() : void runAgent()} disabled={!loading && !prompt.trim()} className="grid size-9 place-items-center rounded-lg bg-[#6D4AFF] text-white shadow-lg shadow-violet-500/20 transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-45">{loading ? <Square className="size-4" /> : <Play className="size-4" />}</button></div></div></div>
        </aside>
      </main>
      {contextMenu && (
        <div style={{ left: contextMenu.x, top: contextMenu.y }} className="fixed z-50 w-44 overflow-hidden rounded-xl border border-[#E5E7EB] bg-white py-1 text-[12px] shadow-2xl dark:border-[#22252D] dark:bg-[#111318]">
          <button onClick={() => { const parent = contextMenu.node.type === "folder" ? contextMenu.node.path : contextMenu.node.path.split("/").slice(0, -1).join("/"); const base = parent ? `${parent}/new-file.txt` : "new-file.txt"; setContextMenu(null); void createWorkspaceFile(base); }} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[#F6F7FB] dark:hover:bg-[#1A1E27]"><Plus className="size-3.5" /> New File</button>
          <button onClick={() => { const base = contextMenu.node.type === "folder" ? contextMenu.node.path : contextMenu.node.path.split("/").slice(0, -1).join("/"); setContextMenu(null); void createWorkspaceFolder(base); }} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[#F6F7FB] dark:hover:bg-[#1A1E27]"><Folder className="size-3.5" /> New Folder</button>
          <button onClick={() => { const node = contextMenu.node; setContextMenu(null); void renameFile(node); }} disabled={contextMenu.node.type !== "file" || !contextMenu.node.id} title={contextMenu.node.type !== "file" ? "Folder rename is not available in this release" : "Rename file"} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[#F6F7FB] disabled:cursor-not-allowed disabled:opacity-45 dark:hover:bg-[#1A1E27]"><Edit3 className="size-3.5" /> Rename</button>
          <button onClick={() => { const node = contextMenu.node; setContextMenu(null); void deleteFile(node); }} disabled={contextMenu.node.type !== "file" || !contextMenu.node.id} title={contextMenu.node.type !== "file" ? "Folder delete is not available in this release" : "Delete file"} className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-45 dark:hover:bg-red-500/10"><Trash2 className="size-3.5" /> Delete</button>
          <button onClick={() => { void navigator.clipboard?.writeText(contextMenu.node.path); setMessage("Path copied"); setContextMenu(null); }} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[#F6F7FB] dark:hover:bg-[#1A1E27]"><Copy className="size-3.5" /> Copy Path</button>
        </div>
      )}
    </div>
  );

}
