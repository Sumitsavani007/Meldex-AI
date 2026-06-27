import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/role-guard";
import { prisma } from "@/lib/prisma";
import { createUserNotification, getUserPlanLimits, listPlans } from "@/lib/plans-credits";
import { getPaymentConfig } from "@/lib/payment-gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  planId: z.string().min(1),
  message: z.string().max(500).optional(),
});

export async function GET() {
  const { session, error } = await requireAuth();
  if (error) return error;

  try {
    const [plans, usage, requests, notifications, paymentConfig, subscriptions, invoices, paymentEvents] = await Promise.all([
      listPlans(),
      getUserPlanLimits(session.user.id),
      prisma.upgradeRequest.findMany({
        where: { userId: session.user.id },
        include: { requestedPlan: true, currentPlan: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.userNotification.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: "desc" },
        take: 12,
      }),
      getPaymentConfig(),
      prisma.subscription.findMany({
        where: { userId: session.user.id },
        include: { plan: true },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),
      prisma.invoice.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.paymentEvent.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);

    return NextResponse.json({
      plans,
      usage,
      requests,
      notifications,
      paymentConfig: {
        provider: paymentConfig.provider,
        mode: paymentConfig.mode,
        currency: paymentConfig.currency,
        enabled: paymentConfig.provider !== "manual" && (paymentConfig.provider === "stripe" ? paymentConfig.stripeConfigured : paymentConfig.razorpayConfigured),
        stripeConfigured: paymentConfig.stripeConfigured,
        razorpayConfigured: paymentConfig.razorpayConfigured,
      },
      subscriptions,
      activeSubscription: subscriptions.find((item) => ["ACTIVE", "TRIALING", "PAST_DUE"].includes(item.status)) || null,
      invoices,
      paymentEvents,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Billing unavailable" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const { session, error } = await requireAuth();
  if (error) return error;

  try {
    const body = requestSchema.parse(await request.json().catch(() => ({})));
    const [usage, targetPlan] = await Promise.all([
      getUserPlanLimits(session.user.id),
      prisma.plan.findUnique({ where: { id: body.planId } }),
    ]);
    if (!targetPlan || !targetPlan.isActive) return NextResponse.json({ error: "Plan unavailable" }, { status: 404 });
    if (targetPlan.priorityLevel <= usage.plan.priorityLevel) {
      return NextResponse.json({ error: "Select a higher plan to request an upgrade." }, { status: 400 });
    }

    const existing = await prisma.upgradeRequest.findFirst({
      where: { userId: session.user.id, requestedPlanId: targetPlan.id, status: "PENDING" },
      include: { requestedPlan: true, currentPlan: true },
      orderBy: { createdAt: "desc" },
    });
    if (existing) return NextResponse.json({ request: existing, message: "Upgrade request is already pending." }, { headers: { "Cache-Control": "no-store" } });

    const upgradeRequest = await prisma.upgradeRequest.create({
      data: {
        userId: session.user.id,
        currentPlanId: usage.plan.id,
        requestedPlanId: targetPlan.id,
        message: body.message || "User requested manual upgrade. Payment gateway is coming soon.",
      },
      include: { requestedPlan: true, currentPlan: true },
    });
    await createUserNotification({
      userId: session.user.id,
      type: "upgrade_requested",
      title: "Upgrade request sent",
      message: `Your request for ${targetPlan.name} is pending admin approval.`,
      metadata: { requestId: upgradeRequest.id, planId: targetPlan.id },
    });

    return NextResponse.json({ request: upgradeRequest }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Upgrade request failed" }, { status: 400 });
  }
}
