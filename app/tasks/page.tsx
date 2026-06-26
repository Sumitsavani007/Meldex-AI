"use client";

import Link from "next/link";
import { CheckCircle2, Clock3, Loader2, RotateCw, XCircle } from "lucide-react";
import { PanelCard, SoftButton, UserPanelShell } from "@/components/user-panel-shell";

const tasks = [
  { title: "Create landing page", status: "Completed", icon: CheckCircle2 },
  { title: "Verify preview", status: "Completed", icon: CheckCircle2 },
  { title: "Agent run", status: "Running", icon: Loader2 },
  { title: "Rollback test", status: "Idle", icon: Clock3 },
  { title: "Provider timeout", status: "Failed", icon: XCircle },
];

export default function TasksPage() {
  return (
    <UserPanelShell title="Tasks" description="Timeline of agent work, verification, retries, logs, and rollback checkpoints." eyebrow="Tasks">
      <div className="space-y-3">
        {tasks.map((task) => (
          <PanelCard key={task.title} className="p-4">
            <div className="flex items-center gap-4">
              <span className="grid size-10 place-items-center rounded-xl bg-slate-50 text-violet-600 dark:bg-white/[0.05]"><task.icon className={`size-4 ${task.status === "Running" ? "animate-spin" : ""}`} /></span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-sm font-semibold">{task.title}</h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{task.status} · workspace runtime</p>
              </div>
              {task.status === "Failed" ? <SoftButton disabled title="Retry this task from the workspace history"><RotateCw className="size-4" /> Retry</SoftButton> : <Link href="/workspace" className="text-sm font-semibold text-violet-600">Open</Link>}
            </div>
          </PanelCard>
        ))}
      </div>
    </UserPanelShell>
  );
}
