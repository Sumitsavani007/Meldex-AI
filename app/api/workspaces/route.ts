import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/role-guard";
import { checkRateLimit } from "@/lib/security";
import { ensureWorkspaceProject, listOwnedWorkspaceProjects } from "@/lib/ai-workspace";
import { checkWorkspaceCreateLimit } from "@/lib/plans-credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional(),
});

export async function GET(request: Request) {
  const { session, error } = await requireAuth();
  if (error) return error;
  try {
    checkRateLimit(request.headers.get("x-forwarded-for") || `workspaces:${session.user.id}`, 120);
    const projects = await listOwnedWorkspaceProjects(session.user.id);
    return NextResponse.json({ projects }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load workspaces" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const { session, error } = await requireAuth();
  if (error) return error;
  try {
    checkRateLimit(request.headers.get("x-forwarded-for") || `workspaces:create:${session.user.id}`, 30);
    const body = createSchema.parse(await request.json().catch(() => ({})));
    const limit = await checkWorkspaceCreateLimit(session.user.id);
    if (!limit.ok) return NextResponse.json(limit, { status: 402, headers: { "Cache-Control": "no-store" } });
    const project = await ensureWorkspaceProject(session.user.id, body.name || "Untitled Workspace", body.description || "AI-generated workspace project");
    return NextResponse.json({ project }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to create workspace" }, { status: 400 });
  }
}
