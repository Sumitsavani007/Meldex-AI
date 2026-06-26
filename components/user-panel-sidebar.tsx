"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  Bot,
  Box,
  ChevronRight,
  FileText,
  FolderKanban,
  HelpCircle,
  KeyRound,
  LayoutDashboard,
  MessageSquare,
  Plug,
  Settings,
  Sparkles,
  Workflow,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/workspace", label: "Workspaces", icon: FolderKanban },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/agents", label: "Agents", icon: Workflow },
  { href: "/templates", label: "Templates", icon: Box },
  { href: "/files", label: "Files", icon: FileText },
  { href: "/tasks", label: "Tasks", icon: Sparkles },
  { href: "/models", label: "Models", icon: Bot },
];

const toolItems = [
  { href: "/integrations", label: "Integrations", icon: Plug },
  { href: "/settings/tokens", label: "API Tokens", icon: KeyRound },
  { href: "/settings", label: "Settings", icon: Settings },
];

function activeFor(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === href;
  if (href === "/workspace") return pathname === href || pathname.startsWith("/workspace/");
  if (href === "/settings") return pathname === href || pathname.startsWith("/settings/");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function UserPanelSidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const initials = (session?.user?.name?.[0] || session?.user?.email?.[0] || "U").toUpperCase();

  return (
    <aside className="hidden h-screen w-[232px] shrink-0 border-r border-slate-200 bg-white p-3 text-slate-950 shadow-xl shadow-slate-950/5 dark:border-white/10 dark:bg-[#0d1526] dark:text-white lg:flex lg:flex-col">
      <Link href="/dashboard" className="mx-focus mb-4 flex shrink-0 items-center gap-3 rounded-lg px-1">
        <span className="grid size-8 place-items-center rounded-lg bg-violet-500 text-white shadow-sm shadow-violet-500/30">
          <Bot className="size-4" />
        </span>
        <span className="text-sm font-semibold tracking-[0.12em]">MELDEX</span>
      </Link>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <nav className="space-y-1">
          {navItems.map((item) => {
            const active = activeFor(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "mx-focus flex h-9 items-center gap-3 rounded-lg px-3 text-[13px] font-medium transition",
                  active
                    ? "bg-violet-50 text-violet-700 shadow-[inset_0_0_0_1px_rgba(124,58,237,0.08)] dark:bg-white/12 dark:text-white"
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
            {toolItems.map((item) => {
              const active = activeFor(pathname, item.href);
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
                <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">Pro Plan</p>
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
  );
}
