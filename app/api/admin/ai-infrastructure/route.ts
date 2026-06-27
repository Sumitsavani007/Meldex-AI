import { NextResponse } from "next/server";
import { z } from "zod";
import { ModelProvider, QueueStatus } from "@prisma/client";
import { requireAdmin } from "@/lib/role-guard";
import { prisma } from "@/lib/prisma";
import { listAiInfrastructure, seedAiInfrastructureDefaults } from "@/lib/ai-infrastructure";
import { logAuditEvent } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const providerSchema = z.object({
  action: z.literal("update_provider"),
  id: z.string(),
  name: z.string().min(1).max(120).optional(),
  baseUrl: z.string().max(500).nullable().optional(),
  apiKeySettingKey: z.string().max(120).nullable().optional(),
  defaultModel: z.string().min(1).max(240).optional(),
  priority: z.coerce.number().int().min(1).max(999).optional(),
  isEnabled: z.boolean().optional(),
  isFallbackEnabled: z.boolean().optional(),
  maxContextTokens: z.coerce.number().int().min(1024).optional(),
  costMultiplier: z.coerce.number().min(0).optional(),
  retryCount: z.coerce.number().int().min(0).max(5).optional(),
  timeoutMs: z.coerce.number().int().min(1000).max(300000).optional(),
  rateLimitPerMinute: z.coerce.number().int().min(1).optional(),
  rateLimitPerHour: z.coerce.number().int().min(1).optional(),
});

const rateLimitSchema = z.object({
  action: z.literal("update_rate_limit"),
  id: z.string(),
  description: z.string().max(200).optional(),
  requestsPerMinute: z.coerce.number().int().min(1).optional(),
  requestsPerHour: z.coerce.number().int().min(1).optional(),
  requestsPerDay: z.coerce.number().int().min(1).optional(),
  burst: z.coerce.number().int().min(1).optional(),
  isEnabled: z.boolean().optional(),
});

const queueSchema = z.object({
  action: z.enum(["pause_queue_item", "resume_queue_item", "cancel_queue_item"]),
  id: z.string(),
});

const healthSchema = z.object({
  action: z.literal("mark_provider_health"),
  id: z.string(),
  healthStatus: z.enum(["healthy", "degraded", "unhealthy", "unknown"]),
  healthScore: z.coerce.number().int().min(0).max(100).optional(),
  lastError: z.string().max(500).nullable().optional(),
});

const resetSchema = z.object({ action: z.literal("reset_defaults") });

const actionSchema = z.discriminatedUnion("action", [
  providerSchema,
  rateLimitSchema,
  queueSchema,
  healthSchema,
  resetSchema,
]);

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  const data = await listAiInfrastructure();
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const { session, error } = await requireAdmin();
  if (error) return error;

  try {
    const body = actionSchema.parse(await request.json().catch(() => ({})));
    if (body.action === "reset_defaults") {
      await seedAiInfrastructureDefaults();
      await logAuditEvent({ userId: session.user.id, action: "AI_INFRA_DEFAULTS_SEEDED", resource: "AiProviderConfig", success: true });
      return NextResponse.json(await listAiInfrastructure(), { headers: { "Cache-Control": "no-store" } });
    }

    if (body.action === "update_provider") {
      const { id, name, baseUrl, apiKeySettingKey, defaultModel, priority, isEnabled, isFallbackEnabled, maxContextTokens, costMultiplier, retryCount, timeoutMs, rateLimitPerMinute, rateLimitPerHour } = body;
      const data = { name, baseUrl, apiKeySettingKey, defaultModel, priority, isEnabled, isFallbackEnabled, maxContextTokens, costMultiplier, retryCount, timeoutMs, rateLimitPerMinute, rateLimitPerHour };
      const provider = await prisma.aiProviderConfig.update({ where: { id }, data });
      await logAuditEvent({ userId: session.user.id, action: "AI_PROVIDER_UPDATE", resource: "AiProviderConfig", resourceId: id, success: true, metadata: { provider: provider.provider, model: provider.defaultModel } });
      return NextResponse.json({ provider }, { headers: { "Cache-Control": "no-store" } });
    }

    if (body.action === "update_rate_limit") {
      const { id, description, requestsPerMinute, requestsPerHour, requestsPerDay, burst, isEnabled } = body;
      const data = { description, requestsPerMinute, requestsPerHour, requestsPerDay, burst, isEnabled };
      const rule = await prisma.rateLimitRule.update({ where: { id }, data });
      await logAuditEvent({ userId: session.user.id, action: "RATE_LIMIT_UPDATE", resource: "RateLimitRule", resourceId: id, success: true, metadata: { key: rule.key } });
      return NextResponse.json({ rule }, { headers: { "Cache-Control": "no-store" } });
    }

    if (body.action === "mark_provider_health") {
      const provider = await prisma.aiProviderConfig.update({
        where: { id: body.id },
        data: {
          healthStatus: body.healthStatus,
          healthScore: body.healthScore,
          lastError: body.lastError,
          lastHealthCheckAt: new Date(),
        },
      });
      await prisma.providerHealthEvent.create({
        data: {
          providerConfigId: provider.id,
          provider: provider.provider as ModelProvider,
          model: provider.defaultModel,
          status: provider.healthStatus,
          errorMessage: provider.lastError,
        },
      });
      await logAuditEvent({ userId: session.user.id, action: "AI_PROVIDER_HEALTH_MARK", resource: "AiProviderConfig", resourceId: body.id, success: true, metadata: { status: provider.healthStatus } });
      return NextResponse.json({ provider }, { headers: { "Cache-Control": "no-store" } });
    }

    const status =
      body.action === "pause_queue_item" ? QueueStatus.PAUSED :
      body.action === "resume_queue_item" ? QueueStatus.QUEUED :
      QueueStatus.CANCELED;
    const queueItem = await prisma.aiRequestQueue.update({
      where: { id: body.id },
      data: {
        status,
        canceledAt: status === QueueStatus.CANCELED ? new Date() : null,
      },
    });
    await logAuditEvent({ userId: session.user.id, action: `AI_QUEUE_${status}`, resource: "AiRequestQueue", resourceId: body.id, success: true });
    return NextResponse.json({ queueItem }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "AI infrastructure update failed" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
