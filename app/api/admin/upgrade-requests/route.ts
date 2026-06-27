import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/role-guard";
import { prisma } from "@/lib/prisma";
import { assignUserPlan, createUserNotification, grantExtraCredits } from "@/lib/plans-credits";
import { logAuditEvent } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approve"),
    requestId: z.string().min(1),
    planId: z.string().min(1).optional(),
    expiresAt: z.string().datetime().optional().nullable(),
    bonusCredits: z.coerce.number().int().min(0).optional(),
    adminNote: z.string().max(500).optional(),
  }),
  z.object({
    action: z.literal("reject"),
    requestId: z.string().min(1),
    adminNote: z.string().max(500).optional(),
  }),
]);

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const requests = await prisma.upgradeRequest.findMany({
      include: {
        user: { select: { id: true, email: true, name: true } },
        currentPlan: true,
        requestedPlan: true,
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 100,
    });
    return NextResponse.json({ requests }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Upgrade requests unavailable" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const { session, error } = await requireAdmin();
  if (error) return error;

  try {
    const body = actionSchema.parse(await request.json().catch(() => ({})));
    const upgradeRequest = await prisma.upgradeRequest.findUnique({
      where: { id: body.requestId },
      include: { user: true, requestedPlan: true },
    });
    if (!upgradeRequest) return NextResponse.json({ error: "Upgrade request not found" }, { status: 404 });
    if (upgradeRequest.status !== "PENDING") return NextResponse.json({ error: "Upgrade request is already reviewed" }, { status: 400 });

    if (body.action === "approve") {
      const planId = body.planId || upgradeRequest.requestedPlanId;
      const assigned = await assignUserPlan({
        userId: upgradeRequest.userId,
        planId,
        assignedByAdmin: true,
        endsAt: body.expiresAt ? new Date(body.expiresAt) : null,
      });
      if (body.bonusCredits && body.bonusCredits > 0) {
        await grantExtraCredits(upgradeRequest.userId, body.bonusCredits, "Upgrade approval bonus credits");
      }
      const updated = await prisma.upgradeRequest.update({
        where: { id: upgradeRequest.id },
        data: {
          status: "APPROVED",
          reviewedBy: session.user.id,
          reviewedAt: new Date(),
          adminNote: body.adminNote || null,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
          bonusCredits: body.bonusCredits || null,
        },
        include: { user: { select: { id: true, email: true, name: true } }, currentPlan: true, requestedPlan: true },
      });
      await createUserNotification({
        userId: upgradeRequest.userId,
        type: "upgrade_approved",
        title: "Upgrade approved",
        message: `Your plan is now ${assigned.plan.name}.`,
        metadata: { requestId: upgradeRequest.id, planId },
      });
      await logAuditEvent({ userId: session.user.id, action: "UPGRADE_REQUEST_APPROVED", resource: upgradeRequest.user.email, success: true, metadata: { requestId: upgradeRequest.id, planId, bonusCredits: body.bonusCredits || 0 } });
      return NextResponse.json({ request: updated, assigned }, { headers: { "Cache-Control": "no-store" } });
    }

    const updated = await prisma.upgradeRequest.update({
      where: { id: upgradeRequest.id },
      data: {
        status: "REJECTED",
        reviewedBy: session.user.id,
        reviewedAt: new Date(),
        adminNote: body.adminNote || "Manual upgrade request rejected.",
      },
      include: { user: { select: { id: true, email: true, name: true } }, currentPlan: true, requestedPlan: true },
    });
    await createUserNotification({
      userId: upgradeRequest.userId,
      type: "upgrade_rejected",
      title: "Upgrade request rejected",
      message: body.adminNote || "Your upgrade request was rejected by an admin.",
      metadata: { requestId: upgradeRequest.id },
    });
    await logAuditEvent({ userId: session.user.id, action: "UPGRADE_REQUEST_REJECTED", resource: upgradeRequest.user.email, success: true, metadata: { requestId: upgradeRequest.id } });
    return NextResponse.json({ request: updated }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Upgrade request update failed" }, { status: 400 });
  }
}
