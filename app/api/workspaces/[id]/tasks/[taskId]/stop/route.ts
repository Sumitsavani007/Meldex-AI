import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/role-guard";
import { prisma } from "@/lib/prisma";
import { createWorkspaceTaskEvent, getOwnedWorkspaceProject } from "@/lib/ai-workspace";

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
      include: { events: { orderBy: { sequence: "desc" }, take: 1 } },
    });
    if (!task) return NextResponse.json({ error: "Workspace task not found" }, { status: 404 });

    const updated = await prisma.workspaceTask.update({
      where: { id: task.id },
      data: { status: "CANCELED", summary: "Task stopped by user", completedAt: new Date() },
    });
    await createWorkspaceTaskEvent({
      userId: session.user.id,
      projectId: project.id,
      taskId: task.id,
      sequence: (task.events[0]?.sequence || 0) + 1,
      type: "log",
      message: "Task stopped by user",
    });
    await prisma.workspaceLog.create({
      data: {
        userId: session.user.id,
        projectId: project.id,
        taskId: task.id,
        level: "warn",
        event: "task_stopped",
        message: "Task stopped by user",
      },
    });
    return NextResponse.json({ task: updated }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to stop task" }, { status: 400 });
  }
}
