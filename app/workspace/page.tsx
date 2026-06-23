"use client";

import { useEffect, useMemo, useState } from "react";
import { Bot, File, Folder, FolderPlus, Play, Save, Trash2 } from "lucide-react";
import { Panel, SectionShell, StatusPill } from "@/components/ui";

type WorkspaceNode = {
  name: string;
  path: string;
  type: "file" | "folder";
  children?: WorkspaceNode[];
};

function flatten(nodes: WorkspaceNode[]): WorkspaceNode[] {
  return nodes.flatMap((node) => [node, ...(node.children ? flatten(node.children) : [])]);
}

function TreeNode({ node, onSelect }: { node: WorkspaceNode; onSelect: (node: WorkspaceNode) => void }) {
  return (
    <div>
      <button
        onClick={() => onSelect(node)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-slate-300 hover:bg-white/7 hover:text-white"
      >
        {node.type === "folder" ? <Folder className="size-4 text-ember" /> : <File className="size-4 text-slate-500" />}
        <span className="truncate">{node.name}</span>
      </button>
      {node.children && <div className="ml-4 border-l border-white/10 pl-2">{node.children.map((child) => <TreeNode key={child.path} node={child} onSelect={onSelect} />)}</div>}
    </div>
  );
}

export default function WorkspacePage() {
  const [tree, setTree] = useState<WorkspaceNode[]>([]);
  const [selectedPath, setSelectedPath] = useState("");
  const [content, setContent] = useState("");
  const [newPath, setNewPath] = useState("src/app.tsx");
  const [task, setTask] = useState("Create a landing page");
  const [logs, setLogs] = useState<string[]>(["[idle] Workspace ready"]);
  const [status, setStatus] = useState<{ tone: "success" | "error" | "idle"; text: string }>({ tone: "idle", text: "Ready" });
  const files = useMemo(() => flatten(tree).filter((node) => node.type === "file"), [tree]);

  async function refreshTree() {
    const response = await fetch("/api/workspace");
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error);
    }
    setTree(data.tree);
  }

  useEffect(() => {
    refreshTree().catch((error) => setStatus({ tone: "error", text: error.message }));
  }, []);

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
    setLogs((current) => [`[success] Saved ${path}`, ...current]);
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
    setLogs((current) => [`[success] Created folder ${folderPath}`, ...current]);
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
    setLogs((current) => [`[success] Deleted ${selectedPath}`, ...current]);
    setStatus({ tone: "success", text: "File deleted" });
  }

  async function runAgent() {
    setStatus({ tone: "idle", text: "Agent planning..." });
    setLogs((current) => [`[agent] ${task}`, ...current]);
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
    setLogs((current) => [`[success] ${data.summary}`, `[changed] ${data.changedFiles.join(", ")}`, ...current]);
    setStatus({ tone: "success", text: "Agent task complete" });
  }

  return (
    <SectionShell className="py-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-mint">Local Workspace</p>
          <h1 className="mt-1 text-3xl font-semibold text-white">Project Workspace</h1>
        </div>
        <StatusPill tone={status.tone}>{status.text}</StatusPill>
      </div>

      <div className="grid min-h-[720px] gap-4 xl:grid-cols-[300px_1fr_360px]">
        <Panel className="overflow-hidden">
          <div className="border-b border-white/10 p-4">
            <h2 className="text-sm font-semibold text-white">File Tree</h2>
          </div>
          <div className="thin-scrollbar h-[640px] overflow-auto p-3">
            {tree.length ? tree.map((node) => <TreeNode key={node.path} node={node} onSelect={openNode} />) : <p className="p-2 text-sm text-slate-500">No files yet.</p>}
          </div>
        </Panel>

        <Panel className="flex min-h-0 flex-col overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-white/10 p-3">
            <input
              value={selectedPath}
              onChange={(event) => setSelectedPath(event.target.value)}
              placeholder="Select or enter file path"
              className="min-w-0 flex-1 rounded-md border-white/10 bg-slate-950 text-sm text-slate-100 focus:border-mint focus:ring-mint"
            />
            <button onClick={() => saveFile()} className="grid size-10 place-items-center rounded-md bg-mint text-slate-950" aria-label="Save file">
              <Save className="size-4" />
            </button>
            <button onClick={deleteSelected} className="grid size-10 place-items-center rounded-md border border-red-400/30 bg-red-400/10 text-red-100" aria-label="Delete file">
              <Trash2 className="size-4" />
            </button>
          </div>
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            spellCheck={false}
            className="thin-scrollbar min-h-[600px] flex-1 resize-none border-0 bg-slate-950/70 p-4 font-mono text-sm leading-6 text-slate-100 focus:ring-0"
            placeholder="// Create or open a file to start editing"
          />
        </Panel>

        <div className="grid gap-4">
          <Panel className="p-4">
            <h2 className="mb-3 text-sm font-semibold text-white">Create</h2>
            <div className="grid gap-3">
              <input
                value={newPath}
                onChange={(event) => setNewPath(event.target.value)}
                className="rounded-md border-white/10 bg-slate-950 text-sm text-slate-100 focus:border-mint focus:ring-mint"
              />
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => saveFile(newPath, "")} className="inline-flex items-center justify-center gap-2 rounded-md bg-mint px-3 py-2 text-sm font-semibold text-slate-950">
                  <File className="size-4" />
                  File
                </button>
                <button onClick={createFolder} className="inline-flex items-center justify-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100">
                  <FolderPlus className="size-4" />
                  Folder
                </button>
              </div>
            </div>
          </Panel>

          <Panel className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <Bot className="size-4 text-mint" />
              <h2 className="text-sm font-semibold text-white">Agent Mode</h2>
            </div>
            <textarea
              value={task}
              onChange={(event) => setTask(event.target.value)}
              className="min-h-24 w-full resize-none rounded-md border-white/10 bg-slate-950 text-sm text-slate-100 focus:border-mint focus:ring-mint"
            />
            <button onClick={runAgent} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md bg-mint px-3 py-2 text-sm font-semibold text-slate-950">
              <Play className="size-4" />
              Run Agent
            </button>
            <p className="mt-3 text-xs leading-5 text-slate-500">
              Destructive actions require confirmation. Current files detected: {files.length}.
            </p>
          </Panel>

          <Panel className="p-4">
            <h2 className="mb-3 text-sm font-semibold text-white">Execution Logs</h2>
            <div className="thin-scrollbar h-64 overflow-auto rounded-md bg-slate-950/80 p-3 font-mono text-xs leading-6">
              {logs.map((log, index) => (
                <p key={`${log}-${index}`} className={log.includes("error") ? "text-red-200" : log.includes("success") ? "text-mint" : "text-slate-400"}>
                  {log}
                </p>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </SectionShell>
  );
}
