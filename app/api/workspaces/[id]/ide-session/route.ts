import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/role-guard";
import { getOwnedWorkspaceProject } from "@/lib/ai-workspace";
import { ensureOpenVSCodeSession } from "@/lib/openvscode-manager";
import { canUseFeature, featureBlockedResponse } from "@/lib/plans-credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;
  try {
    const { id } = await params;
    const project = await getOwnedWorkspaceProject(session.user.id, id);
    const gate = await canUseFeature(session.user.id, "ide");
    if (!gate.ok) return NextResponse.json(featureBlockedResponse(gate), { status: 402, headers: { "Cache-Control": "no-store" } });
    const ideSession = await ensureOpenVSCodeSession({ userId: session.user.id, project });
    return NextResponse.json({
      url: ideSession.url,
      expiresAt: ideSession.expiresAt,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unable to start Meldex IDE" }, { status: 400 });
  }
}
