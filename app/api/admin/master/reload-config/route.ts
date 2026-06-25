/**
 * POST /api/admin/master/reload-config
 * Invalidates the in-memory runtime config cache for hot-reload settings.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/role-guard";
import { invalidateConfigCache, getConfig } from "@/lib/runtime-config";
import { logAuditEvent } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const { session, error } = await requireAdmin();
  if (error) return error;

  invalidateConfigCache();

  // Read active values after cache clear
  const [activeModel, fallbackModel, provider, baseUrl] = await Promise.all([
    getConfig("OPENROUTER_MODEL"),
    getConfig("OPENROUTER_FALLBACK_MODEL"),
    getConfig("MELDEX_BRAIN_PROVIDER"),
    getConfig("OPENROUTER_BASE_URL"),
  ]);

  await logAuditEvent({
    userId: session.user.id,
    action: "CONFIG_CACHE_RELOAD",
    resource: "runtime-config",
    success: true,
    ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
  });

  return NextResponse.json({
    success: true,
    message: "Runtime config cache cleared. Active values reloaded from vault.",
    activeModel: activeModel ?? "qwen/qwen3-coder:free",
    fallbackModel: fallbackModel ?? "liquid/lfm-2.5-1.2b-instruct:free",
    provider: provider ?? "local_ollama",
    baseUrl: baseUrl ?? "https://openrouter.ai/api/v1",
  });
}
