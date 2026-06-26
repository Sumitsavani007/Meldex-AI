import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/role-guard";
import { getOwnedWorkspaceProject } from "@/lib/ai-workspace";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;
  try {
    const { id } = await params;
    const project = await getOwnedWorkspaceProject(session.user.id, id);
    const tasks = await prisma.workspaceTask.findMany({
      where: { projectId: project.id, userId: session.user.id },
      orderBy: { createdAt: "desc" },
      include: { diffs: true, runs: true, previews: true, logs: true, events: { orderBy: { sequence: "asc" } } },
      take: 50,
    });
    return NextResponse.json({ tasks }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load tasks" }, { status: 400 });
  }
}
