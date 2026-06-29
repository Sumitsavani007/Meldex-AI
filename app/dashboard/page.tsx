"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Bot,
  Box,
  Clapperboard,
  CheckCircle2,
  Files,
  FolderKanban,
  KeyRound,
  LayoutDashboard,
  MessageSquare,
  Moon,
  Plus,
  Search,
  Sparkles,
  Sun,
  WalletCards,
  Workflow,
} from "lucide-react";
import { useThemePreference } from "@/components/theme-provider";
import { NotificationBell } from "@/components/notification-bell";
import { UserPanelSidebar } from "@/components/user-panel-sidebar";
import { cn } from "@/lib/utils";

type Project = {
  id: string;
  name: string;
  status: string;
  qualityScore: number;
  lastPreviewUrl?: string | null;
  updatedAt: string;
  _count?: { files?: number; tasks?: number };
  previews?: Array<{ verified: boolean; url: string }>;
};

const primaryNav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/workspace", label: "Workspaces", icon: FolderKanban },
  { href: "/studio", label: "AI Studio", icon: Clapperboard },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/agents", label: "Agents", icon: Workflow },
  { href: "/templates", label: "Templates", icon: Box },
  { href: "/files", label: "Files", icon: Files },
  { href: "/tasks", label: "Tasks", icon: Sparkles },
  { href: "/models", label: "Models", icon: Bot },
];

const quickActions = [
  { href: "/workspace", label: "Create workspace", icon: FolderKanban },
  { href: "/chat", label: "Start new chat", icon: MessageSquare },
  { href: "/settings/tokens", label: "Manage API tokens", icon: KeyRound },
  { href: "/settings/billing", label: "Billing", icon: WalletCards },
];

function timeAgo(value?: string) {
  if (!value) return "recently";
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.floor(diffMs / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="grid grid-cols-4 gap-1 border-t border-slate-200 bg-white/95 p-2 backdrop-blur dark:border-white/10 dark:bg-[#0d0d0d]/95 lg:hidden">
      {primaryNav.slice(0, 4).map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "mx-focus flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-[11px]",
              active ? "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200" : "text-slate-500 dark:text-slate-400",
            )}
          >
            <item.icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export default function DashboardPage() {
  const { data: session, status } = useSession({ required: true });
  const router = useRouter();
  const { theme, setTheme } = useThemePreference();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");
  const [idea, setIdea] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (status !== "authenticated") return;
    let mounted = true;
    setLoading(true);
    fetch("/api/workspaces", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load workspaces");
        if (mounted) setProjects(data.projects || []);
      })
      .catch((error) => {
        if (mounted) setMessage(error instanceof Error ? error.message : "Unable to load workspaces");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [status]);

  const stats = useMemo(() => {
    const tasks = projects.reduce((sum, project) => sum + (project._count?.tasks ?? 0), 0);
    const files = projects.reduce((sum, project) => sum + (project._count?.files ?? 0), 0);
    const previews = projects.filter((project) => project.lastPreviewUrl || project.previews?.some((preview) => preview.verified)).length;
    return { tasks, files, previews };
  }, [projects]);

  const firstName = session?.user?.name?.split(" ")[0] || session?.user?.email?.split("@")[0] || "there";
  const filteredProjects = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return projects;
    return projects.filter((project) => project.name.toLowerCase().includes(term) || project.status.toLowerCase().includes(term));
  }, [projects, search]);
  const recentProjects = filteredProjects.slice(0, 4);

  async function createWorkspaceFromDashboard(seed = idea) {
    setCreating(true);
    setMessage("");
    try {
      const name = seed.trim() || "Create a landing page";
      const response = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to create workspace");
      router.push(`/workspace/${data.project.id}/ide`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create workspace");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f8f7fb] text-slate-950 dark:bg-[#0d0d0f] dark:text-white">
      <div className="flex min-h-screen">
        <UserPanelSidebar />

        <div className="min-w-0 flex-1 pb-20 lg:pb-0">
          <header className="sticky top-0 z-20 border-b border-slate-200 bg-[#f8f7fb]/90 px-4 py-3 backdrop-blur-xl dark:border-white/10 dark:bg-[#0d0d0f]/90 sm:px-6 lg:px-8">
            <div className="mx-auto flex max-w-7xl items-center gap-4">
              <div className="lg:hidden">
                <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
                  <span className="grid size-8 place-items-center rounded-lg bg-violet-600 text-white"><Bot className="size-4" /></span>
                  Meldex
                </Link>
              </div>
              <h1 className="hidden text-2xl font-semibold tracking-tight lg:block">Dashboard</h1>
              <label className="ml-auto hidden h-10 w-full max-w-sm items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-500 shadow-sm dark:border-white/10 dark:bg-white/[0.04] md:flex">
                <Search className="size-4" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} className="min-w-0 flex-1 appearance-none border-0 bg-transparent p-0 outline-none ring-0 placeholder:text-slate-400 focus:border-0 focus:outline-none focus:ring-0 focus-visible:outline-none" placeholder="Search workspaces..." />
                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500 dark:bg-white/10">⌘ K</span>
              </label>
              <button
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="mx-focus grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:bg-white/[0.08]"
                aria-label="Toggle theme"
                title="Toggle theme"
              >
                {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              </button>
              <NotificationBell />
              <Link href="/settings/profile" className="mx-focus hidden size-10 place-items-center rounded-full bg-violet-600 text-sm font-semibold text-white shadow-sm shadow-violet-600/20 sm:grid">
                {(session?.user?.name?.[0] || session?.user?.email?.[0] || "U").toUpperCase()}
              </Link>
            </div>
          </header>

          <main className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
              <section className="rounded-2xl border border-violet-100 bg-gradient-to-br from-white via-violet-50 to-white p-4 shadow-sm dark:border-violet-400/10 dark:from-white/[0.06] dark:via-violet-500/10 dark:to-white/[0.03]">
                <div className="max-w-3xl">
                  <p className="text-2xl font-semibold tracking-tight">Good morning, {firstName}</p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">What do you want to build today?</p>
                </div>
                <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-[#111113]">
                  <textarea
                    value={idea}
                    onChange={(event) => setIdea(event.target.value)}
                    rows={2}
                    className="min-h-14 w-full resize-none bg-transparent px-1 text-sm outline-none placeholder:text-slate-400 dark:text-white"
                    placeholder="Describe your idea or task..."
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button onClick={() => void createWorkspaceFromDashboard()} disabled={creating} className="mx-focus inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/[0.06]">
                      <Plus className="size-3.5" /> {creating ? "Creating" : "Create Workspace"}
                    </button>
                    <Link href="/chat" className="mx-focus inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/[0.06]">
                      <Bot className="size-3.5" /> Ask AI
                    </Link>
                    <Link href="/templates" className="mx-focus inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/[0.06]">
                      <Box className="size-3.5" /> Browse Templates
                    </Link>
                    <button disabled title="Repository import is not available in this release" className="mx-focus inline-flex h-9 cursor-not-allowed items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-400 opacity-70 dark:border-white/10 dark:text-slate-500">
                      <FolderKanban className="size-3.5" /> Import Repository
                    </button>
                    <button
                      onClick={() => void createWorkspaceFromDashboard()}
                      disabled={creating}
                      className="mx-focus ml-auto grid size-10 place-items-center rounded-xl bg-violet-600 text-white shadow-sm shadow-violet-600/20 transition hover:bg-violet-700"
                      aria-label="Open workspace"
                    >
                      <ArrowRight className="size-4" />
                    </button>
                  </div>
                </div>
              </section>

              <aside className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-[#111113]">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold">Overview</h2>
                  <span className="text-xs text-slate-500">Live</span>
                </div>
                <div className="space-y-2">
                  {[
                    { label: "Workspaces", value: projects.length, icon: FolderKanban, tone: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200" },
                    { label: "Tasks completed", value: stats.tasks, icon: CheckCircle2, tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200" },
                    { label: "Files created", value: stats.files, icon: Files, tone: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200" },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center gap-3 rounded-xl border border-slate-100 p-2.5 dark:border-white/8">
                      <span className={cn("grid size-9 place-items-center rounded-xl", item.tone)}>
                        <item.icon className="size-4" />
                      </span>
                      <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{item.label}</p>
                        <p className="text-base font-semibold">{item.value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </aside>
            </div>

            {message && (
              <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">
                {message}
              </div>
            )}

            <section className="mt-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">Recent Workspaces</h2>
                <Link href="/workspace" className="mx-focus rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200 dark:hover:bg-white/[0.08]">View all</Link>
              </div>
              {loading ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {[0, 1, 2, 3].map((item) => <div key={item} className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.04]" />)}
                </div>
              ) : recentProjects.length ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {recentProjects.map((project) => (
                    <Link key={project.id} href={`/workspace/${project.id}/ide`} className="mx-focus group rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-md dark:border-white/10 dark:bg-[#111113] dark:hover:border-violet-400/25">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 truncate text-sm font-semibold">
                            <span className="size-2 rounded-full bg-emerald-500" />
                            {project.name}
                          </p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{project.status} · {timeAgo(project.updatedAt)}</p>
                        </div>
                        <ArrowRight className="size-4 shrink-0 text-slate-300 transition group-hover:text-violet-600" />
                      </div>
                      <div className="mt-3 rounded-xl border border-slate-100 bg-gradient-to-br from-slate-50 to-violet-50 p-2 dark:border-white/8 dark:from-white/[0.05] dark:to-violet-500/10">
                        <div className="h-9 rounded-lg bg-white shadow-sm dark:bg-black/30" />
                        <div className="mt-2 grid grid-cols-3 gap-1">
                          <span className="h-1.5 rounded-full bg-violet-200 dark:bg-violet-400/30" />
                          <span className="h-1.5 rounded-full bg-slate-200 dark:bg-white/10" />
                          <span className="h-1.5 rounded-full bg-slate-200 dark:bg-white/10" />
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-white/15 dark:bg-[#111113]">
                  <Sparkles className="mx-auto size-6 text-violet-600" />
                  <p className="mt-3 text-sm font-semibold">No workspaces yet</p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Create your first workspace to see it here.</p>
                  <Link href="/workspace" className="mx-focus mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700">
                    <Plus className="size-4" /> Create workspace
                  </Link>
                </div>
              )}
            </section>

            <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
              <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-[#111113]">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold">Recent Activity</h2>
                  <span className="text-xs text-slate-500">{recentProjects.length} updates</span>
                </div>
                <div className="space-y-1">
                  {recentProjects.length ? recentProjects.map((project) => (
                    <Link key={project.id} href={`/workspace/${project.id}/ide`} className="mx-focus flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-slate-50 dark:hover:bg-white/[0.05]">
                      <span className="grid size-8 place-items-center rounded-lg bg-slate-100 text-slate-600 dark:bg-white/[0.06] dark:text-slate-300">
                        <FolderKanban className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">Workspace {project.name} was updated</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{timeAgo(project.updatedAt)}</p>
                      </div>
                    </Link>
                  )) : (
                    <p className="rounded-xl bg-slate-50 px-3 py-4 text-sm text-slate-500 dark:bg-white/[0.04] dark:text-slate-400">Activity appears after you create or run a workspace.</p>
                  )}
                </div>
              </section>

              <aside className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-[#111113]">
                <h2 className="mb-3 text-sm font-semibold">Quick Actions</h2>
                <div className="space-y-1">
                  {quickActions.map((action) => (
                    <Link key={action.href} href={action.href} className="mx-focus flex items-center gap-3 rounded-xl px-2 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/[0.05]">
                      <action.icon className="size-4 text-slate-500 dark:text-slate-400" />
                      <span className="flex-1">{action.label}</span>
                      <ArrowRight className="size-4 text-slate-300" />
                    </Link>
                  ))}
                </div>
              </aside>
            </div>
          </main>
        </div>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-30 lg:hidden">
        <MobileNav />
      </div>
    </div>
  );
}
