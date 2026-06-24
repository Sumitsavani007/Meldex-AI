"use client";

import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Users, Package, BarChart3, Settings, LogsIcon, Shield, Activity, Layers } from "lucide-react";

const adminSections = [
  { href: "/admin/users", label: "User Management", icon: Users },
  { href: "/admin/projects", label: "Projects", icon: Package },
  { href: "/admin/usage", label: "AI Usage", icon: BarChart3 },
  { href: "/admin/logs", label: "System Logs", icon: LogsIcon },
  { href: "/admin/audit", label: "Audit Logs", icon: Shield },
  { href: "/admin/settings", label: "Settings", icon: Settings }
];

interface AdminStats {
  users: number;
  projects: number;
  tasks: number;
  executions: number;
  auditLogs: number;
}

export default function AdminPage() {
  const { data: session } = useSession();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsError, setStatsError] = useState(false);

  if (!session?.user?.role || !["ADMIN", "OWNER"].includes(session.user.role)) {
    redirect("/unauthorized");
  }

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((r) => r.json())
      .then((data) => setStats(data))
      .catch(() => setStatsError(true));
  }, []);

  const statCards = [
    { label: "Total Users", value: stats?.users ?? "—", icon: Users },
    { label: "Projects", value: stats?.projects ?? "—", icon: Package },
    { label: "Tasks", value: stats?.tasks ?? "—", icon: Layers },
    { label: "Executions", value: stats?.executions ?? "—", icon: Activity },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-ink via-slate-900 to-slate-800 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-white mb-2">Admin Panel</h1>
          <p className="text-slate-400">Manage users, projects, and system configuration</p>
        </div>

        {/* Live stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          {statCards.map((s) => (
            <div
              key={s.label}
              className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-xl p-5 flex items-center justify-between"
            >
              <div>
                <p className="text-slate-400 text-xs mb-1">{s.label}</p>
                <p className="text-3xl font-bold text-white">
                  {statsError ? "—" : s.value}
                </p>
              </div>
              <s.icon className="w-7 h-7 text-mint opacity-30" />
            </div>
          ))}
        </div>
        {statsError && (
          <p className="text-xs text-amber-400 mb-6">
            Stats unavailable — database may not be connected yet.
          </p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {adminSections.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className="group relative overflow-hidden rounded-xl border border-white/10 bg-slate-800/50 p-6 backdrop-blur-xl transition hover:border-mint/50 hover:bg-slate-800/80"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-mint/10 to-transparent opacity-0 transition group-hover:opacity-100" />
              <div className="relative">
                <div className="mb-4 inline-flex p-3 rounded-lg bg-mint/10 border border-mint/20">
                  <section.icon className="w-6 h-6 text-mint" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{section.label}</h3>
                <p className="text-sm text-slate-400">Manage and monitor {section.label.toLowerCase()}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
