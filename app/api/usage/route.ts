import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/role-guard";
import { getUserPlanLimits } from "@/lib/plans-credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { session, error } = await requireAuth();
  if (error) return error;
  try {
    const usage = await getUserPlanLimits(session.user.id);
    return NextResponse.json({ usage }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load usage" }, { status: 400 });
  }
}
