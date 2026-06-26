import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { requireAuth } from "@/lib/role-guard";
import { prisma } from "@/lib/prisma";
import { getOwnedWorkspaceProject, readWorkspaceMemorySnapshot, type WorkspaceMemorySnapshot } from "@/lib/ai-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const editableKeys = [
  "projectSummary",
  "architecture",
  "recentDecisions",
  "knownIssues",
  "successfulFixes",
  "codingStyle",
  "designStyle",
  "lastSuccessfulCommands",
  "activePreviewCommand",
] as const;

const patchSchema = z.object({
  key: z.enum(editableKeys),
  value: z.union([z.string().max(1200), z.array(z.string().max(500)).max(50)]),
});

const deleteSchema = z.object({
  key: z.enum(editableKeys).optional(),
  index: z.number().int().min(0).optional(),
  clear: z.boolean().optional(),
});

function cleanText(value = "") {
  return value
    .replace(/mdx_[A-Za-z0-9_-]+/g, "mdx_****")
    .replace(/sk-[A-Za-z0-9_-]+/g, "sk-****")
    .replace(/(password|token|api[_-]?key|secret)=([^\s&]+)/gi, "$1=****")
    .slice(0, 1200)
    .trim();
}

function cleanValue(value: string | string[]) {
  if (Array.isArray(value)) return [...new Set(value.map((item) => cleanText(item)).filter(Boolean))].slice(0, 50);
  return cleanText(value);
}

async function saveMemory(userId: string, projectId: string, memory: WorkspaceMemorySnapshot) {
  const project = await getOwnedWorkspaceProject(userId, projectId);
  const key = `workspace:${project.id}`;
  await prisma.projectContext.upsert({
    where: { userId_projectName: { userId, projectName: key } },
    create: {
      userId,
      projectName: key,
      summary: memory.projectSummary,
      recentFiles: memory.recentTasks.flatMap((task) => task.filesChanged).slice(0, 40) as Prisma.InputJsonValue,
      recentEdits: memory as unknown as Prisma.InputJsonValue,
      lastActive: new Date(),
    },
    update: {
      summary: memory.projectSummary,
      recentFiles: memory.recentTasks.flatMap((task) => task.filesChanged).slice(0, 40) as Prisma.InputJsonValue,
      recentEdits: memory as unknown as Prisma.InputJsonValue,
      lastActive: new Date(),
    },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;
  try {
    const { memory } = await readWorkspaceMemorySnapshot(session.user.id, id);
    return NextResponse.json({ memory }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Memory unavailable" }, { status: 404 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;
  try {
    const body = patchSchema.parse(await request.json().catch(() => ({})));
    const { memory } = await readWorkspaceMemorySnapshot(session.user.id, id);
    const next = { ...memory, [body.key]: cleanValue(body.value), updatedAt: new Date().toISOString() };
    await saveMemory(session.user.id, id, next);
    return NextResponse.json({ memory: next }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to update memory" }, { status: 400 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;
  try {
    const body = deleteSchema.parse(await request.json().catch(() => ({})));
    const { memory } = await readWorkspaceMemorySnapshot(session.user.id, id);
    const next: WorkspaceMemorySnapshot = body.clear
      ? { ...memory, projectSummary: "", architecture: [], recentDecisions: [], knownIssues: [], successfulFixes: [], codingStyle: [], designStyle: [], lastSuccessfulCommands: [], updatedAt: new Date().toISOString() }
      : { ...memory, updatedAt: new Date().toISOString() };
    if (!body.clear && body.key) {
      const current = next[body.key];
      if (Array.isArray(current) && typeof body.index === "number") {
        next[body.key] = current.filter((_, index) => index !== body.index) as never;
      } else if (typeof current === "string") {
        next[body.key] = "" as never;
      } else if (Array.isArray(current)) {
        next[body.key] = [] as never;
      }
    }
    await saveMemory(session.user.id, id, next);
    return NextResponse.json({ memory: next }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to delete memory" }, { status: 400 });
  }
}
