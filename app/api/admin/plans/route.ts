import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/role-guard";
import { prisma } from "@/lib/prisma";
import { listPlans, seedDefaultPlans } from "@/lib/plans-credits";
import { logAuditEvent } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const jsonList = z.union([z.array(z.string()), z.string()]).optional();

const planSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(80),
  slug: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/),
  description: z.string().max(500).optional().nullable(),
  priceMonthly: z.coerce.number().int().min(0),
  priceYearly: z.coerce.number().int().min(0),
  currency: z.string().min(1).max(8).default("USD"),
  monthlyCredits: z.coerce.number().int().min(0),
  weeklyCredits: z.coerce.number().int().min(0),
  fiveHourCredits: z.coerce.number().int().min(0),
  maxContextTokens: z.coerce.number().int().min(1000),
  maxWorkspaceCount: z.coerce.number().int().min(0),
  maxStorageMb: z.coerce.number().int().min(0),
  maxParallelTasks: z.coerce.number().int().min(1),
  priorityLevel: z.coerce.number().int().min(1).max(99),
  allowedModelsJson: jsonList,
  featuresJson: jsonList,
  stripePriceIdMonthly: z.string().max(200).optional().nullable(),
  stripePriceIdYearly: z.string().max(200).optional().nullable(),
  razorpayPlanIdMonthly: z.string().max(200).optional().nullable(),
  razorpayPlanIdYearly: z.string().max(200).optional().nullable(),
  paymentEnabled: z.boolean().default(false),
  trialDays: z.coerce.number().int().min(0).default(0),
  yearlyDiscount: z.coerce.number().int().min(0).max(100).default(0),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

function parseList(value: unknown) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string") return value.split(/\n|,/).map((item) => item.trim()).filter(Boolean);
  return [];
}

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  const plans = await listPlans();
  return NextResponse.json({ plans }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const { session, error } = await requireAdmin();
  if (error) return error;
  try {
    const body = await request.json().catch(() => ({}));
    if (body?.resetDefaults) {
      const plans = await seedDefaultPlans({ overwrite: true });
      await logAuditEvent({ userId: session.user.id, action: "PLANS_RESET_DEFAULTS", resource: "Plan", success: true });
      return NextResponse.json({ plans }, { headers: { "Cache-Control": "no-store" } });
    }
    const parsed = planSchema.parse(body);
    const data = {
      name: parsed.name,
      slug: parsed.slug,
      description: parsed.description,
      priceMonthly: parsed.priceMonthly,
      priceYearly: parsed.priceYearly,
      currency: parsed.currency,
      monthlyCredits: parsed.monthlyCredits,
      weeklyCredits: parsed.weeklyCredits,
      fiveHourCredits: parsed.fiveHourCredits,
      maxContextTokens: parsed.maxContextTokens,
      maxWorkspaceCount: parsed.maxWorkspaceCount,
      maxStorageMb: parsed.maxStorageMb,
      maxParallelTasks: parsed.maxParallelTasks,
      priorityLevel: parsed.priorityLevel,
      allowedModelsJson: parseList(parsed.allowedModelsJson),
      featuresJson: parseList(parsed.featuresJson),
      stripePriceIdMonthly: parsed.stripePriceIdMonthly || null,
      stripePriceIdYearly: parsed.stripePriceIdYearly || null,
      razorpayPlanIdMonthly: parsed.razorpayPlanIdMonthly || null,
      razorpayPlanIdYearly: parsed.razorpayPlanIdYearly || null,
      paymentEnabled: parsed.paymentEnabled,
      trialDays: parsed.trialDays,
      yearlyDiscount: parsed.yearlyDiscount,
      isActive: parsed.isActive,
      sortOrder: parsed.sortOrder,
    };
    const plan = parsed.id
      ? await prisma.plan.update({ where: { id: parsed.id }, data })
      : await prisma.plan.create({ data });
    await logAuditEvent({
      userId: session.user.id,
      action: parsed.id ? "PLAN_UPDATE" : "PLAN_CREATE",
      resource: plan.slug,
      success: true,
      metadata: { planId: plan.id },
    });
    return NextResponse.json({ plan }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to save plan" }, { status: 400 });
  }
}
