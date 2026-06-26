"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import Editor from "@monaco-editor/react";
import {
  Bot, FileText, Folder, FolderPlus, Play, Save,
  TerminalSquare, Trash2, Zap, CheckCircle2, RefreshCw,
  ChevronRight, FilePlus
} from "lucide-react";
import { StatusPill } from "@/components/ui";
import { allowedCommands } from "@/lib/security";

type WorkspaceNode = {
  name: string;
  path: string;
  type: "file" | "folder";
  children?: WorkspaceNode[];
};

type TerminalRun = {
  command: string;
  code: number;
  stdout: string;
  stderr: string;
};

function flatten(nodes: WorkspaceNode[]): WorkspaceNode[] {
  return nodes.flatMap((node) => [node, ...(node.children ? flatten(node.children) : [])]);
}

function TreeNode({ node, onSelect, activeFile }: { node: WorkspaceNode; onSelect: (node: WorkspaceNode) => void; activeFile: string }) {
  const [open, setOpen] = useState(true);
  const isFolder = node.type === "folder";
  const isActive = !isFolder && node.path === activeFile;

  return (
    <div>
      <button
        onClick={() => {
          if (isFolder) {
            setOpen(!open);
          } else {
            onSelect(node);
          }
        }}
        className={[
          "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition",
          isActive
            ? "bg-slate-100 text-slate-950 dark:bg-white/10 dark:text-white"
            : "text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-white/6 dark:hover:text-white"
        ].join(" ")}
      >
        {isFolder
          ? <Folder className="size-3.5 shrink-0 text-slate-500" />
          : <FileText className="size-3.5 shrink-0 text-slate-500" />
        }
        <span className="truncate">{node.name}</span>
        {isFolder && (
          <ChevronRight className={`ml-auto size-3 shrink-0 transition ${open ? "rotate-90" : ""}`} />
        )}
      </button>
      {isFolder && open && node.children && (
        <div className="ml-3 border-l border-slate-200 pl-2 dark:border-white/8">
          {node.children.map(child => <TreeNode key={child.path} node={child} onSelect={onSelect} activeFile={activeFile} />)}
        </div>
      )}
    </div>
  );
}

export default function WorkspacePage() {
  const { data: session, status: sessionStatus } = useSession();
  const [tree, setTree] = useState<WorkspaceNode[]>([]);
  const [selectedPath, setSelectedPath] = useState("");
  const [content, setContent] = useState("");
  const [newPath, setNewPath] = useState("src/app.tsx");
  const [task, setTask] = useState("Create a landing page");
  const [agentLogs, setAgentLogs] = useState<string[]>(["[idle] Workspace ready"]);
  const [changedFiles, setChangedFiles] = useState<string[]>([]);
  const [terminalCommand, setTerminalCommand] = useState("npm run build");
  const [terminalOutput, setTerminalOutput] = useState<TerminalRun | null>(null);
  const [status, setStatus] = useState<{ tone: "success" | "error" | "idle"; text: string }>({ tone: "idle", text: "Ready" });
  const files = useMemo(() => flatten(tree).filter((node) => node.type === "file"), [tree]);
  const safeCommands = allowedCommands;
  const isAdmin = session?.user?.role === "ADMIN" || session?.user?.role === "OWNER";

  async function refreshTree() {
    const response = await fetch("/api/workspace");
    const data = await response.json().catch(() => ({ error: "Workspace is unavailable." }));
    if (!response.ok) {
      throw new Error(data.error);
    }
    setTree(data.tree);
  }

  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    refreshTree().catch((error) => setStatus({ tone: "error", text: error.message }));
  }, [sessionStatus]);

  if (sessionStatus === "loading") {
    return <div className="min-h-screen bg-white p-8 text-sm text-slate-500 dark:bg-black dark:text-slate-400">Loading workspace...</div>;
  }

  if (!session?.user?.id) {
    redirect("/login");
  }

  async function openNode(node: WorkspaceNode) {
    if (node.type === "folder") {
      setNewPath(`${node.path}/new-file.ts`);
      return;
    }
    const response = await fetch(`/api/workspace?path=${encodeURIComponent(node.path)}`);
    const data = await response.json();
    if (!response.ok) {
      setStatus({ tone: "error", text: data.error });
      return;
    }
    setSelectedPath(node.path);
    setContent(data.content);
    setStatus({ tone: "idle", text: `Opened ${node.path}` });
  }

  async function saveFile(path = selectedPath, nextContent = content) {
    if (!path.trim()) {
      setStatus({ tone: "error", text: "Select or enter a file path first." });
      return;
    }
    const response = await fetch("/api/workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "file", path, content: nextContent })
    });
    const data = await response.json();
    if (!response.ok) {
      setStatus({ tone: "error", text: data.error });
      return;
    }
    setTree(data.tree);
    setSelectedPath(path);
    setContent(nextContent);
    setAgentLogs((current) => [`[success] Saved ${path}`, ...current]);
    setStatus({ tone: "success", text: `Saved ${path}` });
  }

  async function createFolder() {
    const folderPath = newPath.replace(/\/?[^/]*\.[^/.]+$/, "") || "src";
    const response = await fetch("/api/workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "folder", path: folderPath })
    });
    const data = await response.json();
    if (!response.ok) {
      setStatus({ tone: "error", text: data.error });
      return;
    }
    setTree(data.tree);
    setAgentLogs((current) => [`[success] Created folder ${folderPath}`, ...current]);
  }

  async function deleteSelected() {
    if (!selectedPath || !confirm(`Delete ${selectedPath}? This cannot be undone.`)) {
      return;
    }
    const response = await fetch(`/api/workspace?path=${encodeURIComponent(selectedPath)}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) {
      setStatus({ tone: "error", text: data.error });
      return;
    }
    setTree(data.tree);
    setSelectedPath("");
    setContent("");
    setAgentLogs((current) => [`[success] Deleted ${selectedPath}`, ...current]);
    setStatus({ tone: "success", text: "File deleted" });
  }

  async function runAgent() {
    setStatus({ tone: "idle", text: "Agent planning..." });
    setAgentLogs((current) => [`[agent] ${task}`, ...current]);
    const response = await fetch("/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task })
    });
    const data = await response.json();
    if (!response.ok) {
      setStatus({ tone: "error", text: data.error });
      return;
    }
    setTree(data.tree);
    setChangedFiles(data.changedFiles ?? []);
    if (data.terminalRuns?.length) {
      setTerminalOutput(data.terminalRuns[0]);
    }
    setAgentLogs((current) => {
      const next = [`[success] ${data.summary}`];
      if (data.changedFiles?.length) {
        next.push(`[changed] ${data.changedFiles.join(", ")}`);
      }
      if (data.terminalRuns?.length) {
        for (const run of data.terminalRuns) {
          next.push(`[terminal] ${run.command} -> exit ${run.code}`);
        }
      }
      return [...next, ...current];
    });
    setStatus({ tone: "success", text: "Agent task complete" });
  }

  async function runTerminalCommand(command = terminalCommand) {
    const normalized = command.trim();
    if (!safeCommands.includes(normalized)) {
      setStatus({ tone: "error", text: "Command is not allowlisted." });
      return;
    }

    setStatus({ tone: "idle", text: `Running ${normalized}...` });
    const response = await fetch("/api/terminal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: normalized, autoFix: true })
    });
    const data = await response.json();
    if (!response.ok) {
      setStatus({ tone: "error", text: data.error });
      return;
    }

    setTerminalOutput(data);
    setAgentLogs((current) => [`[terminal] ${data.command} -> exit ${data.code}`, ...current]);
    setStatus({ tone: data.code === 0 ? "success" : "error", text: data.code === 0 ? `${data.command} complete` : `${data.command} failed` });
  }

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col overflow-hidden bg-white text-slate-950 dark:bg-black dark:text-white">
      {/* Top bar */}
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-2.5 backdrop-blur dark:border-white/10 dark:bg-black/90">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-slate-950 dark:text-white">Project Workspace</h1>
          <StatusPill tone={status.tone}>{status.text}</StatusPill>
        </div>
        <button
          onClick={() => refreshTree().catch(e => setStatus({ tone: "error", text: e.message }))}
          className="mx-focus flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 transition hover:bg-slate-50 hover:text-slate-950 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/6 dark:hover:text-white"
        >
          <RefreshCw className="size-3.5" />
          Refresh
        </button>
      </div>

      {/* Main 3-column split */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* ── Column 1: File Tree ── */}
        <aside className="flex w-52 shrink-0 flex-col border-r border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-[#050507]">
          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 dark:border-white/10">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Files</span>
            <span className="text-xs text-slate-500">{files.length} files</span>
          </div>
          <div className="thin-scrollbar flex-1 overflow-y-auto p-2">
            {tree.length
              ? tree.map(node => <TreeNode key={node.path} node={node} onSelect={openNode} activeFile={selectedPath} />)
              : <p className="px-2 py-4 text-xs text-slate-600">No files yet.</p>
            }
          </div>
          {/* Quick create */}
          <div className="space-y-1.5 border-t border-slate-200 p-2 dark:border-white/10">
            <input
              value={newPath}
              onChange={e => setNewPath(e.target.value)}
              placeholder="path/to/file.tsx"
              className="mx-focus w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:placeholder:text-slate-600"
            />
            <div className="grid grid-cols-2 gap-1">
              <button onClick={() => saveFile(newPath, "")}
                className="mx-focus flex items-center justify-center gap-1 rounded-lg bg-slate-950 px-2 py-1.5 text-xs font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200">
                <FilePlus className="size-3" /> File
              </button>
              <button onClick={createFolder}
                className="mx-focus flex items-center justify-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-600 transition hover:bg-slate-100 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/6">
                <FolderPlus className="size-3" /> Folder
              </button>
            </div>
          </div>
        </aside>

        {/* ── Column 2: Editor ── */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Editor toolbar */}
          <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-black">
            <input
              value={selectedPath}
              onChange={e => setSelectedPath(e.target.value)}
              placeholder="Select or type file path…"
              className="mx-focus min-w-0 flex-1 rounded-lg border border-slate-200 bg-transparent px-2 py-1 text-xs text-slate-800 placeholder:text-slate-400 dark:border-white/10 dark:text-slate-300 dark:placeholder:text-slate-600"
            />
            <button onClick={() => saveFile()}
              className="mx-focus flex items-center gap-1.5 rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200">
              <Save className="size-3.5" /> Save
            </button>
            <button onClick={deleteSelected}
              className="mx-focus flex items-center gap-1.5 rounded-lg border border-red-600/20 bg-red-600/10 px-3 py-1.5 text-xs text-red-700 transition hover:bg-red-600/15 dark:text-red-300">
              <Trash2 className="size-3.5" />
            </button>
          </div>
          {/* Monaco */}
          <div className="min-h-0 flex-1 bg-[#1e1e1e]">
            <Editor
              height="100%"
              value={content}
              path={selectedPath || "untitled.tsx"}
              theme="vs-dark"
              onChange={value => setContent(value ?? "")}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                lineHeight: 21,
                padding: { top: 12, bottom: 12 },
                scrollBeyondLastLine: false,
                wordWrap: "on",
                automaticLayout: true,
                renderLineHighlight: "gutter",
              }}
            />
          </div>
          {!selectedPath && (
            <div className="shrink-0 border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500 dark:border-white/10 dark:bg-black">
              Open a file from the tree or create a new one.
            </div>
          )}
        </div>

        {/* ── Column 3: Admin runtime tools ── */}
        {isAdmin && <aside className="thin-scrollbar flex w-72 shrink-0 flex-col gap-0 overflow-y-auto border-l border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-[#050507]">
          {/* Agent task */}
          <div className="border-b border-slate-200 p-3 dark:border-white/10">
            <div className="mb-2 flex items-center gap-2">
              <Zap className="size-3.5 text-slate-500" />
              <h2 className="text-xs font-semibold text-slate-950 dark:text-white">Agent Task</h2>
            </div>
            <textarea
              value={task}
              onChange={e => setTask(e.target.value)}
              rows={3}
              className="mx-focus w-full resize-none rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-800 placeholder:text-slate-400 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:placeholder:text-slate-600"
              placeholder="Describe a build task…"
            />
            <button onClick={runAgent}
              className="mx-focus mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-950 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200">
              <Play className="size-3.5" /> Run Agent
            </button>
          </div>

          {/* Changed files */}
          <div className="border-b border-slate-200 p-3 dark:border-white/10">
            <p className="mb-2 text-xs font-semibold text-slate-400">Changed Files</p>
            {changedFiles.length ? (
              <div className="space-y-1">
                {changedFiles.map(f => (
                  <div key={f} className="flex items-center gap-1.5 rounded-lg bg-blue-600/10 px-2 py-1.5 text-xs text-blue-700 dark:text-blue-300">
                    <CheckCircle2 className="size-3 shrink-0" />
                    <span className="truncate">{f}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-600">No changes yet.</p>
            )}
          </div>

          {/* Agent logs */}
          <div className="border-b border-slate-200 p-3 dark:border-white/10">
            <div className="mb-2 flex items-center gap-2">
              <Bot className="size-3.5 text-slate-500" />
              <p className="text-xs font-semibold text-slate-950 dark:text-white">Agent Logs</p>
            </div>
            <div className="thin-scrollbar h-36 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 font-mono text-[11px] leading-5 dark:border-white/10 dark:bg-black/40">
              {agentLogs.map((log, i) => (
                <p key={`${log}-${i}`} className={
                  log.includes("error") ? "text-red-600 dark:text-red-300" :
                  log.includes("success") ? "text-blue-600 dark:text-blue-300" :
                  log.includes("agent") ? "text-slate-700 dark:text-slate-300" :
                  "text-slate-500"
                }>{log}</p>
              ))}
            </div>
          </div>

          {/* Terminal */}
          <div className="p-3">
            <div className="mb-2 flex items-center gap-2">
              <TerminalSquare className="size-3.5 text-slate-500" />
              <p className="text-xs font-semibold text-slate-950 dark:text-white">Terminal</p>
            </div>
            <div className="flex gap-1.5">
              <input
                value={terminalCommand}
                onChange={e => setTerminalCommand(e.target.value)}
                list="safe-commands"
                placeholder="npm run build"
                className="mx-focus min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
              />
              <datalist id="safe-commands">
                {safeCommands.map(c => <option key={c} value={c} />)}
              </datalist>
              <button onClick={() => runTerminalCommand()}
                className="mx-focus flex items-center gap-1 rounded-lg bg-slate-950 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200">
                <Play className="size-3" />
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {safeCommands.slice(0, 4).map(c => (
                <button key={c} onClick={() => runTerminalCommand(c)}
                  className="mx-focus rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-500 transition hover:bg-slate-50 hover:text-slate-950 dark:border-white/10 dark:bg-white/4 dark:text-slate-400 dark:hover:bg-white/8 dark:hover:text-white">
                  {c}
                </button>
              ))}
            </div>
            {/* Terminal output */}
            {terminalOutput && (
              <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2 font-mono text-[10px] leading-5 dark:border-white/10 dark:bg-black/50">
                <p className={terminalOutput.code === 0 ? "text-blue-600 dark:text-blue-300" : "text-red-600 dark:text-red-300"}>
                  [{terminalOutput.code}] {terminalOutput.command}
                </p>
                {terminalOutput.stdout && (
                  <p className="mt-1 whitespace-pre-wrap text-slate-400">{terminalOutput.stdout.slice(0, 400)}</p>
                )}
                {terminalOutput.stderr && (
                  <p className="mt-1 whitespace-pre-wrap text-red-600/80 dark:text-red-300/80">{terminalOutput.stderr.slice(0, 200)}</p>
                )}
              </div>
            )}
          </div>
        </aside>}
      </div>
    </div>
  );
}
