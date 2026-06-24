import { NextResponse } from "next/server";
import {
  createWorkspaceFolder,
  deleteWorkspacePath,
  listWorkspace,
  readWorkspaceFile,
  writeWorkspaceFile
} from "@/lib/workspace";
import { checkRateLimit, workspaceWriteSchema } from "@/lib/security";

export async function GET(request: Request) {
  try {
    checkRateLimit(request.headers.get("x-forwarded-for") || "local-workspace-read", 120);
    const { searchParams } = new URL(request.url);
    const filePath = searchParams.get("path");

    if (filePath) {
      const content = await readWorkspaceFile(filePath);
      return NextResponse.json({ content });
    }

    const tree = await listWorkspace();
    return NextResponse.json({ tree });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Workspace read failed" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    checkRateLimit(request.headers.get("x-forwarded-for") || "local-workspace-write", 80);
    const body = workspaceWriteSchema.parse(await request.json());

    if (body.action === "folder") {
      await createWorkspaceFolder(body.path);
    } else {
      await writeWorkspaceFile(body.path, body.content ?? "");
    }

    return NextResponse.json({ ok: true, tree: await listWorkspace() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Workspace write failed" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    checkRateLimit(request.headers.get("x-forwarded-for") || "local-workspace-delete", 30);
    const { searchParams } = new URL(request.url);
    const filePath = searchParams.get("path");

    if (!filePath) {
      return NextResponse.json({ error: "Path is required." }, { status: 400 });
    }

    await deleteWorkspacePath(filePath);
    return NextResponse.json({ ok: true, tree: await listWorkspace() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Workspace delete failed" }, { status: 400 });
  }
}
