import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/role-guard";
import { prisma } from "@/lib/prisma";
import { getOwnedWorkspaceProject, listProjectTree, restoreWorkspaceSnapshot } from "@/lib/ai-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
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
    });
    if (!task) return NextResponse.json({ error: "Workspace task not found" }, { status: 404 });

    const snapshot = await prisma.workspaceSnapshot.findFirst({
      where: { userId: session.user.id, projectId: project.id, taskId: task.id },
      orderBy: { createdAt: "desc" },
    });
    if (!snapshot) return NextResponse.json({ error: "No snapshot found for task rollback" }, { status: 404 });

    const restored = await restoreWorkspaceSnapshot(session.user.id, project.id, snapshot.id);
    await prisma.workspaceTask.update({
      where: { id: task.id },
      data: { status: "CANCELED", summary: "Rolled back to pre-task snapshot", completedAt: new Date() },
    });
    await prisma.workspaceLog.create({
      data: {
        userId: session.user.id,
        projectId: project.id,
        taskId: task.id,
        event: "rollback",
        message: `Rolled back task ${task.id} from snapshot ${snapshot.id}`,
        metadata: { snapshotId: snapshot.id, restoredFiles: restored.restoredFiles },
      },
    });
    return NextResponse.json({ ok: true, taskId: task.id, snapshotId: snapshot.id, tree: await listProjectTree(project.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Task rollback failed" }, { status: 400 });
  }
}
