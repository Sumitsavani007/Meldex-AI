import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/role-guard";
import { getOwnedWorkspaceProject, listProjectTree, readProjectFile, writeProjectFile } from "@/lib/ai-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  path: z.string().min(1).max(500),
  content: z.string().max(1_000_000).default(""),
  status: z.string().max(40).optional(),
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
    const body = createSchema.parse(await request.json().catch(() => ({})));
    const path = await writeProjectFile(session.user.id, id, body.path, body.content, body.status || "CREATED");
    return NextResponse.json({ file: { path, content: body.content } }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to create workspace file" }, { status: 400 });
  }
}
