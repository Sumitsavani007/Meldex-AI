import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/role-guard";
import { prisma } from "@/lib/prisma";
import { assignUserPlan, createUserNotification, getUserPlanLimits, grantExtraCredits, listPlans, resetUserUsage } from "@/lib/plans-credits";
import { logAuditEvent } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("assign"), planId: z.string().min(1), endsAt: z.string().datetime().optional().nullable() }),
  z.object({ action: z.literal("grant"), credits: z.coerce.number().int().positive(), reason: z.string().max(240).optional() }),
  z.object({ action: z.literal("reset"), reason: z.string().max(240).optional() }),
]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdmin();
  if (error) return error;
  try {
    const { id } = await params;
    const user = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true, name: true } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    const [plans, usage, transactions] = await Promise.all([
      listPlans(),
      getUserPlanLimits(id),
      prisma.creditTransaction.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, take: 20 }),
    ]);
    return NextResponse.json({ user, plans, usage, transactions }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load user plan" }, { status: 400 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAdmin();
  if (error) return error;
  try {
    const { id } = await params;
    const user = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    const body = actionSchema.parse(await request.json().catch(() => ({})));
    if (body.action === "assign") {
      const assigned = await assignUserPlan({
        userId: id,
        planId: body.planId,
        assignedByAdmin: true,
        endsAt: body.endsAt ? new Date(body.endsAt) : null,
      });
      await logAuditEvent({ userId: session.user.id, action: "USER_PLAN_ASSIGN", resource: user.email, success: true, metadata: { planId: body.planId } });
      await createUserNotification({ userId: id, type: "plan_changed", title: "Plan changed", message: `Your Meldex plan is now ${assigned.plan.name}.`, metadata: { planId: body.planId } }).catch(() => undefined);
      return NextResponse.json({ usage: await getUserPlanLimits(id), assigned }, { headers: { "Cache-Control": "no-store" } });
    }
    if (body.action === "grant") {
      const usage = await grantExtraCredits(id, body.credits, body.reason || "Admin credit grant");
      await logAuditEvent({ userId: session.user.id, action: "USER_CREDIT_GRANT", resource: user.email, success: true, metadata: { credits: body.credits } });
      await createUserNotification({ userId: id, type: "credits_granted", title: "Credits granted", message: `${body.credits.toLocaleString()} bonus credits were added by an admin.`, metadata: { credits: body.credits } }).catch(() => undefined);
      return NextResponse.json({ usage }, { headers: { "Cache-Control": "no-store" } });
    }
    const usage = await resetUserUsage(id, body.reason || "Admin usage reset");
    await logAuditEvent({ userId: session.user.id, action: "USER_USAGE_RESET", resource: user.email, success: true });
    await createUserNotification({ userId: id, type: "usage_reset", title: "Usage reset", message: "Your usage counters were reset by an admin." }).catch(() => undefined);
    return NextResponse.json({ usage }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to update user plan" }, { status: 400 });
  }
}
