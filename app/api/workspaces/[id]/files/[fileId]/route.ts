import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/role-guard";
import { prisma } from "@/lib/prisma";
import { deleteProjectFile, getOwnedWorkspaceProject, readProjectFile, writeProjectFile } from "@/lib/ai-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateSchema = z.object({
  content: z.string().max(1_000_000).optional(),
  status: z.string().max(40).optional(),
});

async function getOwnedFile(userId: string, projectId: string, fileId: string) {
  await getOwnedWorkspaceProject(userId, projectId);
  const file = await prisma.workspaceFile.findFirst({
    where: { id: fileId, userId, projectId, deletedAt: null },
  });
  if (!file) throw new Error("Workspace file not found");
  return file;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;
  try {
    const { id, fileId } = await params;
    const file = await getOwnedFile(session.user.id, id, fileId);
    const content = await readProjectFile(session.user.id, id, file.path);
    return NextResponse.json({ file, content }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to read workspace file" }, { status: 404 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;
  try {
    const { id, fileId } = await params;
    const file = await getOwnedFile(session.user.id, id, fileId);
    const body = updateSchema.parse(await request.json().catch(() => ({})));
    let content = body.content;
    if (content === undefined) content = await readProjectFile(session.user.id, id, file.path);
    await writeProjectFile(session.user.id, id, file.path, content, body.status || "EDITED");
    const updated = await prisma.workspaceFile.findUnique({ where: { id: file.id } });
    return NextResponse.json({ file: updated, content }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to update workspace file" }, { status: 400 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;
  try {
    const { id, fileId } = await params;
    const file = await getOwnedFile(session.user.id, id, fileId);
    await deleteProjectFile(session.user.id, id, file.path);
    return NextResponse.json({ ok: true, fileId }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to delete workspace file" }, { status: 400 });
  }
}
