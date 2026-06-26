"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  Bot,
  MessageSquare,
  FolderKanban,
  LogOut,
  ChevronDown,
  CreditCard,
  Sparkles,
  Search,
  LayoutDashboard,
  KeyRound,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/workspace", label: "Workspaces", icon: FolderKanban },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/settings/tokens", label: "Tokens", icon: KeyRound },
  { href: "/settings/billing", label: "Billing", icon: CreditCard },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Header() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const logoutCallbackUrl = session?.user?.role === "OWNER" || pathname.startsWith("/admin")
    ? "/master/login"
    : "/login";

  if (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/master/login") ||
    pathname.startsWith("/chat") ||
    pathname.startsWith("/workspace") ||
    pathname.startsWith("/dashboard")
  ) return null;

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur-xl dark:border-white/10 dark:bg-black/85">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link href="/" className="mx-focus flex items-center gap-2.5 rounded-lg">
          <span className="relative grid size-8 place-items-center rounded-lg border border-slate-200 bg-slate-950 text-white shadow-sm dark:border-white/10 dark:bg-white dark:text-slate-950">
            <Bot className="size-4" />
          </span>
          <span className="hidden sm:block">
            <span className="block text-sm font-semibold tracking-tight text-slate-950 dark:text-white">Meldex AI</span>
          </span>
        </Link>

        {/* Desktop nav */}
        {session && (
          <nav className="hidden items-center gap-0.5 md:flex">
            {navItems.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={`${item.href}-${item.label}`}
                  href={item.href}
                  className={cn(
                    "mx-focus flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition",
                    active
                      ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950"
                      : "text-slate-500 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
                  )}
                >
                  <item.icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        )}

        {/* Right actions */}
        <div className="flex min-w-0 items-center gap-2">
          {session ? (
            <>
              {/* User pill */}
              <div className="hidden items-center gap-2 sm:flex">
                <div className="grid size-7 place-items-center rounded-full bg-slate-950 text-xs font-bold text-white dark:bg-white dark:text-slate-950">
                  {(session.user?.email?.[0] ?? "U").toUpperCase()}
                </div>
                <span className="max-w-[140px] truncate text-xs text-slate-400">
                  {session.user?.email}
                </span>
              </div>
              <button
                onClick={() => signOut({ callbackUrl: logoutCallbackUrl })}
                className="mx-focus flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 transition hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
              >
                <LogOut className="size-3.5" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="mx-focus rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10 sm:px-3"
              >
                Login
              </Link>
              <Link
                href="/register"
                className="mx-focus flex items-center gap-1.5 rounded-lg bg-slate-950 px-2.5 py-1.5 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200 sm:px-3"
              >
                <Sparkles className="size-3.5" />
                <span className="hidden sm:inline">Get Started</span>
              </Link>
            </>
          )}

          {/* Mobile hamburger */}
          {session && (
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="ml-1 grid size-8 place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-100 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/10 md:hidden"
              aria-label="Open navigation"
            >
              <ChevronDown className={cn("size-4 transition", mobileOpen && "rotate-180")} />
            </button>
          )}
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && session && (
        <div className="border-t border-slate-200 bg-white/95 px-4 pb-3 dark:border-white/10 dark:bg-slate-950/95 md:hidden">
          <div className="relative mb-2 pt-3">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none dark:border-white/10 dark:bg-white/[0.04]" placeholder="Search" />
          </div>
          <nav className="grid gap-0.5">
            {navItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={`${item.href}-${item.label}`}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition",
                    active ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950" : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10"
                  )}
                >
                  <item.icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </header>
  );
}
