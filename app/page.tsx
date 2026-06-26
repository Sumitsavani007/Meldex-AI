"use client";

import Link from "next/link";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Code2,
  Gauge,
  KeyRound,
  LayoutDashboard,
  MessageSquare,
  Monitor,
  Shield,
  Sparkles,
  TerminalSquare,
  Zap,
} from "lucide-react";

const actions = [
  { href: "/chat", label: "Open Chat", icon: MessageSquare, primary: true },
  { href: "/workspace", label: "Agent Workspace", icon: TerminalSquare },
  { href: "/settings/tokens", label: "Access Tokens", icon: KeyRound },
  { href: "/master/login", label: "Master Panel", icon: Shield },
];

const capabilities = [
  { title: "Google + token auth", detail: "Extension, CLI, benchmark, and portal use the same account system.", icon: KeyRound },
  { title: "Qwen agent backend", detail: "Chat and agent requests route through live provider health checks.", icon: Bot },
  { title: "Run, verify, autofix", detail: "Tasks can launch servers, inspect output, and repair failures.", icon: Code2 },
  { title: "Production control", detail: "Master panel monitors runtime, providers, vault, users, and diagnostics.", icon: Gauge },
];

const checks = ["Live backend", "Token portal", "Agent CLI", "Model health"];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950 dark:bg-[#0b0f17] dark:text-white">
      <section className="mx-auto grid min-h-[calc(100vh-64px)] max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:px-8">
        <div className="flex flex-col justify-center">
          <div className="inline-flex w-fit items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-300">
            <Sparkles className="size-3.5 text-emerald-500" />
            Meldex AI production console
          </div>

          <h1 className="mt-6 max-w-4xl text-4xl font-semibold tracking-tight sm:text-6xl">
            Build, chat, run agents, and ship from one clean workspace.
          </h1>

          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-400">
            Meldex brings the web app, VS Code extension, CLI, token portal, and live Qwen backend into one connected production system.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            {actions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className={[
                  "inline-flex h-11 items-center gap-2 rounded-md px-4 text-sm font-medium transition",
                  action.primary
                    ? "bg-slate-950 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                    : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-200 dark:hover:bg-white/[0.08]",
                ].join(" ")}
              >
                <action.icon className="size-4" />
                {action.label}
                {action.primary && <ArrowRight className="size-4" />}
              </Link>
            ))}
          </div>

          <div className="mt-10 grid max-w-2xl gap-3 sm:grid-cols-2">
            {checks.map((check) => (
              <div key={check} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                <CheckCircle2 className="size-4 text-emerald-500" />
                {check}
              </div>
            ))}
          </div>
        </div>

        <aside className="flex flex-col justify-center gap-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.03]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">System</p>
                <h2 className="mt-1 text-lg font-semibold">Production Ready</h2>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                Online
              </span>
            </div>
            <div className="mt-4 grid gap-2">
              {capabilities.map((item) => (
                <div key={item.title} className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-white/[0.08] dark:bg-white/[0.03]">
                  <div className="flex items-center gap-2">
                    <item.icon className="size-4 text-slate-500 dark:text-slate-400" />
                    <p className="text-sm font-medium">{item.title}</p>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{item.detail}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Link href="/dashboard" className="rounded-lg border border-slate-200 bg-white p-4 text-sm font-medium transition hover:bg-slate-50 dark:border-white/[0.08] dark:bg-white/[0.03] dark:hover:bg-white/[0.06]">
              <LayoutDashboard className="mb-3 size-5 text-slate-500" />
              Dashboard
            </Link>
            <Link href="/api/extensions/model-health" className="rounded-lg border border-slate-200 bg-white p-4 text-sm font-medium transition hover:bg-slate-50 dark:border-white/[0.08] dark:bg-white/[0.03] dark:hover:bg-white/[0.06]">
              <Monitor className="mb-3 size-5 text-slate-500" />
              Model Health
            </Link>
            <Link href="/chat" className="rounded-lg border border-slate-200 bg-white p-4 text-sm font-medium transition hover:bg-slate-50 dark:border-white/[0.08] dark:bg-white/[0.03] dark:hover:bg-white/[0.06]">
              <MessageSquare className="mb-3 size-5 text-slate-500" />
              Chat
            </Link>
            <Link href="/workspace" className="rounded-lg border border-slate-200 bg-white p-4 text-sm font-medium transition hover:bg-slate-50 dark:border-white/[0.08] dark:bg-white/[0.03] dark:hover:bg-white/[0.06]">
              <Zap className="mb-3 size-5 text-slate-500" />
              Agent
            </Link>
          </div>
        </aside>
      </section>
    </div>
  );
}
