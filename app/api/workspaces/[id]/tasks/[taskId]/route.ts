import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/role-guard";
import { prisma } from "@/lib/prisma";
import { getOwnedWorkspaceProject } from "@/lib/ai-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;
  try {
    const { id, taskId } = await params;
    const project = await getOwnedWorkspaceProject(session.user.id, id);
    const task = await prisma.workspaceTask.findFirst({
      where: { id: taskId, userId: session.user.id, projectId: project.id },
      include: {
        diffs: true,
        runs: true,
        previews: true,
        logs: true,
        events: { orderBy: { sequence: "asc" } },
        snapshots: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!task) return NextResponse.json({ error: "Workspace task not found" }, { status: 404 });
    return NextResponse.json({ task }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load task" }, { status: 400 });
  }
}
