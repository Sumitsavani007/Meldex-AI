"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { Bot, Github, LayoutDashboard, MessageSquare, Settings, TerminalSquare, LogOut, User } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/chat", label: "AI Chat", icon: MessageSquare },
  { href: "/workspace", label: "Workspace", icon: TerminalSquare },
  { href: "/settings", label: "Settings", icon: Settings }
];

export function Header() {
  const { data: session } = useSession();

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-ink/84 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-md border border-mint/25 bg-mint/10 shadow-glow">
            <Bot className="size-5 text-mint" />
          </span>
          <span>
            <span className="block text-sm font-semibold tracking-wide text-white">Meldex AI</span>
            <span className="block text-xs text-slate-400">Plan. Build. Deploy.</span>
          </span>
        </Link>

        {session && (
          <nav className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-300 transition hover:bg-white/7 hover:text-white"
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            ))}
          </nav>
        )}

        <div className="flex items-center gap-2">
          {session ? (
            <>
              <div className="hidden items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-300 sm:flex">
                <User className="size-4" />
                {session.user?.email}
              </div>
              <button
                onClick={() => signOut()}
                className="flex items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/7"
              >
                <LogOut className="size-4" />
                Logout
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className={cn(
                  "hidden items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/7 sm:flex"
                )}
              >
                <Github className="size-4" />
                Login
              </Link>
              <Link
                href="/register"
                className="rounded-md bg-mint px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-mint/90"
              >
                Sign Up
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
