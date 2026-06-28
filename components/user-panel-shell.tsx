"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import {
  Bot,
  Box,
  ChevronRight,
  Clapperboard,
  FileText,
  FolderKanban,
  HelpCircle,
  KeyRound,
  LayoutDashboard,
  MessageSquare,
  Moon,
  Plug,
  Search,
  Settings,
  Sparkles,
  Sun,
  Workflow,
} from "lucide-react";
import { useThemePreference } from "@/components/theme-provider";
import { NotificationBell } from "@/components/notification-bell";
import { cn } from "@/lib/utils";

export const userPanelNav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/workspace", label: "Workspaces", icon: FolderKanban },
  { href: "/studio", label: "AI Studio", icon: Clapperboard },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/agents", label: "Agents", icon: Workflow },
  { href: "/templates", label: "Templates", icon: Box },
  { href: "/files", label: "Files", icon: FileText },
  { href: "/tasks", label: "Tasks", icon: Sparkles },
  { href: "/models", label: "Models", icon: Bot },
];

export const userPanelTools = [
  { href: "/integrations", label: "Integrations", icon: Plug },
  { href: "/settings/tokens", label: "API Tokens", icon: KeyRound },
  { href: "/settings", label: "Settings", icon: Settings },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === href;
  if (href === "/settings") return pathname === href || pathname.startsWith("/settings/");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function UserPanelShell({
  title,
  description,
  eyebrow = "Meldex",
  children,
  rightRail,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  children: React.ReactNode;
  rightRail?: React.ReactNode;
}) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { theme, setTheme } = useThemePreference();
  const initials = (session?.user?.name?.[0] || session?.user?.email?.[0] || "U").toUpperCase();
  const [planName, setPlanName] = useState("Plan");

  useEffect(() => {
    fetch("/api/usage", { cache: "no-store" })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => setPlanName(data?.usage?.plan?.name || "Plan"))
      .catch(() => undefined);
  }, []);

  return (
    <div className="min-h-screen bg-[#f7f7fb] text-slate-950 dark:bg-[#0d0d0f] dark:text-white">
      <div className="flex min-h-screen">
        <aside className="hidden h-screen w-[232px] shrink-0 border-r border-slate-200 bg-white p-3 text-slate-950 shadow-xl shadow-slate-950/5 dark:border-white/10 dark:bg-[#0d1526] dark:text-white lg:flex lg:flex-col">
          <Link href="/dashboard" className="mx-focus mb-4 flex shrink-0 items-center gap-3 rounded-lg px-1">
            <span className="grid size-8 place-items-center rounded-lg bg-violet-500 text-white shadow-sm shadow-violet-500/30">
              <Bot className="size-4" />
            </span>
            <span className="text-sm font-semibold tracking-[0.12em]">MELDEX</span>
          </Link>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <nav className="space-y-1">
            {userPanelNav.map((item) => {
              const active = isActivePath(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "mx-focus flex h-9 items-center gap-3 rounded-lg px-3 text-[13px] font-medium transition",
                    active
                      ? "bg-violet-50 text-violet-700 shadow-[inset_0_0_0_1px_rgba(124,58,237,0.08)] dark:bg-white/12 dark:text-white dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300/85 dark:hover:bg-white/8 dark:hover:text-white",
                  )}
                >
                  <item.icon className={cn("size-4", active ? "text-violet-600 dark:text-violet-300" : "text-slate-400")} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-5">
            <p className="mb-2 px-3 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">Tools</p>
            <nav className="space-y-1">
              {userPanelTools.map((item) => {
                const active = isActivePath(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "mx-focus flex h-9 items-center gap-3 rounded-lg px-3 text-[13px] font-medium transition",
                      active
                        ? "bg-violet-50 text-violet-700 dark:bg-white/12 dark:text-white"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300/85 dark:hover:bg-white/8 dark:hover:text-white",
                    )}
                  >
                    <item.icon className={cn("size-4", active ? "text-violet-600 dark:text-violet-300" : "text-slate-400")} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          </div>

          <div className="shrink-0 space-y-2 pt-3">
            <Link href="/settings" className="mx-focus flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300/85 dark:hover:bg-white/8 dark:hover:text-white">
              <HelpCircle className="size-4 text-slate-400" />
              Help & Docs
            </Link>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-2 dark:border-white/10 dark:bg-white/6">
              <div className="flex items-center gap-2">
                <Link href="/settings/profile" className="mx-focus flex min-w-0 flex-1 items-center gap-2 rounded-lg">
                  <span className="grid size-9 place-items-center rounded-full bg-violet-600 text-xs font-semibold text-white dark:bg-white/12">
                    {initials}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold">{session?.user?.name || "Meldex User"}</p>
                    <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{planName}</p>
                  </div>
                </Link>
                <button
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="mx-focus rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-950 dark:hover:bg-white/8 dark:hover:text-white"
                  title="Logout"
                  aria-label="Logout"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 border-b border-slate-200 bg-[#f7f7fb]/92 px-4 py-3 backdrop-blur-xl dark:border-white/10 dark:bg-[#0d0d0f]/92 sm:px-6 lg:px-8">
            <div className="mx-auto flex max-w-[1440px] items-center gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="grid size-6 place-items-center rounded-md bg-violet-600 text-[11px] font-semibold text-white">01</span>
                  <p className="truncate text-sm font-semibold">{eyebrow}</p>
                </div>
              </div>
              <label className="hidden h-10 w-full max-w-[360px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-500 shadow-sm dark:border-white/10 dark:bg-white/[0.04] md:flex">
                <Search className="size-4" />
                <input className="min-w-0 flex-1 appearance-none border-0 bg-transparent p-0 outline-none ring-0 placeholder:text-slate-400 focus:border-0 focus:outline-none focus:ring-0 focus-visible:outline-none" placeholder="Search anything..." />
                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500 dark:bg-white/10">⌘ K</span>
              </label>
              <button
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="mx-focus grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:bg-white/[0.08]"
                title="Toggle theme"
                aria-label="Toggle theme"
              >
                {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              </button>
              <NotificationBell />
              <Link href="/settings/profile" className="mx-focus grid size-10 place-items-center rounded-full bg-violet-600 text-sm font-semibold text-white shadow-sm shadow-violet-600/20">
                {initials}
              </Link>
            </div>
          </header>

          <main className="mx-auto max-w-[1440px] px-4 py-4 sm:px-6 lg:px-8">
            <div className={cn("grid gap-5", rightRail ? "xl:grid-cols-[minmax(0,1fr)_320px]" : "")}>
              <section className="min-w-0">
                <div className="mb-4">
                  <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
                  {description && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>}
                </div>
                {children}
              </section>
              {rightRail && <aside className="min-w-0">{rightRail}</aside>}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

export function PanelCard({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition dark:border-white/10 dark:bg-[#111113]", className)}>
      {children}
    </div>
  );
}

export function SoftButton({
  children,
  variant = "secondary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  return (
    <button
      {...props}
      className={cn(
        "mx-focus inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45",
        variant === "primary" && "bg-violet-600 text-white shadow-sm shadow-violet-600/20 hover:bg-violet-700",
        variant === "secondary" && "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200 dark:hover:bg-white/[0.08]",
        variant === "ghost" && "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.08]",
        variant === "danger" && "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-400/20 dark:bg-red-500/10 dark:text-red-200",
        className,
      )}
    >
      {children}
    </button>
  );
}
