import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/role-guard";
import { prisma } from "@/lib/prisma";
import { getOwnedWorkspaceProject, listProjectTree, readWorkspaceMemorySnapshot, verifyStaticPreview } from "@/lib/ai-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
  status: z.enum(["ACTIVE", "ARCHIVED", "DEPLOYING", "FAILED"]).optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;
  try {
    const { id } = await params;
    const project = await getOwnedWorkspaceProject(session.user.id, id);
    const { searchParams } = new URL(request.url);
    const includeHidden = searchParams.get("showHidden") === "1";
    const [tree, tasks, preview, memorySnapshot] = await Promise.all([
      listProjectTree(project.id, { includeHidden }),
      prisma.workspaceTask.findMany({
        where: { projectId: project.id },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { diffs: true, runs: true, previews: true, events: { orderBy: { sequence: "asc" } } },
      }),
      verifyStaticPreview(session.user.id, project.id),
      readWorkspaceMemorySnapshot(session.user.id, project.id).then((result) => result.memory).catch(() => null),
    ]);
    return NextResponse.json({ project, tree, tasks, preview, memory: memorySnapshot }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Workspace not found" }, { status: 404 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;
  try {
    const { id } = await params;
    const project = await getOwnedWorkspaceProject(session.user.id, id);
    const body = updateSchema.parse(await request.json().catch(() => ({})));
    const updated = await prisma.workspaceProject.update({
      where: { id: project.id },
      data: {
        name: body.name,
        description: body.description,
        status: body.status,
      },
    });
    return NextResponse.json({ project: updated }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to update workspace" }, { status: 400 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;
  try {
    const { id } = await params;
    const project = await getOwnedWorkspaceProject(session.user.id, id);
    const deletedAt = new Date();
    const updated = await prisma.workspaceProject.update({
      where: { id: project.id },
      data: { status: "ARCHIVED", deletedAt },
    });
    await prisma.workspaceFile.updateMany({ where: { userId: session.user.id, projectId: project.id }, data: { deletedAt } });
    await prisma.workspacePreview.updateMany({ where: { userId: session.user.id, projectId: project.id }, data: { deletedAt, status: "STOPPED" } });
    return NextResponse.json({ ok: true, project: updated }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to delete workspace" }, { status: 400 });
  }
}
