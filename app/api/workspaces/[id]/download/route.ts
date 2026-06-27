import { readdir, readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/role-guard";
import { createStoredZip } from "@/lib/simple-zip";
import { getOwnedWorkspaceProject, resolveProjectFile } from "@/lib/ai-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function collectFiles(root: string, relativePath = ""): Promise<Array<{ path: string; content: Buffer }>> {
  const { absolute } = resolveProjectFile(root, relativePath);
  const entries = await readdir(absolute, { withFileTypes: true }).catch(() => []);
  const files: Array<{ path: string; content: Buffer }> = [];
  for (const entry of entries) {
    if (entry.name === ".meldex" || entry.name === ".DS_Store") continue;
    const child = path.join(relativePath, entry.name).split(path.sep).join("/");
    if (/(^|\/)\.env(\.|$)/i.test(child)) continue;
    if (entry.isDirectory()) files.push(...await collectFiles(root, child));
    else files.push({ path: child, content: await readFile(resolveProjectFile(root, child).absolute) });
  }
  return files;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;
  try {
    const { id } = await params;
    const project = await getOwnedWorkspaceProject(session.user.id, id);
    const files = await collectFiles(project.storagePath);
    const zip = createStoredZip(files);
    return new NextResponse(zip, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${project.slug || "workspace"}.zip"`,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to export workspace" }, { status: 400 });
  }
}
