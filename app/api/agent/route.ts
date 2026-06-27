import { NextResponse } from "next/server";
import { runAgent } from "@/lib/agent";
import { executeTerminalCommand } from "@/lib/terminal";
import { agentRequestSchema, checkRateLimit } from "@/lib/security";
import { requireAuth } from "@/lib/role-guard";
import { canUseFeature, featureBlockedResponse } from "@/lib/plans-credits";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { session, error } = await requireAuth();
    if (error) return error;

    checkRateLimit(request.headers.get("x-forwarded-for") || "local-agent", 12);
    const body = agentRequestSchema.parse(await request.json());
    const gate = await canUseFeature(session.user.id, "agent_runs");
    if (!gate.ok) return NextResponse.json(featureBlockedResponse(gate), { status: 402, headers: { "Cache-Control": "no-store" } });

    const result = await runAgent(body.task.trim(), {
      baseUrl: body.baseUrl,
      model: body.model,
      runCommand: executeTerminalCommand
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Agent task failed" }, { status: 400 });
  }
}
