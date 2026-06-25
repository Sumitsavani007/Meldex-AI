"use client";

import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Activity, BarChart3, Layers, LogsIcon, MonitorCheck,
  Package, Settings, Shield, Users, ArrowRight, AlertTriangle
} from "lucide-react";
import { SectionShell, PageHeader } from "@/components/ui";
import { DashboardCard } from "@/components/dashboard-card";

const adminSections = [
  { href: "/admin/users", label: "User Management", icon: Users, desc: "Manage user accounts, roles, and permissions", color: "text-mint", accent: "border-mint/20 bg-mint/5 hover:border-mint/40" },
  { href: "/admin/projects", label: "Projects", icon: Package, desc: "Browse and manage all workspace projects", color: "text-iris", accent: "border-iris/20 bg-iris/5 hover:border-iris/40" },
  { href: "/admin/usage", label: "AI Usage", icon: BarChart3, desc: "Monitor token usage, model calls, and cost", color: "text-ember", accent: "border-ember/20 bg-ember/5 hover:border-ember/40" },
  { href: "/admin/logs", label: "System Logs", icon: LogsIcon, desc: "Real-time application and error logs", color: "text-sky-400", accent: "border-sky-400/20 bg-sky-400/5 hover:border-sky-400/40" },
  { href: "/admin/audit", label: "Audit Trail", icon: Shield, desc: "Security events, logins, and admin actions", color: "text-rose", accent: "border-rose/20 bg-rose/5 hover:border-rose/40" },
  { href: "/admin/system", label: "System Health", icon: MonitorCheck, desc: "Database, memory, and service diagnostics", color: "text-amber-400", accent: "border-amber-400/20 bg-amber-400/5 hover:border-amber-400/40" },
  { href: "/admin/settings", label: "Admin Settings", icon: Settings, desc: "Platform-wide configuration and features", color: "text-slate-300", accent: "border-white/10 bg-white/[0.03] hover:border-white/25" },
];

interface AdminStats {
  users: number;
  projects: number;
  tasks: number;
  executions: number;
  auditLogs: number;
}

export default function AdminPage() {
  const { data: session, status } = useSession();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsError, setStatsError] = useState(false);
  const [loading, setLoading] = useState(true);

  if (status === "loading") return null;
  if (!session?.user?.role || !["ADMIN", "OWNER"].includes(session.user.role)) {
    redirect("/unauthorized");
  }

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((r) => r.json())
      .then((data) => { setStats(data); setLoading(false); })
      .catch(() => { setStatsError(true); setLoading(false); });
  }, []);

  const statCards = [
    { label: "Total Users", value: loading ? "…" : String(stats?.users ?? "—"), icon: Users, accent: "mint" as const, trendLabel: "+12% this month" },
    { label: "Projects", value: loading ? "…" : String(stats?.projects ?? "—"), icon: Package, accent: "iris" as const, trendLabel: "Active workspaces" },
    { label: "Agent Tasks", value: loading ? "…" : String(stats?.tasks ?? "—"), icon: Layers, accent: "ember" as const, trendLabel: "Total executed" },
    { label: "Executions", value: loading ? "…" : String(stats?.executions ?? "—"), icon: Activity, accent: "rose" as const, trendLabel: "Terminal runs" },
  ];

  return (
    <SectionShell className="space-y-8 py-8">
      <PageHeader
        label="Administration"
        title="Admin Panel"
        description="Manage users, monitor system health, and configure the platform."
        action={
          <div className="flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-xs font-medium text-amber-300">
            <Shield className="size-3.5" />
            {session?.user?.role ?? "ADMIN"}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map((s) => (
          <DashboardCard
            key={s.label}
            label={s.label}
            value={s.value}
            icon={s.icon}
            accent={s.accent}
            trendLabel={s.trendLabel}
            trend="up"
          />
        ))}
      </div>

      {statsError && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-300">
          <AlertTriangle className="size-4 shrink-0" />
          Stats unavailable — database may not be connected.
        </div>
      )}

      <div>
        <h2 className="mb-4 text-sm font-semibold text-slate-400">Management Sections</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {adminSections.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className={["group relative flex flex-col gap-3 overflow-hidden rounded-xl border p-5 transition", section.accent].join(" ")}
            >
              <div className="flex items-start justify-between">
                <span className={["grid size-10 place-items-center rounded-lg border border-white/10 bg-white/5", section.color].join(" ")}>
                  <section.icon className="size-5" />
                </span>
                <ArrowRight className="size-4 translate-x-0 text-slate-600 opacity-0 transition group-hover:translate-x-1 group-hover:opacity-100" />
              </div>
              <div>
                <p className="font-semibold text-white">{section.label}</p>
                <p className="mt-0.5 text-xs leading-5 text-slate-400">{section.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </SectionShell>
  );
}
