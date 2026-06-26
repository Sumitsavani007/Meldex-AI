"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  ArrowUpRight,
  Bot,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Code2,
  Copy,
  FileCode2,
  FileText,
  Folder,
  History,
  LayoutDashboard,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  Settings,
  Sparkles,
  Square,
  TerminalSquare,
  WalletCards,
} from "lucide-react";

type TreeNode = {
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
  preview: { url: string; verified: boolean; httpStatus?: number; message?: string } | null;
};

const navItems = [
  ["Chat", "/chat", Bot],
  ["Workspace", "/workspace", LayoutDashboard],
  ["Projects", "/dashboard", Folder],
  ["History", "/workspace", History],
  ["Tokens", "/settings/tokens", Code2],
  ["Billing", "/settings/billing", WalletCards],
  ["Settings", "/settings", Settings],
] as const;

const examples = [
  "Create a landing page",
  "Build a SaaS dashboard",
  "Make a portfolio site",
  "Add pricing page",
  "Create contact form",
];

function flatten(nodes: TreeNode[]): TreeNode[] {
  return nodes.flatMap((node) => [node, ...(node.children ? flatten(node.children) : [])]);
}

function statusLabel(status?: string) {
  if (!status || status === "UNCHANGED") return "";
  return status === "CREATED" ? "Created" : status === "EDITED" ? "Edited" : status === "ROLLED_BACK" ? "Restored" : status;
}

function FileNode({ node, active, onOpen }: { node: TreeNode; active: string; onOpen: (file: string) => void }) {
  const [open, setOpen] = useState(true);
  const isFolder = node.type === "folder";
  const badge = statusLabel(node.status);
  return (
    <div>
      <button
        onClick={() => isFolder ? setOpen(!open) : onOpen(node.path)}
        className={`flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs transition ${
          active === node.path
            ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-950"
            : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-white/8 dark:hover:text-white"
        }`}
      >
        {isFolder ? <Folder className="size-3.5 shrink-0" /> : <FileText className="size-3.5 shrink-0" />}
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
        {badge && <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-600 dark:text-emerald-300">{badge}</span>}
        {isFolder && <ChevronRight className={`size-3 shrink-0 transition ${open ? "rotate-90" : ""}`} />}
      </button>
      {isFolder && open && node.children?.length ? (
        <div className="ml-3 border-l border-zinc-200 pl-2 dark:border-white/10">
          {node.children.map((child) => <FileNode key={child.path} node={child} active={active} onOpen={onOpen} />)}
        </div>
      ) : null}
    </div>
  );
}

function Timeline({ task, loading, events = [] }: { task?: Task; loading: boolean; events?: StreamEvent[] }) {
  const plan = Array.isArray(task?.planJson) ? task?.planJson || [] : [];
  const persisted = task?.events || [];
  const visibleEvents = [...persisted, ...events]
    .sort((a, b) => a.sequence - b.sequence)
    .filter((event, index, list) => list.findIndex((item) => item.type === event.type && item.message === event.message) === index)
    .map((event) => event.message);
  const fallbackEvents = [
    loading ? "Thinking" : "Understood request",
    ...plan,
    ...(task?.diffs?.map((diff) => `${diff.operation === "create" ? "Created" : diff.operation === "delete" ? "Deleted" : "Edited"} ${diff.path}`) || []),
    task?.previewUrl ? "Started preview" : "",
    task?.status === "SUCCEEDED" ? "Verified website" : task?.status === "FAILED" ? "Task failed" : "",
  ].filter(Boolean);
  const timelineEvents = visibleEvents.length ? visibleEvents : fallbackEvents;
  return (
    <div className="space-y-2">
      {timelineEvents.length ? timelineEvents.map((event, index) => (
        <div key={`${event}-${index}`} className="flex items-start gap-2 text-sm">
          <span className={`mt-0.5 flex size-5 items-center justify-center rounded-full ${loading && index === 0 ? "bg-blue-500/10 text-blue-600" : "bg-emerald-500/10 text-emerald-600"}`}>
            {loading && index === 0 ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle2 className="size-3" />}
          </span>
          <span className="text-zinc-700 dark:text-zinc-300">{event}</span>
        </div>
      )) : (
        <div className="flex items-center gap-2 text-sm text-zinc-500"><Sparkles className="size-4" /> Ready for a build command.</div>
      )}
    </div>
  );
}

export function WorkspaceClient({ projectId }: { projectId?: string }) {
  const { status } = useSession({ required: true });
  const router = useRouter();
  const [state, setState] = useState<WorkspaceState>({ project: null, projects: [], tree: [], tasks: [], preview: null });
  const [prompt, setPrompt] = useState("Create a simple landing page");
  const [selectedFile, setSelectedFile] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("Ready");
  const [mobileTab, setMobileTab] = useState<"chat" | "files" | "preview" | "logs">("chat");
  const [logsOpen, setLogsOpen] = useState(false);
  const [streamEvents, setStreamEvents] = useState<StreamEvent[]>([]);
  const [liveDiffs, setLiveDiffs] = useState<Diff[]>([]);
  const [queuedPrompt, setQueuedPrompt] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const loadingRef = useRef(false);
  const activeTask = state.tasks[0];
  const files = useMemo(() => flatten(state.tree).filter((node) => node.type === "file"), [state.tree]);
  const changed = liveDiffs.length ? liveDiffs : activeTask?.diffs || [];
  const totalAdded = changed.reduce((sum, diff) => sum + diff.added, 0);
  const totalRemoved = changed.reduce((sum, diff) => sum + diff.removed, 0);

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
    setFileContent(data.content || "");
  }

  async function refreshPreview() {
    if (!state.project) return;
    const response = await fetch(`/api/workspaces/${state.project.id}/run`, { method: "POST" });
    const data = await response.json();
    if (!response.ok) setMessage(data.error || "Preview failed");
    else setMessage(data.verification?.message || "Preview refreshed");
    await loadWorkspace(state.project.id);
  }

  async function stopPreview() {
    if (!state.project) return;
    const response = await fetch(`/api/workspaces/${state.project.id}/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "stop" }),
    });
    const data = await response.json();
    setMessage(response.ok ? "Preview stopped" : data.error || "Unable to stop preview");
    await loadWorkspace(state.project.id);
  }

  async function rollback() {
    if (!state.project || !activeTask) return;
    const response = await fetch(`/api/workspaces/${state.project.id}/rollback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: activeTask.id }),
    });
    const data = await response.json();
    setMessage(response.ok ? "Rollback complete" : data.error || "Rollback failed");
    await loadWorkspace(state.project.id);
  }

  const previewUrl = state.project ? `/api/workspaces/${state.project.id}/preview?v=${encodeURIComponent(String(state.project.updatedAt || ""))}` : "";

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950 dark:bg-black dark:text-white">
      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/85 backdrop-blur dark:border-white/10 dark:bg-black/80">
        <div className="flex h-14 items-center gap-3 px-4">
          <Link href="/" className="font-semibold">Meldex AI</Link>
          <nav className="hidden items-center gap-1 md:flex">
            {navItems.map(([label, href, Icon]) => (
              <Link key={label} href={href} className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs ${label === "Workspace" ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-950" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950 dark:hover:bg-white/8 dark:hover:text-white"}`}>
                <Icon className="size-3.5" /> {label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 text-xs text-zinc-500">
            <span>{message}</span>
            <button onClick={() => loadWorkspace().catch((error) => setMessage(error.message))} className="rounded-md border border-zinc-200 p-1.5 hover:bg-zinc-100 dark:border-white/10 dark:hover:bg-white/8" title="Refresh">
              <RefreshCw className="size-3.5" />
            </button>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-4 border-b border-zinc-200 bg-white text-xs dark:border-white/10 dark:bg-black lg:hidden">
        {(["chat", "files", "preview", "logs"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setMobileTab(tab)}
            className={`py-3 capitalize ${mobileTab === tab ? "text-zinc-950 dark:text-white" : "text-zinc-500"}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {mobileTab === "files" && (
        <section className="h-[calc(100vh-104px)] overflow-y-auto bg-white p-3 dark:bg-black lg:hidden">
          {files.length ? state.tree.map((node) => <FileNode key={node.path} node={node} active={selectedFile} onOpen={openFile} />) : (
            <div className="rounded-lg border border-dashed border-zinc-200 p-4 text-xs text-zinc-500 dark:border-white/10">Files will appear live as Meldex creates them.</div>
          )}
          {selectedFile && <pre className="mt-3 max-h-[360px] overflow-auto rounded-lg border border-zinc-200 p-3 text-xs dark:border-white/10">{fileContent}</pre>}
        </section>
      )}

      {mobileTab === "preview" && (
        <section className="h-[calc(100vh-104px)] overflow-y-auto bg-zinc-50 p-3 dark:bg-black lg:hidden">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold">Live preview</span>
            <button onClick={refreshPreview} className="rounded-md border border-zinc-200 p-1.5 dark:border-white/10" aria-label="Refresh preview"><RefreshCw className="size-3.5" /></button>
          </div>
          <div className="aspect-[4/3] rounded-lg border border-zinc-200 bg-white dark:border-white/10">
            {state.project && files.some((file) => file.path === "index.html") ? <iframe key={previewUrl} src={previewUrl} className="h-full w-full rounded-lg bg-white" sandbox="allow-scripts" /> : <div className="flex h-full items-center justify-center text-sm text-zinc-500">Preview appears after files are created.</div>}
          </div>
          <div className="mt-3 rounded-lg border border-zinc-200 bg-white p-3 text-xs dark:border-white/10 dark:bg-zinc-950">{state.preview?.message || "No preview verification yet."}</div>
        </section>
      )}

      {mobileTab === "logs" && (
        <section className="h-[calc(100vh-104px)] overflow-y-auto bg-zinc-950 p-3 font-mono text-xs text-zinc-300 lg:hidden">
          {[...(activeTask?.events || []), ...streamEvents].length
            ? [...(activeTask?.events || []), ...streamEvents].sort((a, b) => a.sequence - b.sequence).map((event) => <div key={`${event.sequence}-${event.type}`}>[{event.type}] {event.message}</div>)
            : <div>[idle] Workspace ready</div>}
          {activeTask?.logs?.map((log) => <div key={log.id}>[{log.event}] {log.message}</div>)}
          {activeTask?.runs?.map((run) => <div key={run.id}>[{run.status}] {run.command} {run.stdout || run.stderr || ""}</div>)}
        </section>
      )}

      <main className={`${mobileTab === "chat" ? "grid" : "hidden"} h-[calc(100vh-104px)] grid-cols-1 overflow-hidden lg:grid lg:h-[calc(100vh-56px)] lg:grid-cols-[260px_minmax(420px,1fr)_420px]`}>
        <aside className="hidden min-h-0 border-r border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-950 lg:flex lg:flex-col">
          <div className="border-b border-zinc-200 p-3 dark:border-white/10">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Project files</div>
            <div className="mt-1 text-sm font-medium">{state.project?.name || "No workspace yet"}</div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {files.length ? state.tree.map((node) => <FileNode key={node.path} node={node} active={selectedFile} onOpen={openFile} />) : (
              <div className="rounded-lg border border-dashed border-zinc-200 p-4 text-xs text-zinc-500 dark:border-white/10">Files will appear live as Meldex creates them.</div>
            )}
          </div>
          <div className="border-t border-zinc-200 p-3 text-xs text-zinc-500 dark:border-white/10">{files.length} file(s)</div>
        </aside>

        <section className="flex min-h-0 flex-col border-r border-zinc-200 bg-white dark:border-white/10 dark:bg-black">
          <div className="border-b border-zinc-200 p-4 dark:border-white/10">
            <div className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="size-4 text-blue-600" /> What do you want to build?</div>
            <div className="mt-3 flex gap-2">
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.key === "Enter" && !event.shiftKey) || ((event.metaKey || event.ctrlKey) && event.key === "Enter")) {
                    event.preventDefault();
                    if (!loading && prompt.trim()) void runAgent();
                  }
                }}
                rows={3}
                className="min-h-20 flex-1 resize-none rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm outline-none transition focus:border-zinc-400 dark:border-white/10 dark:bg-white/5"
                placeholder="Create a website"
                aria-label="Workspace prompt"
              />
              <button onClick={() => loading ? stopTask() : void runAgent()} disabled={!loading && !prompt.trim()} className="flex w-24 items-center justify-center rounded-lg bg-zinc-950 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-zinc-950" aria-label={loading ? "Stop task" : "Send prompt"}>
                {loading ? <Square className="size-4" /> : <Play className="size-4" />}
              </button>
            </div>
            {queuedPrompt && <div className="mt-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">Queued · will run next: {queuedPrompt}</div>}
            <div className="mt-3 flex flex-wrap gap-2">
              {examples.map((example) => (
                <button key={example} onClick={() => setPrompt(example)} className="rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-400 dark:hover:bg-white/8">{example}</button>
              ))}
            </div>
          </div>

          <div className={`grid min-h-0 flex-1 ${logsOpen ? "grid-rows-[minmax(240px,1fr)_190px]" : "grid-rows-[minmax(240px,1fr)_44px]"}`}>
            <div className="min-h-0 overflow-y-auto p-4">
              <div className="mb-4 rounded-lg border border-zinc-200 p-4 dark:border-white/10">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold">Agent timeline</h2>
                  <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-500 dark:bg-white/8">{activeTask?.status || "Idle"}</span>
                </div>
                <Timeline task={activeTask} loading={loading} events={streamEvents} />
              </div>

              <div className="rounded-lg border border-zinc-200 dark:border-white/10">
                <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2 dark:border-white/10">
                  <span className="text-sm font-semibold">{selectedFile || "File preview"}</span>
                  {selectedFile && <span className="text-xs text-zinc-500">Read-only</span>}
                </div>
                <pre className="max-h-[360px] overflow-auto p-3 text-xs leading-5 text-zinc-700 dark:text-zinc-300">{selectedFile ? fileContent : "Select a file to preview content and diff."}</pre>
              </div>
            </div>

            <div className="border-t border-zinc-200 bg-zinc-950 p-3 text-zinc-100 dark:border-white/10">
              <button onClick={() => setLogsOpen((value) => !value)} className="flex w-full items-center gap-2 text-left text-xs font-semibold" aria-expanded={logsOpen}>
                <TerminalSquare className="size-3.5" /> Logs / terminal / build output
              </button>
              {logsOpen && (
                <div className="mt-2 h-32 overflow-y-auto rounded-md bg-black/40 p-2 font-mono text-[11px] leading-5 text-zinc-300">
                  {[...(activeTask?.events || []), ...streamEvents].length
                    ? [...(activeTask?.events || []), ...streamEvents].sort((a, b) => a.sequence - b.sequence).map((event) => <div key={`${event.sequence}-${event.type}`}>[{event.type}] {event.message}</div>)
                    : <div>[idle] Workspace ready</div>}
                  {activeTask?.logs?.map((log) => <div key={log.id}>[{log.event}] {log.message}</div>)}
                  {activeTask?.runs?.map((run) => <div key={run.id}>[{run.status}] {run.command} {run.stdout || run.stderr || ""}</div>)}
                </div>
              )}
            </div>
          </div>
        </section>

        <aside className="hidden min-h-0 flex-col bg-zinc-50 dark:bg-zinc-950 lg:flex">
          <div className="flex items-center justify-between border-b border-zinc-200 p-3 dark:border-white/10">
            <h2 className="text-sm font-semibold">Live preview</h2>
            <div className="flex items-center gap-1">
              <button onClick={refreshPreview} className="rounded-md border border-zinc-200 p-1.5 hover:bg-zinc-100 dark:border-white/10 dark:hover:bg-white/8" title="Refresh preview"><RefreshCw className="size-3.5" /></button>
              <a href={previewUrl || "#"} target="_blank" rel="noopener noreferrer" className="rounded-md border border-zinc-200 p-1.5 hover:bg-zinc-100 dark:border-white/10 dark:hover:bg-white/8" title="Open preview"><ArrowUpRight className="size-3.5" /></a>
              <button onClick={() => navigator.clipboard?.writeText(window.location.origin + previewUrl)} className="rounded-md border border-zinc-200 p-1.5 hover:bg-zinc-100 dark:border-white/10 dark:hover:bg-white/8" title="Copy URL"><Copy className="size-3.5" /></button>
              <button onClick={stopPreview} className="rounded-md border border-zinc-200 p-1.5 text-zinc-500 hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-400 dark:hover:bg-white/8" title="Stop preview"><Square className="size-3.5" /></button>
            </div>
          </div>
          <div className="border-b border-zinc-200 p-3 dark:border-white/10">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-500">Preview URL</span>
              <span className={state.preview?.verified ? "text-emerald-600" : "text-zinc-500"}>{state.preview?.verified ? "HTTP 200 verified" : "Not verified"}</span>
            </div>
            <div className="mt-1 truncate rounded-md bg-white px-2 py-1 text-xs text-zinc-500 dark:bg-white/5">{previewUrl || "No preview yet"}</div>
          </div>
          <div className="aspect-[4/3] border-b border-zinc-200 bg-white dark:border-white/10">
            {state.project && files.some((file) => file.path === "index.html") ? (
              <iframe key={previewUrl} src={previewUrl} className="h-full w-full bg-white" sandbox="allow-scripts" />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-zinc-500">Preview appears after files are created.</div>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <div className="mb-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-white/10 dark:bg-black">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Quality score</span>
                <span className="text-lg font-semibold">{activeTask?.qualityScore || state.project?.qualityScore || 0}</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-zinc-100 dark:bg-white/10"><div className="h-2 rounded-full bg-emerald-500" style={{ width: `${activeTask?.qualityScore || state.project?.qualityScore || 0}%` }} /></div>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-white/10 dark:bg-black">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold">Changed files</span>
                <span className="text-xs text-zinc-500">+{totalAdded} -{totalRemoved}</span>
              </div>
              {changed.length ? changed.map((diff) => (
                <button key={`${diff.path}-${diff.operation}`} onClick={() => openFile(diff.path)} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs hover:bg-zinc-100 dark:hover:bg-white/8">
                  <FileCode2 className="size-3.5 text-zinc-500" />
                  <span className="min-w-0 flex-1 truncate">{diff.path}</span>
                  <span className="text-emerald-600">+{diff.added}</span>
                  <span className="text-red-500">-{diff.removed}</span>
                </button>
              )) : <p className="text-xs text-zinc-500">No changes yet.</p>}
              <div className="mt-3 grid grid-cols-4 gap-1">
                {["Review", "Apply", "Reject"].map((action) => <button key={action} className="rounded-md border border-zinc-200 px-2 py-1.5 text-xs text-zinc-600 dark:border-white/10 dark:text-zinc-400">{action}</button>)}
                <button onClick={rollback} className="rounded-md border border-zinc-200 px-2 py-1.5 text-xs text-zinc-600 dark:border-white/10 dark:text-zinc-400"><RotateCcw className="mx-auto size-3.5" /></button>
              </div>
            </div>

            <div className="mt-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-white/10 dark:bg-black">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><Clock3 className="size-4" /> Task history</div>
              {state.tasks.slice(0, 8).map((task) => (
                <div key={task.id} className="border-t border-zinc-100 py-2 text-xs first:border-t-0 dark:border-white/10">
                  <div className="truncate font-medium">{task.prompt}</div>
                  <div className="mt-1 text-zinc-500">{task.status} · {new Date(task.createdAt).toLocaleString()}</div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
