"use client";

import { useEffect, useMemo, useState } from "react";
import Editor from "@monaco-editor/react";
import { Bot, File, Folder, FolderPlus, Play, Save, TerminalSquare, Trash2 } from "lucide-react";
import { Panel, SectionShell, StatusPill } from "@/components/ui";
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
  const [agentLogs, setAgentLogs] = useState<string[]>(["[idle] Workspace ready"]);
  const [changedFiles, setChangedFiles] = useState<string[]>([]);
  const [terminalCommand, setTerminalCommand] = useState("npm run build");
  const [terminalOutput, setTerminalOutput] = useState<TerminalRun | null>(null);
  const [terminalRuns, setTerminalRuns] = useState<TerminalRun[]>([]);
  const [status, setStatus] = useState<{ tone: "success" | "error" | "idle"; text: string }>({ tone: "idle", text: "Ready" });
  const files = useMemo(() => flatten(tree).filter((node) => node.type === "file"), [tree]);
  const safeCommands = allowedCommands;

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
    setTerminalRuns(data.terminalRuns ?? []);
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
    setTerminalRuns((current) => [data, ...current]);
    setAgentLogs((current) => [`[terminal] ${data.command} -> exit ${data.code}`, ...current]);
    setStatus({ tone: data.code === 0 ? "success" : "error", text: data.code === 0 ? `${data.command} complete` : `${data.command} failed` });
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
          <div className="min-h-[600px] flex-1 bg-slate-950/70">
            <Editor
              height="100%"
              value={content}
              path={selectedPath || "untitled.tsx"}
              theme="vs-dark"
              onChange={(value) => setContent(value ?? "")}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                lineHeight: 22,
                padding: { top: 16, bottom: 16 },
                scrollBeyondLastLine: false,
                wordWrap: "on",
                automaticLayout: true
              }}
            />
          </div>
          {!selectedPath && (
            <div className="border-t border-white/10 bg-slate-950/70 px-4 py-3 text-xs text-slate-500">
              Create or open a file to start editing with Monaco.
            </div>
          )}
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
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Changed Files</p>
              <div className="thin-scrollbar mt-2 max-h-32 overflow-auto rounded-md border border-white/10 bg-slate-950/60 p-2 text-xs text-slate-300">
                {changedFiles.length ? (
                  changedFiles.map((file) => (
                    <p key={file} className="truncate py-0.5">
                      {file}
                    </p>
                  ))
                ) : (
                  <p className="text-slate-500">No file changes yet.</p>
                )}
              </div>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">
              Destructive actions require confirmation. Current files detected: {files.length}.
            </p>
          </Panel>

          <Panel className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <Bot className="size-4 text-mint" />
              <h2 className="text-sm font-semibold text-white">Agent Logs</h2>
            </div>
            <div className="thin-scrollbar h-44 overflow-auto rounded-md bg-slate-950/80 p-3 font-mono text-xs leading-6">
              {agentLogs.map((log, index) => (
                <p key={`${log}-${index}`} className={log.includes("error") ? "text-red-200" : log.includes("success") ? "text-mint" : "text-slate-400"}>
                  {log}
                </p>
              ))}
            </div>
          </Panel>

          <Panel className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <TerminalSquare className="size-4 text-iris" />
              <h2 className="text-sm font-semibold text-white">Terminal</h2>
            </div>
            <div className="grid gap-2">
              <input
                value={terminalCommand}
                onChange={(event) => setTerminalCommand(event.target.value)}
                list="safe-terminal-commands"
                className="rounded-md border-white/10 bg-slate-950 text-sm text-slate-100 focus:border-mint focus:ring-mint"
                placeholder="npm run build"
              />
              <datalist id="safe-terminal-commands">
                {safeCommands.map((command) => (
                  <option key={command} value={command} />
                ))}
              </datalist>
              <div className="grid grid-cols-2 gap-2">
                {safeCommands.map((command) => (
                  <button
                    key={command}
                    onClick={() => runTerminalCommand(command)}
                    className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-100 transition hover:bg-white/10"
                  >
                    {command}
                  </button>
                ))}
              </div>
              <button onClick={() => runTerminalCommand()} className="inline-flex items-center justify-center gap-2 rounded-md bg-iris px-3 py-2 text-sm font-semibold text-slate-950">
                <Play className="size-4" />
                Run Safe Command
              </button>
            </div>
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Latest Output</p>
              <div className="thin-scrollbar mt-2 max-h-40 overflow-auto rounded-md border border-white/10 bg-slate-950/60 p-2 font-mono text-[11px] leading-5 text-slate-300">
                {terminalOutput ? (
                  <>
                    <p className="text-mint">
                      [{terminalOutput.code}] {terminalOutput.command}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-slate-200">
                      stdout:
                      {"\n"}
                      {terminalOutput.stdout || "[empty]"}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-red-200">
                      stderr:
                      {"\n"}
                      {terminalOutput.stderr || "[empty]"}
                    </p>
                  </>
                ) : (
                  <p className="text-slate-500">No terminal output yet.</p>
                )}
              </div>
            </div>
          </Panel>

          <Panel className="p-4">
            <h2 className="mb-3 text-sm font-semibold text-white">Terminal Runs</h2>
            <div className="thin-scrollbar max-h-48 overflow-auto rounded-md bg-slate-950/80 p-3 font-mono text-xs leading-6">
              {terminalRuns.length ? (
                terminalRuns.map((run, index) => (
                  <div key={`${run.command}-${index}`} className="mb-3 border-b border-white/5 pb-3 last:mb-0 last:border-0 last:pb-0">
                    <p className={run.code === 0 ? "text-mint" : "text-red-200"}>
                      {run.command} {"->"} exit {run.code}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-slate-400">
                      stdout:
                      {"\n"}
                      {run.stdout || "[empty]"}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-red-200">
                      stderr:
                      {"\n"}
                      {run.stderr || "[empty]"}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-slate-500">No terminal runs yet.</p>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </SectionShell>
  );
}
