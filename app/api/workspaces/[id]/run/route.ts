import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/role-guard";
import { checkRateLimit } from "@/lib/security";
import { getOwnedWorkspaceProject, verifyStaticPreview } from "@/lib/ai-workspace";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;
  try {
    checkRateLimit(request.headers.get("x-forwarded-for") || `workspace-run:${session.user.id}`, 30);
    const { id } = await params;
    const project = await getOwnedWorkspaceProject(session.user.id, id);
    const verification = await verifyStaticPreview(session.user.id, project.id);
    const run = await prisma.workspaceRun.create({
      data: {
        userId: session.user.id,
        projectId: project.id,
        command: "static-preview-verify",
        status: verification.verified ? "SUCCEEDED" : "FAILED",
        exitCode: verification.verified ? 0 : 1,
        stdout: verification.message,
        previewUrl: verification.url,
      },
    });
    const preview = await prisma.workspacePreview.create({
      data: {
        userId: session.user.id,
        projectId: project.id,
        url: verification.url,
        status: verification.verified ? "VERIFIED" : "FAILED",
        httpStatus: verification.httpStatus,
        verified: verification.verified,
        message: verification.message,
        lastCheckedAt: new Date(),
        logs: { verification },
      },
    });
    await prisma.workspaceProject.update({
      where: { id: project.id },
      data: { lastPreviewUrl: verification.url, qualityScore: verification.verified ? 88 : 45 },
    });
    return NextResponse.json({ run, preview, verification }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Workspace run failed" }, { status: 400 });
  }
}
