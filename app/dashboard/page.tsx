"use client";

import Link from "next/link";
import { Bot, FolderPlus, Github, MessageSquare, PackageOpen, Plus, TerminalSquare, Upload } from "lucide-react";
import { ActionCard, Panel, SectionShell, StatusPill } from "@/components/ui";

const recentTasks = [
  { task: "Create landing page", status: "completed" },
  { task: "Wire Ollama chat route", status: "ready" },
  { task: "Review workspace editor", status: "pending" }
];

const logs = [
  { level: "success", text: "Workspace API mounted at /api/workspace" },
  { level: "success", text: "Chat API mounted at /api/chat" },
  { level: "idle", text: "Waiting for agent task" }
] as const;

export default function DashboardPage() {
  return (
    <SectionShell>
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-mint">Agent Console</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">Dashboard</h1>
        </div>
        <Link href="/workspace" className="inline-flex items-center gap-2 rounded-md bg-mint px-4 py-2 text-sm font-semibold text-slate-950">
          <TerminalSquare className="size-4" />
          Open Workspace
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ActionCard icon={Plus} title="New Project" description="Spin up a clean workspace and start a new coding session." action="Create" />
        <ActionCard icon={Upload} title="Upload ZIP" description="Bring an existing project archive into the local workspace." action="Import" />
        <ActionCard icon={Github} title="Connect GitHub Repo" description="Prepare repository sync for future source control workflows." action="Connect" />
        <ActionCard icon={MessageSquare} title="AI Chat" description="Ask your local Ollama model for code, plans, and debugging help." action="Chat" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <Panel className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Recent Tasks</h2>
            <FolderPlus className="size-5 text-slate-500" />
          </div>
          <div className="space-y-3">
            {recentTasks.map((item) => (
              <div key={item.task} className="flex items-center justify-between rounded-md border border-white/10 bg-white/[0.035] p-3">
                <span className="text-sm text-slate-200">{item.task}</span>
                <StatusPill tone={item.status === "completed" ? "success" : "idle"}>{item.status}</StatusPill>
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Execution Logs</h2>
            <Bot className="size-5 text-mint" />
          </div>
          <div className="thin-scrollbar max-h-80 overflow-auto rounded-md bg-slate-950/80 p-4 font-mono text-xs leading-6">
            {logs.map((log, index) => (
              <p key={`${log.text}-${index}`} className={log.level === "success" ? "text-mint" : "text-slate-400"}>
                [{log.level}] {log.text}
              </p>
            ))}
            <p className="text-slate-500">[hint] Configure Ollama in Settings, then open AI Chat.</p>
          </div>
        </Panel>
      </div>

      <Panel className="mt-6 p-5">
        <div className="mb-4 flex items-center gap-3">
          <PackageOpen className="size-5 text-iris" />
          <h2 className="text-lg font-semibold text-white">Agent Mode</h2>
        </div>
        <p className="max-w-3xl text-sm leading-6 text-slate-400">
          Type tasks like “Create a landing page”, “Fix login bug”, or “Redesign this website” from the workspace.
          Meldex AI reads local files, drafts a plan, applies safe edits, lists changed files, and asks before destructive actions.
        </p>
      </Panel>
    </SectionShell>
  );
}
