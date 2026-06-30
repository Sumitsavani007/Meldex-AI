import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/role-guard";
import { prisma } from "@/lib/prisma";
import { listModelUsageConfigs, seedDefaultModelUsageConfigs, seedDefaultStudioUsageConfigs } from "@/lib/plans-credits";
import { logAuditEvent } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  id: z.string().optional(),
  provider: z.string().min(1).max(80),
  model: z.string().min(1).max(160),
  inputCreditMultiplier: z.coerce.number().min(0),
  outputCreditMultiplier: z.coerce.number().min(0),
  reasoningCreditMultiplier: z.coerce.number().min(0),
  cachedCreditMultiplier: z.coerce.number().min(0),
  toolCallCreditCost: z.coerce.number().min(0),
  previewCreditCost: z.coerce.number().min(0),
  fileReadCreditCost: z.coerce.number().min(0),
  fileWriteCreditCost: z.coerce.number().min(0),
  memoryReadCreditCost: z.coerce.number().min(0),
  memoryWriteCreditCost: z.coerce.number().min(0),
  fallbackEstimateCredits: z.coerce.number().int().min(1),
  retryMultiplier: z.coerce.number().min(0),
  autofixMultiplier: z.coerce.number().min(0),
  estimatedCostPerCreditCents: z.coerce.number().min(0),
  isActive: z.boolean().default(true),
});

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  const configs = await listModelUsageConfigs();
  return NextResponse.json({ configs }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const { session, error } = await requireAdmin();
  if (error) return error;
  try {
    const body = await request.json().catch(() => ({}));
    if (body?.resetDefaults) {
      const config = await seedDefaultModelUsageConfigs({ overwrite: true });
      const studioConfigs = await seedDefaultStudioUsageConfigs({ overwrite: true });
      await logAuditEvent({ userId: session.user.id, action: "USAGE_PRICING_RESET", resource: "ModelUsageConfig", success: true });
      return NextResponse.json({ configs: [config, ...studioConfigs] }, { headers: { "Cache-Control": "no-store" } });
    }
    const parsed = schema.parse(body);
    const data = { ...parsed, id: undefined };
    const config = parsed.id
      ? await prisma.modelUsageConfig.update({ where: { id: parsed.id }, data })
      : await prisma.modelUsageConfig.upsert({
          where: { provider_model: { provider: parsed.provider, model: parsed.model } },
          update: data,
          create: data,
        });
    await logAuditEvent({
      userId: session.user.id,
      action: parsed.id ? "USAGE_PRICING_UPDATE" : "USAGE_PRICING_CREATE",
      resource: `${config.provider}:${config.model}`,
      success: true,
    });
    return NextResponse.json({ config }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to save usage pricing" }, { status: 400 });
  }
}
