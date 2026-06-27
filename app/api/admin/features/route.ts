import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/role-guard";
import { prisma } from "@/lib/prisma";
import { listPlanFeatures, seedDefaultFeatureFlags } from "@/lib/plans-credits";
import { logAuditEvent } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("updatePlanFeature"),
    planId: z.string().min(1),
    featureId: z.string().min(1),
    enabled: z.boolean(),
    limitInt: z.coerce.number().int().min(0).optional().nullable(),
  }),
  z.object({
    action: z.literal("updateFeatureFlag"),
    featureId: z.string().min(1),
    isActive: z.boolean().optional(),
    defaultEnabled: z.boolean().optional(),
  }),
]);

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  const [features, plans] = await Promise.all([
    listPlanFeatures(),
    prisma.plan.findMany({ orderBy: [{ sortOrder: "asc" }, { priorityLevel: "asc" }] }),
  ]);
  return NextResponse.json({ features, plans }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const { session, error } = await requireAdmin();
  if (error) return error;
  try {
    await seedDefaultFeatureFlags();
    const body = schema.parse(await request.json().catch(() => ({})));
    if (body.action === "updateFeatureFlag") {
      const feature = await prisma.featureFlag.update({
        where: { id: body.featureId },
        data: {
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
          ...(body.defaultEnabled !== undefined ? { defaultEnabled: body.defaultEnabled } : {}),
        },
      });
      await logAuditEvent({ userId: session.user.id, action: "FEATURE_FLAG_UPDATE", resource: feature.key, success: true, metadata: { featureId: feature.id } });
      return NextResponse.json({ feature }, { headers: { "Cache-Control": "no-store" } });
    }
    const planFeature = await prisma.planFeature.upsert({
      where: { planId_featureId: { planId: body.planId, featureId: body.featureId } },
      update: { enabled: body.enabled, limitInt: body.limitInt ?? null },
      create: { planId: body.planId, featureId: body.featureId, enabled: body.enabled, limitInt: body.limitInt ?? null },
      include: { feature: true, plan: true },
    });
    await logAuditEvent({ userId: session.user.id, action: "PLAN_FEATURE_UPDATE", resource: `${planFeature.plan.slug}:${planFeature.feature.key}`, success: true, metadata: { planId: body.planId, featureId: body.featureId, enabled: body.enabled } });
    return NextResponse.json({ planFeature }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Feature update failed" }, { status: 400 });
  }
}
