import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/role-guard";
import { findStaticPreviewEntry, getOwnedWorkspaceProject, resolveProjectFile, verifyStaticPreview } from "@/lib/ai-workspace";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const actionSchema = z.object({
  action: z.enum(["start", "stop", "refresh", "verify"]).default("verify"),
});

const contentTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
};

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
    const verifyOnly = searchParams.get("verify") === "1";
    if (verifyOnly) {
      const verification = await verifyStaticPreview(session.user.id, id);
      return NextResponse.json(verification, { headers: { "Cache-Control": "no-store" } });
    }

    const filePath = searchParams.get("file") || await findStaticPreviewEntry(project.storagePath) || "index.html";
    const { absolute } = resolveProjectFile(project.storagePath, filePath);
    const body = await readFile(absolute);
    const type = contentTypes[path.extname(absolute).toLowerCase()] || "text/plain; charset=utf-8";
    const headers = new Headers({
      "Content-Type": type,
      "Cache-Control": "no-store",
    });
    if (type.startsWith("text/html")) {
      headers.set("Content-Security-Policy", "default-src 'self' 'unsafe-inline' data: blob:; img-src 'self' data: blob:; frame-ancestors 'self'");
      headers.set("X-Frame-Options", "SAMEORIGIN");
    }
    return new NextResponse(body, {
      status: 200,
      headers,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Preview unavailable" }, { status: 404 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;
  try {
    const { id } = await params;
    const project = await getOwnedWorkspaceProject(session.user.id, id);
    const body = actionSchema.parse(await request.json().catch(() => ({})));

    if (body.action === "stop") {
      const preview = await prisma.workspacePreview.create({
        data: {
          userId: session.user.id,
          projectId: project.id,
          url: `/api/workspaces/${project.id}/preview`,
          status: "STOPPED",
          verified: false,
          message: "Preview stopped",
          lastCheckedAt: new Date(),
          logs: { action: body.action },
        },
      });
      return NextResponse.json({ preview }, { headers: { "Cache-Control": "no-store" } });
    }

    const verification = await verifyStaticPreview(session.user.id, project.id);
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
        logs: { action: body.action, verification },
      },
    });
    await prisma.workspaceProject.update({
      where: { id: project.id },
      data: { lastPreviewUrl: verification.url },
    });
    return NextResponse.json({ preview, verification }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Preview action failed" }, { status: 400 });
  }
}
