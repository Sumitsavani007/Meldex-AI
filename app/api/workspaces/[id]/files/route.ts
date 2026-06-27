import { NextResponse } from "next/server";
import { mkdir, rename, rm } from "fs/promises";
import path from "path";
import { z } from "zod";
import { requireAuth } from "@/lib/role-guard";
import { prisma } from "@/lib/prisma";
import { getOwnedWorkspaceProject, listProjectTree, readProjectFile, resolveProjectFile, writeProjectFile } from "@/lib/ai-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  path: z.string().min(1).max(500),
  content: z.string().max(1_000_000).default(""),
  status: z.string().max(40).optional(),
  type: z.enum(["file", "folder"]).default("file"),
});

const moveSchema = z.object({
  fromPath: z.string().min(1).max(500),
  toPath: z.string().min(1).max(500),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;
  try {
    const { id } = await params;
    await getOwnedWorkspaceProject(session.user.id, id);
    const { searchParams } = new URL(request.url);
    const filePath = searchParams.get("path");
    if (filePath) {
      const content = await readProjectFile(session.user.id, id, filePath);
      return NextResponse.json({ path: filePath, content }, { headers: { "Cache-Control": "no-store" } });
    }
    const tree = await listProjectTree(id);
    return NextResponse.json({ tree }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to read workspace files" }, { status: 400 });
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
    await getOwnedWorkspaceProject(session.user.id, id);
    const project = await getOwnedWorkspaceProject(session.user.id, id);
    const body = createSchema.parse(await request.json().catch(() => ({})));
    if (body.type === "folder") {
      const { relative, absolute } = resolveProjectFile(project.storagePath, body.path);
      if (!relative) throw new Error("Folder path is required");
      await mkdir(absolute, { recursive: true });
      return NextResponse.json({ folder: { path: relative } }, { status: 201, headers: { "Cache-Control": "no-store" } });
    }
    const filePath = await writeProjectFile(session.user.id, id, body.path, body.content, body.status || "CREATED");
    return NextResponse.json({ file: { path: filePath, content: body.content } }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to create workspace file" }, { status: 400 });
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
    const body = moveSchema.parse(await request.json().catch(() => ({})));
    const from = resolveProjectFile(project.storagePath, body.fromPath);
    const to = resolveProjectFile(project.storagePath, body.toPath);
    if (!from.relative || !to.relative) throw new Error("Invalid move path");
    await mkdir(path.dirname(to.absolute), { recursive: true });
    await rename(from.absolute, to.absolute);
    const records = await prisma.workspaceFile.findMany({
      where: {
        userId: session.user.id,
        projectId: id,
        deletedAt: null,
        OR: [{ path: from.relative }, { path: { startsWith: `${from.relative}/` } }],
      },
    });
    for (const file of records) {
      const nextPath = file.path === from.relative ? to.relative : `${to.relative}/${file.path.slice(from.relative.length + 1)}`;
      await prisma.workspaceFile.update({ where: { id: file.id }, data: { path: nextPath, status: "EDITED" } });
    }
    return NextResponse.json({ ok: true, fromPath: from.relative, toPath: to.relative }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to rename workspace path" }, { status: 400 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;
  try {
    const { id } = await params;
    const project = await getOwnedWorkspaceProject(session.user.id, id);
    const { searchParams } = new URL(request.url);
    const targetPath = searchParams.get("path") || "";
    const { relative, absolute } = resolveProjectFile(project.storagePath, targetPath);
    if (!relative) throw new Error("Delete path is required");
    await rm(absolute, { recursive: true, force: true });
    await prisma.workspaceFile.updateMany({
      where: {
        userId: session.user.id,
        projectId: id,
        deletedAt: null,
        OR: [{ path: relative }, { path: { startsWith: `${relative}/` } }],
      },
      data: { deletedAt: new Date(), status: "DELETED" },
    });
    return NextResponse.json({ ok: true, path: relative }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to delete workspace path" }, { status: 400 });
  }
}
