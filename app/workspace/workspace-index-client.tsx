"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Archive,
  Bot,
  Clock3,
  Copy,
  ExternalLink,
  LayoutDashboard,
  Loader2,
  MessageSquare,
  Plus,
  Settings,
  Sparkles,
  Trash2,
  WalletCards,
  Code2,
} from "lucide-react";

type ProjectCardData = {
  id: string;
  name: string;
  status: string;
  qualityScore: number;
  lastPreviewUrl?: string | null;
  updatedAt: string;
  _count?: { files?: number; tasks?: number };
  previews?: Array<{ verified: boolean; url: string }>;
};

const quickPrompts = [
  "Create a landing page",
  "Build a SaaS dashboard",
  "Make a portfolio site",
  "Add a pricing page",
  "Create a contact form",
  "Build an ecommerce homepage",
];

const navItems = [
  ["Dashboard", "/dashboard", LayoutDashboard],
  ["Workspaces", "/workspace", Bot],
  ["Chat", "/chat", MessageSquare],
  ["Tokens", "/settings/tokens", Code2],
  ["Billing", "/settings/billing", WalletCards],
  ["Settings", "/settings", Settings],
] as const;

function WorkspaceTopbar({ status }: { status: string }) {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur-xl dark:border-white/10 dark:bg-[#0d0d0f]/90">
      <div className="flex h-16 items-center gap-3 px-4 lg:px-6">
        <Link href="/dashboard" className="flex items-center gap-2 rounded-md font-semibold">
          <span className="grid size-9 place-items-center rounded-xl bg-violet-600 text-xs text-white shadow-sm shadow-violet-600/20">M</span>
          <span>Meldex AI</span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex" aria-label="User navigation">
          {navItems.map(([label, href, Icon]) => (
            <Link key={label} href={href} className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition ${label === "Workspaces" ? "bg-violet-600 text-white shadow-sm shadow-violet-600/20" : "text-slate-500 hover:bg-slate-100 hover:text-slate-950 dark:hover:bg-white/8 dark:hover:text-white"}`}>
              <Icon className="size-3.5" aria-hidden="true" /> {label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600 dark:border-white/10 dark:bg-white/8 dark:text-slate-300">{status}</div>
      </div>
    </header>
  );
}

function WorkspaceProjectCard({
  project,
  onArchive,
  onDelete,
}: {
  project: ProjectCardData;
  onArchive: (project: ProjectCardData) => void;
  onDelete: (project: ProjectCardData) => void;
}) {
  const files = project._count?.files ?? 0;
  const tasks = project._count?.tasks ?? 0;
  const previewReady = Boolean(project.lastPreviewUrl || project.previews?.[0]?.verified);
  return (
    <article className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-zinc-950">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{project.name}</h2>
          <p className="mt-1 text-xs text-zinc-500">Updated {new Date(project.updatedAt).toLocaleString()}</p>
        </div>
        <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-600 dark:bg-white/8 dark:text-zinc-300">{project.status}</span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-md bg-zinc-50 p-2 dark:bg-white/5"><div className="text-zinc-500">Files</div><div className="font-semibold">{files}</div></div>
        <div className="rounded-md bg-zinc-50 p-2 dark:bg-white/5"><div className="text-zinc-500">Tasks</div><div className="font-semibold">{tasks}</div></div>
        <div className="rounded-md bg-zinc-50 p-2 dark:bg-white/5"><div className="text-zinc-500">Preview</div><div className="font-semibold">{previewReady ? "Ready" : "None"}</div></div>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <Link href={`/workspace/${project.id}`} className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-zinc-950 px-3 py-2 text-xs font-semibold text-white dark:bg-white dark:text-zinc-950">
          Open <ExternalLink className="size-3.5" />
        </Link>
        <button disabled className="cursor-not-allowed rounded-md border border-zinc-200 p-2 text-zinc-300 dark:border-white/10 dark:text-zinc-600" title="Duplicate workspace is not available in V1" aria-label="Duplicate workspace disabled">
          <Copy className="size-3.5" />
        </button>
        <button onClick={() => onArchive(project)} className="rounded-md border border-zinc-200 p-2 text-zinc-500 hover:bg-zinc-50 dark:border-white/10 dark:hover:bg-white/8" title="Archive workspace" aria-label="Archive workspace">
          <Archive className="size-3.5" />
        </button>
        <button onClick={() => onDelete(project)} className="rounded-md border border-zinc-200 p-2 text-red-500 hover:bg-red-50 dark:border-white/10 dark:hover:bg-red-500/10" title="Delete workspace" aria-label="Delete workspace">
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </article>
  );
}

function WorkspaceEmptyState({ onCreate, loading }: { onCreate: (prompt: string) => void; loading: boolean }) {
  const [prompt, setPrompt] = useState("Create a landing page");
  return (
    <section className="mx-auto flex min-h-[420px] max-w-3xl flex-col items-center justify-center px-4 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-zinc-950 text-white dark:bg-white dark:text-zinc-950">
        <Sparkles className="size-5" aria-hidden="true" />
      </div>
      <h1 className="text-3xl font-semibold tracking-tight">What do you want to build?</h1>
      <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-500">Describe a project and Meldex will create files, preview the result, verify it, and save task history.</p>
      <div className="mt-6 flex w-full gap-2">
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey || event.key === "Enter") && !event.shiftKey) {
              event.preventDefault();
              onCreate(prompt);
            }
          }}
          rows={3}
          className="min-h-24 flex-1 resize-none rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left text-sm outline-none transition focus:border-zinc-400 dark:border-white/10 dark:bg-white/5"
          aria-label="Workspace prompt"
        />
        <button onClick={() => onCreate(prompt)} disabled={loading || !prompt.trim()} className="flex w-24 items-center justify-center rounded-xl bg-zinc-950 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-zinc-950" aria-label="Create workspace">
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        </button>
      </div>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {quickPrompts.map((example) => (
          <button key={example} onClick={() => setPrompt(example)} className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-400 dark:hover:bg-white/8">
            {example}
          </button>
        ))}
      </div>
    </section>
  );
}

export function WorkspaceIndexClient() {
  const { status } = useSession({ required: true });
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectCardData[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState("Saved");

  async function loadProjects() {
    if (status !== "authenticated") return;
    const response = await fetch("/api/workspaces", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to load workspaces");
    setProjects(data.projects || []);
  }

  useEffect(() => {
    loadProjects().catch((error) => setStatusText(error.message));
  }, [status]);

  async function createWorkspace(prompt: string) {
    setLoading(true);
    setStatusText("Creating");
    try {
      const response = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: prompt || "AI Workspace" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to create workspace");
      setStatusText("Workspace created");
      router.push(`/workspace/${data.project.id}`);
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : "Failed to create workspace");
    } finally {
      setLoading(false);
    }
  }

  async function archiveWorkspace(project: ProjectCardData) {
    setStatusText("Archiving");
    const response = await fetch(`/api/workspaces/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ARCHIVED" }),
    });
    const data = await response.json().catch(() => ({}));
    setStatusText(response.ok ? "Workspace archived" : data.error || "Archive failed");
    await loadProjects().catch((error) => setStatusText(error.message));
  }

  async function deleteWorkspace(project: ProjectCardData) {
    if (!window.confirm(`Delete "${project.name}"? This archives the project and hides it from your workspace list.`)) return;
    setStatusText("Deleting");
    const response = await fetch(`/api/workspaces/${project.id}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    setStatusText(response.ok ? "Workspace deleted" : data.error || "Delete failed");
    await loadProjects().catch((error) => setStatusText(error.message));
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950 dark:bg-black dark:text-white">
      <WorkspaceTopbar status={statusText} />
      {projects.length === 0 ? (
        <WorkspaceEmptyState onCreate={createWorkspace} loading={loading} />
      ) : (
        <main className="mx-auto max-w-6xl px-4 py-8">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Workspace</h1>
              <p className="mt-1 text-sm text-zinc-500">Create, continue, preview, and track your AI-built projects.</p>
            </div>
            <button onClick={() => createWorkspace("Create a landing page")} disabled={loading} className="flex items-center justify-center gap-2 rounded-lg bg-zinc-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-zinc-950">
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} New workspace
            </button>
          </div>
          <div className="mb-6 rounded-lg border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-950">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Clock3 className="size-4" /> Quick prompts</div>
            <div className="flex flex-wrap gap-2">
              {quickPrompts.map((prompt) => (
                <button key={prompt} onClick={() => createWorkspace(prompt)} className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-400 dark:hover:bg-white/8">{prompt}</button>
              ))}
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => <WorkspaceProjectCard key={project.id} project={project} onArchive={archiveWorkspace} onDelete={deleteWorkspace} />)}
          </div>
        </main>
      )}
    </div>
  );
}
