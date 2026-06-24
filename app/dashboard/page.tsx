"use client";

import Link from "next/link";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  Activity,
  Bot,
  CreditCard,
  FolderKanban,
  Github,
  KeyRound,
  MessageSquare,
  PackageOpen,
  Plus,
  Settings,
  TerminalSquare,
  Upload
} from "lucide-react";
import { ActionCard, Panel, SectionShell, StatusPill } from "@/components/ui";
import { adminMetrics, agentPipeline, dashboardStats, modelProviders, routeMap } from "@/lib/product";

const usageData = [
  { day: "Mon", tokens: 22, tasks: 12 },
  { day: "Tue", tokens: 36, tasks: 19 },
  { day: "Wed", tokens: 31, tasks: 17 },
  { day: "Thu", tokens: 48, tasks: 26 },
  { day: "Fri", tokens: 61, tasks: 33 },
  { day: "Sat", tokens: 44, tasks: 21 },
  { day: "Sun", tokens: 72, tasks: 39 }
];

const navSections = [
  { label: "AI Chat", icon: MessageSquare, href: "/chat" },
  { label: "Projects", icon: FolderKanban, href: "/workspace" },
  { label: "Agent Tasks", icon: Bot, href: "/workspace" },
  { label: "Models", icon: KeyRound, href: "/settings" },
  { label: "Settings", icon: Settings, href: "/settings" },
  { label: "Billing", icon: CreditCard, href: "/dashboard" },
  { label: "Usage", icon: Activity, href: "/dashboard" },
  { label: "Logs", icon: TerminalSquare, href: "/workspace" }
];

export default function DashboardPage() {
  return (
    <SectionShell>
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-mint">Command Center</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">Meldex AI Dashboard</h1>
        </div>
        <Link href="/workspace" className="inline-flex items-center gap-2 rounded-md bg-mint px-4 py-2 text-sm font-semibold text-slate-950">
          <TerminalSquare className="size-4" />
          Open Workspace
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {dashboardStats.map((stat) => (
          <Panel key={stat.label} className="p-5">
            <div className="flex items-center justify-between">
              <stat.icon className="size-5 text-mint" />
              <span className="rounded-full border border-mint/20 bg-mint/10 px-2 py-1 text-xs text-mint">{stat.delta}</span>
            </div>
            <p className="mt-5 text-3xl font-semibold text-white">{stat.value}</p>
            <p className="mt-1 text-sm text-slate-400">{stat.label}</p>
          </Panel>
        ))}
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[260px_1fr_380px]">
        <Panel className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-white">Navigation</h2>
          <div className="grid gap-1">
            {navSections.map((item) => (
              <Link key={item.label} href={item.href} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-300 transition hover:bg-white/7 hover:text-white">
                <item.icon className="size-4 text-slate-500" />
                {item.label}
              </Link>
            ))}
          </div>
        </Panel>

        <Panel className="p-5">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Usage Analytics</h2>
              <p className="text-sm text-slate-500">Users, tasks, token usage, model usage, and error rate surfaces.</p>
            </div>
            <StatusPill tone="success">Live</StatusPill>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={usageData}>
                <defs>
                  <linearGradient id="tokens" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="#63f2be" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="#63f2be" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,.08)" vertical={false} />
                <XAxis dataKey="day" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip contentStyle={{ background: "#080c17", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8 }} />
                <Area type="monotone" dataKey="tokens" stroke="#63f2be" fill="url(#tokens)" strokeWidth={2} />
                <Area type="monotone" dataKey="tasks" stroke="#9aa4ff" fill="transparent" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel className="p-5">
          <h2 className="mb-4 text-lg font-semibold text-white">Agent Pipeline</h2>
          <div className="grid gap-3">
            {agentPipeline.map((agent, index) => (
              <div key={agent.name} className="rounded-md border border-white/10 bg-white/[0.035] p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-white">
                    {index + 1}. {agent.name}
                  </p>
                  <StatusPill tone={agent.status === "complete" ? "success" : "idle"}>{agent.status}</StatusPill>
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-400">{agent.role}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ActionCard icon={Plus} title="New Workspace" description="Create workspace/projects/{userId}/{projectId} for isolated builds." action="Create" />
        <ActionCard icon={Upload} title="ZIP Import" description="Prepare archive import for existing projects and templates." action="Import" />
        <ActionCard icon={Github} title="GitHub Import" description="Connect repositories for future branch, diff, and PR workflows." action="Connect" />
        <ActionCard icon={PackageOpen} title="Templates" description="Start from SaaS, dashboard, API, landing page, or agent templates." action="Browse" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_0.9fr]">
        <Panel className="p-5">
          <h2 className="mb-4 text-lg font-semibold text-white">Admin Panel Analytics</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={adminMetrics}>
                <CartesianGrid stroke="rgba(255,255,255,.08)" vertical={false} />
                <XAxis dataKey="name" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip contentStyle={{ background: "#080c17", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8 }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel className="p-5">
          <h2 className="mb-4 text-lg font-semibold text-white">API Routes</h2>
          <div className="grid gap-2">
            {routeMap.map((route) => (
              <code key={route} className="rounded-md border border-white/10 bg-slate-950/70 px-3 py-2 text-xs text-slate-300">
                {route}
              </code>
            ))}
          </div>
          <h3 className="mb-3 mt-5 text-sm font-semibold text-white">Model Manager</h3>
          <div className="thin-scrollbar max-h-48 overflow-auto rounded-md border border-white/10">
            {modelProviders.map((provider) => (
              <div key={provider.provider} className="grid grid-cols-[90px_1fr_58px] gap-2 border-b border-white/10 p-2 text-xs last:border-0">
                <span className="text-mint">{provider.provider}</span>
                <span className="truncate text-slate-300">{provider.model}</span>
                <span className="text-slate-500">{provider.brain}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </SectionShell>
  );
}
