"use client";

import Link from "next/link";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  Activity, Bot, CreditCard, FolderKanban, Github,
  MessageSquare, PackageOpen, Plus, Settings, TerminalSquare,
  Upload, Zap, ArrowRight, TrendingUp, Cpu, Users
} from "lucide-react";
import { Panel, SectionShell, StatusPill } from "@/components/ui";
import { DashboardCard } from "@/components/dashboard-card";
import { agentPipeline, adminMetrics, dashboardStats, modelProviders, routeMap } from "@/lib/product";

const usageData = [
  { day: "Mon", tokens: 22, tasks: 12 },
  { day: "Tue", tokens: 36, tasks: 19 },
  { day: "Wed", tokens: 31, tasks: 17 },
  { day: "Thu", tokens: 48, tasks: 26 },
  { day: "Fri", tokens: 61, tasks: 33 },
  { day: "Sat", tokens: 44, tasks: 21 },
  { day: "Sun", tokens: 72, tasks: 39 },
];

const quickActions = [
  { icon: MessageSquare, label: "New Chat", href: "/chat", color: "text-mint" },
  { icon: TerminalSquare, label: "Workspace", href: "/workspace", color: "text-iris" },
  { icon: Settings, label: "Settings", href: "/settings", color: "text-ember" },
  { icon: CreditCard, label: "Billing", href: "/settings/billing", color: "text-rose" },
];

export default function DashboardPage() {
  return (
    <SectionShell className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-mint">Command Center</p>
          <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">Meldex Dashboard</h1>
        </div>
        <Link href="/workspace" className="inline-flex items-center gap-2 rounded-xl bg-mint px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-mint/90">
          <TerminalSquare className="size-4" />
          Open Workspace
          <ArrowRight className="size-4" />
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {dashboardStats.map((stat, i) => (
          <DashboardCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            trendLabel={stat.delta}
            trend="up"
            icon={[Activity, Bot, FolderKanban, Cpu][i % 4]}
            accent={["mint", "iris", "ember", "rose"][i % 4] as "mint" | "iris" | "ember" | "rose"}
          />
        ))}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {quickActions.map(q => (
          <Link key={q.label} href={q.href}
            className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm font-medium text-slate-300 transition hover:border-white/15 hover:bg-white/6 hover:text-white"
          >
            <q.icon className={`size-4 ${q.color}`} />
            {q.label}
          </Link>
        ))}
      </div>

      {/* Main grid */}
      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        {/* Usage chart */}
        <Panel className="p-5">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-white">Usage Analytics</h2>
              <p className="mt-0.5 text-xs text-slate-500">Token usage and task counts — last 7 days</p>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-mint inline-block" />Tokens</span>
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-iris inline-block" />Tasks</span>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={usageData}>
                <defs>
                  <linearGradient id="grad-tokens" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="#63f2be" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#63f2be" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="grad-tasks" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="#9aa4ff" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#9aa4ff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,.06)" vertical={false} />
                <XAxis dataKey="day" stroke="#475569" fontSize={11} axisLine={false} tickLine={false} />
                <YAxis stroke="#475569" fontSize={11} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "#080c17", border: "1px solid rgba(255,255,255,.1)", borderRadius: 10, fontSize: 12 }}
                  cursor={{ stroke: "rgba(99,242,190,0.15)", strokeWidth: 1 }}
                />
                <Area type="monotone" dataKey="tokens" stroke="#63f2be" fill="url(#grad-tokens)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="tasks" stroke="#9aa4ff" fill="url(#grad-tasks)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        {/* Agent pipeline */}
        <Panel className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-white">Agent Pipeline</h2>
            <Zap className="size-4 text-amber-400" />
          </div>
          <div className="space-y-2.5">
            {agentPipeline.map((agent, i) => (
              <div key={agent.name} className="flex items-start gap-3 rounded-xl border border-white/8 bg-white/[0.03] p-3">
                <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-mint/10 text-xs font-bold text-mint">{i+1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white">{agent.name}</p>
                  <p className="mt-0.5 truncate text-xs text-slate-400">{agent.role}</p>
                </div>
                <StatusPill tone={agent.status === "complete" ? "success" : "idle"}>{agent.status}</StatusPill>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* Bottom grid */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Admin metrics bar chart */}
        <Panel className="p-5">
          <h2 className="mb-4 font-semibold text-white">Admin Metrics</h2>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={adminMetrics} barSize={20}>
                <CartesianGrid stroke="rgba(255,255,255,.06)" vertical={false} />
                <XAxis dataKey="name" stroke="#475569" fontSize={11} axisLine={false} tickLine={false} />
                <YAxis stroke="#475569" fontSize={11} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "#080c17", border: "1px solid rgba(255,255,255,.1)", borderRadius: 10, fontSize: 12 }} />
                <Bar dataKey="value" fill="#63f2be" radius={[5,5,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        {/* Model providers */}
        <Panel className="p-5">
          <h2 className="mb-4 font-semibold text-white">Model Providers</h2>
          <div className="space-y-2">
            {modelProviders.map(p => (
              <div key={p.provider} className="flex items-center justify-between rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2.5 text-xs">
                <span className="font-medium text-mint">{p.provider}</span>
                <span className="max-w-[160px] truncate text-slate-400">{p.model}</span>
                <span className="rounded-full border border-white/10 px-2 py-0.5 text-slate-400">{p.brain}</span>
              </div>
            ))}
          </div>
          <h2 className="mb-3 mt-5 font-semibold text-white">API Routes</h2>
          <div className="space-y-1.5">
            {routeMap.slice(0, 6).map(route => (
              <code key={route} className="block rounded-lg border border-white/8 bg-slate-950/70 px-3 py-1.5 text-xs text-slate-400">
                {route}
              </code>
            ))}
          </div>
        </Panel>
      </div>

      {/* Quick launch cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: Plus, title: "New Workspace", desc: "Start an isolated project workspace", color: "text-mint" },
          { icon: Upload, title: "ZIP Import", desc: "Import an existing project archive", color: "text-iris" },
          { icon: Github, title: "GitHub Import", desc: "Connect a repository for diffs and PRs", color: "text-ember" },
          { icon: PackageOpen, title: "Templates", desc: "Start from SaaS, API, or landing page", color: "text-rose" },
        ].map(c => (
          <Panel key={c.title} className="group cursor-pointer p-5 transition hover:border-white/15 hover:bg-white/[0.055]">
            <div className="mb-3 grid size-9 place-items-center rounded-lg border border-white/10 bg-white/5">
              <c.icon className={`size-4 ${c.color}`} />
            </div>
            <p className="font-semibold text-white">{c.title}</p>
            <p className="mt-1 text-xs text-slate-500">{c.desc}</p>
          </Panel>
        ))}
      </div>
    </SectionShell>
  );
}


