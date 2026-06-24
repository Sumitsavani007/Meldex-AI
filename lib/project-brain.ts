/**
 * lib/project-brain.ts
 *
 * Project context memory — remembers active project, recent files, edits, summary.
 * Backed by ProjectContext table.
 * Enables "continue yesterday's work" type queries.
 */

import { prisma } from "./prisma";

// ── Types ────────────────────────────────────────────────────────────────────

export interface RecentFile {
  path: string;
  language?: string;
  editedAt: string;
}

export interface RecentEdit {
  path: string;
  description: string;
  timestamp: string;
}

export interface ProjectState {
  projectName: string;
  summary: string | null;
  recentFiles: RecentFile[];
  recentEdits: RecentEdit[];
  lastActive: string;
}

// ── In-process cache ─────────────────────────────────────────────────────────

interface ProjectCacheEntry { data: ProjectState; expires: number }
const PROJECT_CACHE = new Map<string, ProjectCacheEntry>();
const PROJECT_TTL = 5 * 60 * 1000;

function projCacheKey(userId: string, name: string) {
  return `${userId}:${name.toLowerCase()}`;
}

// ── Core operations ───────────────────────────────────────────────────────────

export async function getProjectContext(
  userId: string,
  projectName: string
): Promise<ProjectState | null> {
  const key = projCacheKey(userId, projectName);
  const cached = PROJECT_CACHE.get(key);
  if (cached && cached.expires > Date.now()) return { ...cached.data };

  const row = await prisma.projectContext.findUnique({
    where: { userId_projectName: { userId, projectName } },
  });
  if (!row) return null;

  const state: ProjectState = {
    projectName: row.projectName,
    summary: row.summary,
    recentFiles: (row.recentFiles as RecentFile[] | null) ?? [],
    recentEdits: (row.recentEdits as RecentEdit[] | null) ?? [],
    lastActive: row.lastActive.toISOString(),
  };
  PROJECT_CACHE.set(key, { data: state, expires: Date.now() + PROJECT_TTL });
  return state;
}

export async function upsertProjectContext(
  userId: string,
  projectName: string,
  patch: Partial<Omit<ProjectState, "projectName" | "lastActive">>
): Promise<void> {
  const existing = await getProjectContext(userId, projectName);

  const recentFiles = patch.recentFiles ?? existing?.recentFiles ?? [];
  const recentEdits = patch.recentEdits ?? existing?.recentEdits ?? [];
  const summary = patch.summary ?? existing?.summary ?? null;

  await prisma.projectContext.upsert({
    where: { userId_projectName: { userId, projectName } },
    update: {
      summary,
      recentFiles: recentFiles as object[],
      recentEdits: recentEdits as object[],
      lastActive: new Date(),
    },
    create: {
      userId,
      projectName,
      summary,
      recentFiles: recentFiles as object[],
      recentEdits: recentEdits as object[],
    },
  });

  PROJECT_CACHE.delete(projCacheKey(userId, projectName));
}

/** Add a recently touched file to a project context (max 20). */
export async function trackFile(
  userId: string,
  projectName: string,
  file: RecentFile
): Promise<void> {
  const state = await getProjectContext(userId, projectName);
  const existing = state?.recentFiles ?? [];
  const updated = [
    file,
    ...existing.filter((f) => f.path !== file.path),
  ].slice(0, 20);
  await upsertProjectContext(userId, projectName, { recentFiles: updated });
}

/** Add a recent edit record. */
export async function trackEdit(
  userId: string,
  projectName: string,
  edit: RecentEdit
): Promise<void> {
  const state = await getProjectContext(userId, projectName);
  const existing = state?.recentEdits ?? [];
  const updated = [edit, ...existing].slice(0, 30);
  await upsertProjectContext(userId, projectName, { recentEdits: updated });
}

/** Get the most recently active project for a user. */
export async function getMostRecentProject(userId: string): Promise<ProjectState | null> {
  const row = await prisma.projectContext.findFirst({
    where: { userId },
    orderBy: { lastActive: "desc" },
  });
  if (!row) return null;
  return {
    projectName: row.projectName,
    summary: row.summary,
    recentFiles: (row.recentFiles as RecentFile[] | null) ?? [],
    recentEdits: (row.recentEdits as RecentEdit[] | null) ?? [],
    lastActive: row.lastActive.toISOString(),
  };
}

/** List all projects for a user (name + lastActive only). */
export async function listProjects(userId: string): Promise<{ name: string; lastActive: string }[]> {
  const rows = await prisma.projectContext.findMany({
    where: { userId },
    orderBy: { lastActive: "desc" },
    select: { projectName: true, lastActive: true },
  });
  return rows.map((r) => ({ name: r.projectName, lastActive: r.lastActive.toISOString() }));
}

// ── "Continue work" query detection ──────────────────────────────────────────

const CONTINUE_PATTERNS = [
  /continue (yesterday|last|previous|my) ?(work|task|project|code)?/i,
  /what (was|were) (i|we) (working|building|doing)/i,
  /resume.*project/i,
  /pick up.*where/i,
  /kal.*kaam|kaal.*kaam/i, // Gujarati/Hindi: yesterday's work
  /aage.*continue/i,
];

export function isContinueQuery(message: string): boolean {
  return CONTINUE_PATTERNS.some((p) => p.test(message));
}

/** Build a context string for "continue work" type queries. */
export async function buildProjectContext(userId: string): Promise<string> {
  const project = await getMostRecentProject(userId);
  if (!project) {
    return "I don't have any saved project context yet. Start a project and I'll remember it for next time.";
  }

  const lastActiveDate = new Date(project.lastActive);
  const parts: string[] = [
    `**Project: ${project.projectName}**`,
    `Last active: ${lastActiveDate.toLocaleString("en-IN")}`,
  ];

  if (project.summary) parts.push(`Summary: ${project.summary}`);

  if (project.recentFiles.length) {
    parts.push(`\nRecent files:`);
    project.recentFiles.slice(0, 5).forEach((f) => {
      parts.push(`- \`${f.path}\`${f.language ? ` (${f.language})` : ""}`);
    });
  }

  if (project.recentEdits.length) {
    parts.push(`\nRecent edits:`);
    project.recentEdits.slice(0, 5).forEach((e) => {
      const t = new Date(e.timestamp).toLocaleTimeString("en-IN");
      parts.push(`- ${t}: ${e.description}`);
    });
  }

  return parts.join("\n");
}
