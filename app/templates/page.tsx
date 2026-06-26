"use client";

import Link from "next/link";
import { ArrowRight, LayoutTemplate, Sparkles } from "lucide-react";
import { PanelCard, UserPanelShell } from "@/components/user-panel-shell";

const templates = [
  "SaaS Landing Page",
  "Portfolio Website",
  "Pricing Page",
  "Dashboard Starter",
  "Contact Form",
  "AI Blog Platform",
];

export default function TemplatesPage() {
  return (
    <UserPanelShell title="Templates" description="Start from polished project patterns and continue in Workspace." eyebrow="Templates">
      <PanelCard className="mb-5 bg-gradient-to-br from-white via-violet-50 to-white dark:from-white/[0.06] dark:via-violet-500/10 dark:to-white/[0.03]">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Featured templates</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Choose a starting point, then let the agent customize it.</p>
          </div>
          <Link href="/workspace" className="mx-focus inline-flex h-10 items-center gap-2 rounded-lg bg-violet-600 px-4 text-sm font-semibold text-white shadow-sm shadow-violet-600/20 hover:bg-violet-700">Create from prompt <ArrowRight className="size-4" /></Link>
        </div>
      </PanelCard>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {templates.map((template) => (
          <Link key={template} href="/workspace" className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-md dark:border-white/10 dark:bg-[#111113]">
            <div className="aspect-video rounded-xl border border-slate-100 bg-gradient-to-br from-slate-50 to-violet-50 p-4 dark:border-white/8 dark:from-white/[0.05] dark:to-violet-500/10">
              <Sparkles className="size-5 text-violet-600" />
              <div className="mt-10 h-3 w-2/3 rounded-full bg-slate-200 dark:bg-white/10" />
              <div className="mt-3 h-2 w-1/2 rounded-full bg-violet-200 dark:bg-violet-400/30" />
            </div>
            <div className="mt-4 flex items-center gap-3">
              <LayoutTemplate className="size-4 text-violet-600" />
              <h2 className="flex-1 text-sm font-semibold">{template}</h2>
              <ArrowRight className="size-4 text-slate-300 group-hover:text-violet-600" />
            </div>
          </Link>
        ))}
      </div>
    </UserPanelShell>
  );
}
