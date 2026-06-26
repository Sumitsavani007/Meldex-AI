"use client";

import Link from "next/link";
import { Bot, Code2, Play, ShieldCheck, Workflow } from "lucide-react";
import { PanelCard, SoftButton, UserPanelShell } from "@/components/user-panel-shell";

const agents = [
  { name: "Coding Agent", status: "Ready", description: "Build, edit, verify, and repair project files.", icon: Code2 },
  { name: "Workspace Agent", status: "Ready", description: "Runs prompts against saved workspace projects.", icon: Workflow },
  { name: "Security Reviewer", status: "Planned", description: "Reviews diffs and logs for secret exposure.", icon: ShieldCheck },
];

export default function AgentsPage() {
  return (
    <UserPanelShell title="Agents" description="AI workers connected to Meldex workspace and runtime." eyebrow="Agents">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {agents.map((agent) => (
          <PanelCard key={agent.name}>
            <div className="flex items-start justify-between gap-3">
              <span className="grid size-11 place-items-center rounded-xl bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200"><agent.icon className="size-5" /></span>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200">{agent.status}</span>
            </div>
            <h2 className="mt-5 text-base font-semibold">{agent.name}</h2>
            <p className="mt-2 min-h-12 text-sm leading-6 text-slate-500 dark:text-slate-400">{agent.description}</p>
            <div className="mt-5 flex gap-2">
              {agent.status === "Ready" ? (
                <Link href="/workspace" className="mx-focus inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 text-sm font-semibold text-white shadow-sm shadow-violet-600/20 hover:bg-violet-700"><Play className="size-4" /> Run</Link>
              ) : (
                <SoftButton disabled title="This agent is not available in this release" className="flex-1">Unavailable</SoftButton>
              )}
              <SoftButton disabled title="Agent settings are managed by the workspace runtime"><Bot className="size-4" /> Config</SoftButton>
            </div>
          </PanelCard>
        ))}
      </div>
    </UserPanelShell>
  );
}
