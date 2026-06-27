"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bell,
  ChevronLeft,
  ChevronRight,
  Command,
  CreditCard,
  Database,
  Gauge,
  Key,
  LayoutDashboard,
  LogOut,
  Menu,
  Monitor,
  Search,
  Settings,
  Shield,
  User,
  Users,
  Zap,
} from "lucide-react";

type NavItem = {
  label: string;
  href: string;
  icon: React.ElementType;
  section?: string;
};

const navItems: NavItem[] = [
  { label: "Overview", href: "/admin/master?section=overview", icon: LayoutDashboard, section: "overview" },
  { label: "AI Models", href: "/admin/master?section=ai", icon: Zap, section: "ai" },
  { label: "Vault", href: "/admin/master?section=vault", icon: Key, section: "vault" },
  { label: "Integrations", href: "/admin/master?section=integrations", icon: Database, section: "integrations" },
  { label: "Runtime", href: "/admin/master?section=runtime", icon: Settings, section: "runtime" },
  { label: "Plans & Credits", href: "/admin/master?section=plans", icon: CreditCard, section: "plans" },
  { label: "Users", href: "/admin/master?section=users", icon: Users, section: "users" },
  { label: "Audit Logs", href: "/admin/master?section=audit", icon: Activity, section: "audit" },
  { label: "Diagnostics", href: "/admin/master?section=diagnostics", icon: Monitor, section: "diagnostics" },
];

function getSectionFromLocation() {
  if (typeof window === "undefined") return "overview";
  return new URLSearchParams(window.location.search).get("section") || "overview";
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function MasterShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [section, setSection] = useState("overview");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const update = () => setSection(getSectionFromLocation());
    update();
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, [pathname]);

  const current = useMemo(
    () => navItems.find((item) => item.section === section) ?? navItems[0],
    [section]
  );

  const sidebar = (
    <aside
      className={cx(
        "flex h-full flex-col border-r border-slate-200 bg-white text-slate-950 dark:border-white/[0.08] dark:bg-[#090d14] dark:text-white",
        collapsed ? "w-[72px]" : "w-[264px]"
      )}
    >
      <div className="flex h-16 items-center gap-3 border-b border-slate-200 px-4 dark:border-white/[0.08]">
        <Link href="/admin/master?section=overview" className="flex min-w-0 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-slate-200 bg-slate-950 text-white dark:border-white/[0.1] dark:bg-white dark:text-slate-950">
            <Shield className="size-4" />
          </span>
          {!collapsed && (
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold tracking-tight">Meldex Master</span>
              <span className="block truncate text-xs text-slate-500 dark:text-slate-400">Control Center</span>
            </span>
          )}
        </Link>
      </div>

      <div className="p-3">
        {!collapsed ? (
          <label className="flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-slate-400">
            <Search className="size-4" />
            <input
              aria-label="Search master panel"
              placeholder="Search"
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-slate-400"
            />
            <Command className="size-3.5" />
          </label>
        ) : (
          <button disabled title="Expand sidebar to search" className="grid size-10 cursor-not-allowed place-items-center rounded-md border border-slate-200 text-slate-300 dark:border-white/[0.08] dark:text-slate-600">
            <Search className="size-4" />
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {navItems.map((item) => {
          const active = section === item.section;
          return (
            <a
              key={item.href}
              href={item.href}
              onClick={() => {
                setSection(item.section || "overview");
                setMobileOpen(false);
              }}
              className={cx(
                "flex h-10 items-center gap-3 rounded-md px-3 text-sm transition",
                active
                  ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
              )}
            >
              <item.icon className="size-4 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </a>
          );
        })}
      </nav>

      <div className="space-y-3 border-t border-slate-200 p-3 dark:border-white/[0.08]">
        {!collapsed && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-white/[0.08] dark:bg-white/[0.03]">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-400">System</span>
              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-300">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                Online
              </span>
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <Gauge className="size-3.5" />
              Runtime monitored
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700 dark:bg-white/[0.08] dark:text-slate-200">
            {(session?.user?.email?.[0] || "M").toUpperCase()}
          </span>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{session?.user?.email || "Master"}</p>
              <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{session?.user?.role || "ADMIN"}</p>
            </div>
          )}
        </div>

        <button
          onClick={() => setCollapsed((value) => !value)}
          className="flex h-9 w-full items-center justify-center gap-2 rounded-md border border-slate-200 text-xs text-slate-600 hover:bg-slate-50 dark:border-white/[0.08] dark:text-slate-400 dark:hover:bg-white/[0.04]"
        >
          {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
          {!collapsed && "Collapse"}
        </button>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950 dark:bg-[#0b0f17] dark:text-white">
      <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:block">{sidebar}</div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button className="absolute inset-0 bg-slate-950/60" onClick={() => setMobileOpen(false)} aria-label="Close sidebar" />
          <div className="relative h-full w-[288px]">{sidebar}</div>
        </div>
      )}

      <div className={cx("min-h-screen transition-[padding]", collapsed ? "lg:pl-[72px]" : "lg:pl-[264px]")}>
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur dark:border-white/[0.08] dark:bg-[#0b0f17]/90 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="grid size-9 place-items-center rounded-md border border-slate-200 text-slate-600 dark:border-white/[0.08] dark:text-slate-300 lg:hidden"
              aria-label="Open sidebar"
            >
              <Menu className="size-4" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span>Master</span>
                <ChevronRight className="size-3" />
                <span className="truncate">{current.label}</span>
              </div>
              <h1 className="truncate text-sm font-semibold sm:text-base">{current.label}</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label className="hidden h-9 w-[280px] items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-slate-400 md:flex">
              <Search className="size-4" />
              <input placeholder="Global search" className="min-w-0 flex-1 bg-transparent outline-none" />
            </label>
            <button disabled className="grid size-9 cursor-not-allowed place-items-center rounded-md border border-slate-200 text-slate-300 dark:border-white/[0.08] dark:text-slate-600" title="Notifications are not available in this release">
              <Bell className="size-4" />
            </button>
            <a href="/admin/master?section=runtime" className="hidden h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm text-slate-700 hover:bg-slate-50 dark:border-white/[0.08] dark:text-slate-300 dark:hover:bg-white/[0.04] sm:inline-flex">
              <Settings className="size-4" />
              Quick actions
            </a>
            <button
              onClick={() => signOut({ callbackUrl: "/master/login" })}
              className="grid size-9 place-items-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-white/[0.08] dark:text-slate-300 dark:hover:bg-white/[0.04]"
              title="Logout"
            >
              <LogOut className="size-4" />
            </button>
            <span className="hidden size-9 place-items-center rounded-full bg-slate-100 text-slate-700 dark:bg-white/[0.08] dark:text-slate-200 sm:grid">
              <User className="size-4" />
            </span>
          </div>
        </header>

        <div className="grid min-h-[calc(100vh-64px)] grid-cols-1 xl:grid-cols-[minmax(0,1fr)_280px]">
          <main className="min-w-0 p-4 sm:p-6">{children}</main>
          <aside className="hidden border-l border-slate-200 bg-white/40 p-4 dark:border-white/[0.08] dark:bg-white/[0.01] xl:block">
            <div className="sticky top-20 space-y-4">
              <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-white/[0.08] dark:bg-white/[0.03]">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Utility</p>
                <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">Provider checks, reloads, and diagnostics run from the active section.</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
