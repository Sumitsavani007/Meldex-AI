"use client";

import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Users, Package, BarChart3, Settings, LogsIcon, Shield } from "lucide-react";

const adminSections = [
  { href: "/admin/users", label: "User Management", icon: Users },
  { href: "/admin/projects", label: "Projects", icon: Package },
  { href: "/admin/usage", label: "AI Usage", icon: BarChart3 },
  { href: "/admin/logs", label: "System Logs", icon: LogsIcon },
  { href: "/admin/audit", label: "Audit Logs", icon: Shield },
  { href: "/admin/settings", label: "Settings", icon: Settings }
];

export default function AdminPage() {
  const { data: session } = useSession();

  if (!session?.user?.role || !["ADMIN", "OWNER"].includes(session.user.role)) {
    redirect("/unauthorized");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-ink via-slate-900 to-slate-800 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-white mb-2">Admin Panel</h1>
          <p className="text-slate-400">Manage users, projects, and system configuration</p>
        </div>

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
