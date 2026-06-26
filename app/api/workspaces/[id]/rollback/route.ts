import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/role-guard";
import { prisma } from "@/lib/prisma";
import { deleteProjectFile, getOwnedWorkspaceProject, listProjectTree, restoreWorkspaceSnapshot, writeProjectFile } from "@/lib/ai-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  taskId: z.string().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;
  try {
    const { id } = await params;
    const project = await getOwnedWorkspaceProject(session.user.id, id);
    const body = schema.parse(await request.json().catch(() => ({})));
    const task = body.taskId
      ? await prisma.workspaceTask.findFirst({ where: { id: body.taskId, projectId: project.id, userId: session.user.id }, include: { diffs: true, snapshots: { orderBy: { createdAt: "desc" }, take: 1 } } })
      : await prisma.workspaceTask.findFirst({ where: { projectId: project.id, userId: session.user.id }, orderBy: { createdAt: "desc" }, include: { diffs: true, snapshots: { orderBy: { createdAt: "desc" }, take: 1 } } });

    if (!task) return NextResponse.json({ error: "No task found to rollback" }, { status: 404 });
    if (task.snapshots[0]) {
      await restoreWorkspaceSnapshot(session.user.id, project.id, task.snapshots[0].id);
    } else {
      for (const diff of [...task.diffs].reverse()) {
        if (diff.operation === "create" && !diff.oldContent) {
          await deleteProjectFile(session.user.id, project.id, diff.path);
        } else {
          await writeProjectFile(session.user.id, project.id, diff.path, diff.oldContent || "", "ROLLED_BACK");
        }
      }
    }
    await prisma.workspaceLog.create({
      data: {
        userId: session.user.id,
        projectId: project.id,
        taskId: task.id,
        event: "rollback",
        message: `Rolled back task ${task.id}`,
      },
    });
    return NextResponse.json({ ok: true, taskId: task.id, tree: await listProjectTree(project.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Rollback failed" }, { status: 400 });
  }
}
