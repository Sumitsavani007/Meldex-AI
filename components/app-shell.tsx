"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  ChevronRight,
  Clapperboard,
  CreditCard,
  FolderKanban,
  History,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Moon,
  Search,
  Settings,
  Sparkles,
  Sun,
  X,
} from "lucide-react";
import { NotificationBell } from "@/components/notification-bell";
import { useThemePreference } from "@/components/theme-provider";
import { logoutFromMeldex } from "@/lib/client-session";
import { cn } from "@/lib/utils";

export const appShellNav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/workspace", label: "Workspace", icon: FolderKanban },
  { href: "/studio", label: "AI Studio", icon: Clapperboard },
  { href: "/tasks", label: "History", icon: History },
  { href: "/models", label: "Models", icon: Bot },
  { href: "/billing", label: "Billing", icon: CreditCard },
  { href: "/settings", label: "Settings", icon: Settings },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === href;
  if (href === "/settings") return pathname === href || pathname.startsWith("/settings/");
  if (href === "/workspace") return pathname === href || pathname.startsWith("/workspace/");
  return pathname === href || pathname.startsWith(`${href}/`);
}

function ShellNav({
  expanded,
  onNavigate,
}: {
  expanded: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <nav className="space-y-1">
      {appShellNav.map((item) => {
        const active = isActivePath(pathname, item.href);
        return (
          <Link
            key={`${item.href}-${item.label}`}
            href={item.href}
            onClick={onNavigate}
            title={expanded ? undefined : item.label}
            className={cn(
              "mx-focus group flex h-10 items-center gap-3 rounded-xl px-3 text-[13px] font-medium transition",
              !expanded && "justify-center px-0",
              active
                ? "bg-violet-50 text-violet-700 shadow-[inset_0_0_0_1px_rgba(124,58,237,0.10)] dark:bg-white/12 dark:text-white"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300/85 dark:hover:bg-white/8 dark:hover:text-white",
            )}
          >
            <item.icon className={cn("size-4 shrink-0", active ? "text-violet-600 dark:text-violet-300" : "text-slate-400 group-hover:text-slate-700 dark:group-hover:text-white")} />
            {expanded && <span className="truncate">{item.label}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

function DesktopSidebar() {
  const [hovered, setHovered] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const expanded = hovered || !collapsed;

  useEffect(() => {
    const stored = localStorage.getItem("meldex:sidebarCollapsed");
    setCollapsed(stored === null ? true : stored === "true");
  }, []);

  return (
    <aside
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "hidden h-screen shrink-0 border-r border-slate-200 bg-white/95 p-3 text-slate-950 shadow-xl shadow-slate-950/5 backdrop-blur-xl transition-[width] duration-300 ease-out dark:border-white/10 dark:bg-[#0d0d0f]/95 dark:text-white lg:flex lg:flex-col",
        expanded ? "w-[232px]" : "w-[72px]",
      )}
    >
      <div className={cn("mb-4 flex h-10 shrink-0 items-center gap-3", !expanded && "justify-center")}>
        <Link href="/dashboard" className={cn("mx-focus flex min-w-0 items-center gap-3 rounded-xl", !expanded && "justify-center")}>
          <span className="grid size-9 place-items-center rounded-xl bg-violet-600 text-white shadow-sm shadow-violet-600/30">
            <Sparkles className="size-4" />
          </span>
          {expanded && <span className="truncate text-sm font-semibold tracking-[0.12em]">MELDEX AI</span>}
        </Link>
        {expanded && (
          <button
            onClick={() => {
              setCollapsed((current) => {
                const next = !current;
                localStorage.setItem("meldex:sidebarCollapsed", String(next));
                return next;
              });
            }}
            className="mx-focus ml-auto grid size-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-white/8 dark:hover:text-white"
            aria-label={collapsed ? "Pin sidebar open" : "Collapse sidebar"}
            title={collapsed ? "Pin sidebar open" : "Collapse sidebar"}
          >
            <ChevronRight className={cn("size-4 transition", !collapsed && "rotate-180")} />
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <ShellNav expanded={expanded} />
      </div>
    </aside>
  );
}

function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
      <button className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm" onClick={onClose} aria-label="Close navigation" />
      <aside className="relative h-full w-[280px] max-w-[86vw] border-r border-slate-200 bg-white p-4 shadow-2xl dark:border-white/10 dark:bg-[#0d0d0f]">
        <div className="mb-5 flex items-center justify-between">
          <Link href="/dashboard" onClick={onClose} className="flex items-center gap-3 font-semibold">
            <span className="grid size-9 place-items-center rounded-xl bg-violet-600 text-white"><Sparkles className="size-4" /></span>
            Meldex AI
          </Link>
          <button onClick={onClose} className="mx-focus grid size-9 place-items-center rounded-xl border border-slate-200 dark:border-white/10" aria-label="Close navigation">
            <X className="size-4" />
          </button>
        </div>
        <ShellNav expanded onNavigate={onClose} />
      </aside>
    </div>
  );
}

export function AppShell({
  title,
  description,
  breadcrumb,
  children,
  rightRail,
  fullBleed = false,
}: {
  title: string;
  description?: string;
  breadcrumb?: string;
  children: React.ReactNode;
  rightRail?: React.ReactNode;
  fullBleed?: boolean;
}) {
  const { data: session } = useSession({ required: true });
  const { theme, setTheme } = useThemePreference();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [planName, setPlanName] = useState("Plan");
  const [remainingCredits, setRemainingCredits] = useState<number | null>(null);
  const initials = (session?.user?.name?.[0] || session?.user?.email?.[0] || "U").toUpperCase();

  useEffect(() => {
    fetch("/api/usage", { cache: "no-store" })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        setPlanName(data?.usage?.plan?.name || "Plan");
        setRemainingCredits(typeof data?.usage?.balance?.totalRemaining === "number" ? data.usage.balance.totalRemaining : null);
      })
      .catch(() => undefined);
  }, []);

  const providerStatus = useMemo(() => ({ label: "Providers", status: "Ready" }), []);

  return (
    <div className="min-h-screen bg-[#f7f7fb] text-slate-950 dark:bg-[#0d0d0f] dark:text-white">
      <MobileDrawer open={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="flex min-h-screen">
        <DesktopSidebar />
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 border-b border-slate-200 bg-[#f7f7fb]/92 px-4 py-3 backdrop-blur-xl dark:border-white/10 dark:bg-[#0d0d0f]/92 sm:px-6 lg:px-8">
            <div className="mx-auto flex max-w-[1440px] items-center gap-3">
              <button onClick={() => setMobileOpen(true)} className="mx-focus grid size-10 place-items-center rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.04] lg:hidden" aria-label="Open navigation">
                <Menu className="size-4" />
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <p className="truncate text-sm font-semibold">{title}</p>
                  {breadcrumb && <span className="hidden truncate text-xs text-slate-500 dark:text-slate-400 sm:inline">/ {breadcrumb}</span>}
                </div>
                {description && <p className="mt-0.5 hidden truncate text-xs text-slate-500 dark:text-slate-400 sm:block">{description}</p>}
              </div>
              <label className="hidden h-10 w-full max-w-[280px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-500 shadow-sm dark:border-white/10 dark:bg-white/[0.04] xl:flex">
                <Search className="size-4" />
                <input className="min-w-0 flex-1 appearance-none border-0 bg-transparent p-0 outline-none ring-0 placeholder:text-slate-400 focus:border-0 focus:outline-none focus:ring-0" placeholder="Search Meldex..." />
              </label>
              <div className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300 md:flex">
                <span className="size-2 rounded-full bg-emerald-500" />
                {providerStatus.label}: {providerStatus.status}
              </div>
              <Link href="/billing" className="hidden rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200 md:block">
                {remainingCredits === null ? planName : `${remainingCredits.toLocaleString()} credits`}
              </Link>
              <button
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="mx-focus grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:bg-white/[0.08]"
                title="Toggle theme"
                aria-label="Toggle theme"
              >
                {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              </button>
              <NotificationBell />
              <div className="group relative">
                <button className="mx-focus grid size-10 place-items-center rounded-full bg-violet-600 text-sm font-semibold text-white shadow-sm shadow-violet-600/20" aria-label="Account menu">
                  {initials}
                </button>
                <div className="invisible absolute right-0 top-12 w-56 rounded-2xl border border-slate-200 bg-white p-2 opacity-0 shadow-2xl shadow-slate-950/10 transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100 dark:border-white/10 dark:bg-[#111113]">
                  <Link href="/settings/profile" className="block rounded-xl px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-white/8">{session?.user?.email}</Link>
                  <button onClick={() => void logoutFromMeldex("/login")} className="mx-focus mt-1 w-full rounded-xl px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-500/10">Logout</button>
                </div>
              </div>
            </div>
          </header>
          <main className={cn("mx-auto min-w-0", fullBleed ? "max-w-none" : "max-w-[1440px] px-4 py-4 sm:px-6 lg:px-8")}>
            {fullBleed ? children : (
              <div className={cn("grid gap-5", rightRail ? "xl:grid-cols-[minmax(0,1fr)_320px]" : "")}>
                <section className="min-w-0">{children}</section>
                {rightRail && <aside className="min-w-0">{rightRail}</aside>}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
