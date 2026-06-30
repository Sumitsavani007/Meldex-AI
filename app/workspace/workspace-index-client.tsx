"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Archive,
  Clock3,
  Copy,
  ExternalLink,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";

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

function prewarmIdeSession(projectId: string) {
  return fetch(`/api/workspaces/${projectId}/ide-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
  }).catch(() => undefined);
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
  const previewUrl = project.lastPreviewUrl || (previewReady ? `/api/workspaces/${project.id}/preview` : "");
  return (
    <article className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-md dark:border-white/10 dark:bg-[#111113] dark:hover:border-violet-400/25">
      <Link href={`/workspace/${project.id}/ide`} className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
        <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{project.name}</h2>
          <p className="mt-1 text-xs text-zinc-500">Updated {new Date(project.updatedAt).toLocaleString()}</p>
        </div>
        <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200">{project.status}</span>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-xl bg-slate-50 p-2 dark:bg-white/5"><div className="text-zinc-500">Files</div><div className="font-semibold">{files}</div></div>
        <div className="rounded-xl bg-slate-50 p-2 dark:bg-white/5"><div className="text-zinc-500">Tasks</div><div className="font-semibold">{tasks}</div></div>
        <div className="rounded-xl bg-slate-50 p-2 dark:bg-white/5"><div className="text-zinc-500">Preview</div><div className="font-semibold">{previewReady ? "Ready" : "None"}</div></div>
        </div>
      </Link>
      <div className="mt-4 flex items-center gap-2">
        <Link href={`/workspace/${project.id}/ide`} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white shadow-sm shadow-violet-600/20">
          Open IDE <ExternalLink className="size-3.5" />
        </Link>
        {previewUrl ? (
          <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="rounded-md border border-zinc-200 p-2 text-zinc-500 hover:bg-zinc-50 dark:border-white/10 dark:hover:bg-white/8" title="Open preview" aria-label="Open preview">
            <ExternalLink className="size-3.5" />
          </a>
        ) : (
          <button disabled className="cursor-not-allowed rounded-md border border-zinc-200 p-2 text-zinc-300 dark:border-white/10 dark:text-zinc-600" title="Preview is not available until the workspace generates files" aria-label="Preview disabled">
            <ExternalLink className="size-3.5" />
          </button>
        )}
        <Link href={`/workspace/${project.id}/classic`} className="rounded-md border border-zinc-200 p-2 text-zinc-500 hover:bg-zinc-50 dark:border-white/10 dark:hover:bg-white/8" title="Open classic workspace fallback" aria-label="Open classic workspace fallback">
          <Copy className="size-3.5" />
        </Link>
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
      <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm shadow-violet-600/20">
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
          className="min-h-20 flex-1 resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm outline-none transition focus:border-violet-300 dark:border-white/10 dark:bg-white/5"
          aria-label="Workspace prompt"
        />
        <button onClick={() => onCreate(prompt)} disabled={loading || !prompt.trim()} className="flex w-24 items-center justify-center rounded-xl bg-violet-600 text-sm font-semibold text-white disabled:opacity-50" aria-label="Create workspace">
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
    const loadedProjects = data.projects || [];
    setProjects(loadedProjects);
    loadedProjects.slice(0, 3).forEach((project: ProjectCardData) => {
      void prewarmIdeSession(project.id);
    });
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
      void prewarmIdeSession(data.project.id);
      router.push(`/workspace/${data.project.id}/ide`);
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
    <AppShell title="Workspace" description="Create, continue, preview, and track your AI-built projects." breadcrumb={statusText}>
          {projects.length === 0 ? (
            <WorkspaceEmptyState onCreate={createWorkspace} loading={loading} />
          ) : (
            <div>
              <label className="mb-4 flex h-10 w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-500 shadow-sm dark:border-white/10 dark:bg-white/[0.04] md:hidden">
                <Search className="size-4" />
                <input className="min-w-0 flex-1 appearance-none border-0 bg-transparent p-0 outline-none ring-0 placeholder:text-slate-400 focus:border-0 focus:outline-none focus:ring-0 focus-visible:outline-none" placeholder="Search workspaces..." />
              </label>
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight">Workspace</h1>
                  <p className="mt-1 text-sm text-zinc-500">Create, continue, preview, and track your AI-built projects.</p>
                </div>
                <button onClick={() => createWorkspace("Create a landing page")} disabled={loading} className="flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-violet-600/20 disabled:opacity-50">
                  {loading ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} New workspace
                </button>
              </div>
              <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#111113]">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Clock3 className="size-4 text-violet-600" /> Quick prompts</div>
                <div className="flex flex-wrap gap-2">
                  {quickPrompts.map((prompt) => (
                    <button key={prompt} onClick={() => createWorkspace(prompt)} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs text-zinc-600 hover:bg-violet-50 hover:text-violet-700 dark:border-white/10 dark:text-zinc-400 dark:hover:bg-white/8">{prompt}</button>
                  ))}
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {projects.map((project) => <WorkspaceProjectCard key={project.id} project={project} onArchive={archiveWorkspace} onDelete={deleteWorkspace} />)}
              </div>
            </div>
          )}
    </AppShell>
  );
}
