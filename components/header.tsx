"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  Bot, LayoutDashboard, MessageSquare, Settings, TerminalSquare,
  LogOut, User, Shield, ChevronDown, Zap
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/chat", label: "AI Chat", icon: MessageSquare },
  { href: "/workspace", label: "Workspace", icon: TerminalSquare },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Header() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isAdmin = session?.user?.role === "ADMIN" || session?.user?.role === "OWNER";
  const logoutCallbackUrl = session?.user?.role === "OWNER" || pathname.startsWith("/admin")
    ? "/master/login"
    : "/login";

  if (pathname.startsWith("/admin") || pathname.startsWith("/master/login") || pathname.startsWith("/chat")) {
    return null;
  }

  return (
    <header className="sticky top-0 z-30 border-b border-white/8 bg-ink/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5">
          <span className="relative grid size-8 place-items-center rounded-lg border border-mint/30 bg-gradient-to-br from-mint/20 to-iris/10">
            <Bot className="size-4 text-mint" />
            <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-mint shadow-[0_0_6px_rgba(99,242,190,0.8)]" />
          </span>
          <span className="hidden sm:block">
            <span className="block text-sm font-bold tracking-tight text-white">Meldex AI</span>
            <span className="block text-[10px] text-slate-500">Plan. Build. Deploy.</span>
          </span>
        </Link>

        {/* Desktop nav */}
        {session && (
          <nav className="hidden items-center gap-0.5 md:flex">
            {navItems.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition",
                    active
                      ? "bg-mint/10 text-mint"
                      : "text-slate-400 hover:bg-white/6 hover:text-slate-200"
                  )}
                >
                  <item.icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
            {isAdmin && (
              <Link
                href="/admin"
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition",
                  pathname.startsWith("/admin")
                    ? "bg-ember/10 text-ember"
                    : "text-slate-400 hover:bg-white/6 hover:text-slate-200"
                )}
              >
                <Shield className="size-4" />
                Admin
              </Link>
            )}
          </nav>
        )}

        {/* Right actions */}
        <div className="flex items-center gap-2">
          {session ? (
            <>
              {/* User pill */}
              <div className="hidden items-center gap-2 sm:flex">
                <div className="grid size-7 place-items-center rounded-full bg-iris/20 text-xs font-bold text-iris">
                  {(session.user?.email?.[0] ?? "U").toUpperCase()}
                </div>
                <span className="max-w-[140px] truncate text-xs text-slate-400">
                  {session.user?.email}
                </span>
              </div>
              <button
                onClick={() => signOut({ callbackUrl: logoutCallbackUrl })}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-slate-300 transition hover:border-white/20 hover:bg-white/6"
              >
                <LogOut className="size-3.5" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-slate-300 transition hover:bg-white/6"
              >
                Login
              </Link>
              <Link
                href="/register"
                className="flex items-center gap-1.5 rounded-lg bg-mint px-3 py-1.5 text-sm font-semibold text-slate-950 transition hover:bg-mint/90"
              >
                <Zap className="size-3.5" />
                Get Started
              </Link>
            </>
          )}

          {/* Mobile hamburger */}
          {session && (
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="ml-1 grid size-8 place-items-center rounded-lg border border-white/10 text-slate-400 transition hover:bg-white/6 md:hidden"
            >
              <ChevronDown className={cn("size-4 transition", mobileOpen && "rotate-180")} />
            </button>
          )}
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && session && (
        <div className="border-t border-white/8 bg-ink/95 px-4 pb-3 md:hidden">
          <nav className="grid gap-0.5 pt-2">
            {navItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition",
                    active ? "bg-mint/10 text-mint" : "text-slate-400 hover:bg-white/6"
                  )}
                >
                  <item.icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
            {isAdmin && (
              <Link
                href="/admin"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-400 hover:bg-white/6"
              >
                <Shield className="size-4" />
                Admin
              </Link>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
