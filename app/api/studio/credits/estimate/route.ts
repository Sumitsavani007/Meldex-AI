import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/role-guard";
import { calculateStudioCredits, getUserCreditBalance, precheckStudioCreditRequest } from "@/lib/plans-credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  kind: z.enum(["image", "video", "audio", "voice"]).default("image"),
  provider: z.string().default("comfy_cloud"),
  model: z.string().optional(),
  width: z.number().int().min(64).max(4096).optional(),
  height: z.number().int().min(64).max(4096).optional(),
  imageCount: z.number().int().min(1).max(8).default(1),
  referenceImages: z.number().int().min(0).max(16).default(0),
  advancedSettings: z.number().int().min(0).max(20).default(0),
  durationSec: z.number().int().min(1).max(120).optional(),
  fps: z.number().int().min(1).max(120).optional(),
  aspectRatio: z.string().optional(),
  upscaling: z.boolean().default(false),
  audio: z.boolean().default(false),
});

export async function POST(request: Request) {
  const { session, error } = await requireAuth();
  if (error) return error;
  try {
    const body = schema.parse(await request.json().catch(() => ({})));
    const estimate = await calculateStudioCredits(body);
    const balance = await getUserCreditBalance(session.user.id);
    const precheck = await precheckStudioCreditRequest({ userId: session.user.id, estimate });
    const enrichedBalance = {
      ...balance.balance,
      estimatedRemainingGenerations: Math.floor(balance.balance.totalRemaining / Math.max(1, estimate.credits)),
    };
    return NextResponse.json({
      estimate: {
        credits: estimate.credits,
        provider: estimate.provider,
        model: estimate.model,
        queueSeconds: estimate.queueSeconds,
        processingSeconds: estimate.processingSeconds,
        breakdown: estimate.breakdown,
      },
      balance: enrichedBalance,
      plan: {
        id: balance.plan.id,
        name: balance.plan.name,
        slug: balance.plan.slug,
        monthlyCredits: balance.plan.monthlyCredits,
        priorityLevel: balance.plan.priorityLevel,
        maxVideoLength: balance.plan.priorityLevel >= 4 ? 60 : balance.plan.priorityLevel >= 3 ? 30 : balance.plan.priorityLevel >= 2 ? 20 : 10,
        maxResolution: balance.plan.priorityLevel >= 3 ? "1344" : "1024",
      },
      allowed: precheck.ok,
      blocked: precheck.ok ? null : {
        code: precheck.legacyCode || precheck.code,
        message: precheck.message,
        recommendedPlan: precheck.recommendedPlan,
        resetAt: precheck.resetAt,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unable to estimate credits" }, { status: 400 });
  }
}
