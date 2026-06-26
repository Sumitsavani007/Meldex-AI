/**
 * POST /api/admin/master/sync-env
 * Syncs all configured process.env values into the encrypted vault.
 * Only saves non-empty values. Skips boot-critical keys that must stay in env.
 */

import { NextRequest } from "next/server";
import { requireOwner } from "@/lib/role-guard";
import { saveSetting, isVaultConfigured, maskSecret } from "@/lib/secret-vault";
import { logAuditEvent } from "@/lib/audit";
import { REQUIRES_RESTART, invalidateConfigCache } from "@/lib/runtime-config";
import { prisma } from "@/lib/prisma";

// Keys that should stay in process.env only (boot-critical)
const SKIP_SYNC = new Set(["DATABASE_URL", "AUTH_SECRET", "NEXTAUTH_SECRET", "SETTINGS_ENCRYPTION_KEY"]);

const SYNC_KEYS: Array<{ key: string; category: string; isSecret: boolean }> = [
  { key: "NEXTAUTH_URL", category: "auth", isSecret: false },
  { key: "AUTH_URL", category: "auth", isSecret: false },
  { key: "APP_PUBLIC_URL", category: "runtime", isSecret: false },
  { key: "OPENROUTER_API_KEY", category: "openrouter", isSecret: true },
  { key: "OPENROUTER_BASE_URL", category: "openrouter", isSecret: false },
  { key: "OPENROUTER_MODEL", category: "openrouter", isSecret: false },
  { key: "OPENROUTER_FALLBACK_MODEL", category: "openrouter", isSecret: false },
  { key: "MELDEX_BRAIN_PROVIDER", category: "openrouter", isSecret: false },
  { key: "QWEN_TEMPERATURE", category: "qwen", isSecret: false },
  { key: "QWEN_MAX_TOKENS", category: "qwen", isSecret: false },
  { key: "QWEN_TIMEOUT_MS", category: "qwen", isSecret: false },
  { key: "QWEN_RETRY_COUNT", category: "qwen", isSecret: false },
  { key: "QWEN_CONTEXT_SIZE", category: "qwen", isSecret: false },
  { key: "QWEN_ACTION_MODE", category: "qwen", isSecret: false },
  { key: "SERPER_API_KEY", category: "search", isSecret: true },
  { key: "BRAVE_API_KEY", category: "search", isSecret: true },
  { key: "R2_ACCOUNT_ID", category: "r2", isSecret: true },
  { key: "R2_ACCESS_KEY_ID", category: "r2", isSecret: true },
  { key: "R2_SECRET_ACCESS_KEY", category: "r2", isSecret: true },
  { key: "R2_BUCKET", category: "r2", isSecret: false },
  { key: "R2_PUBLIC_URL", category: "r2", isSecret: false },
  { key: "GOOGLE_CLIENT_ID", category: "oauth", isSecret: false },
  { key: "GOOGLE_CLIENT_SECRET", category: "oauth", isSecret: true },
  { key: "GITHUB_ID", category: "oauth", isSecret: false },
  { key: "GITHUB_SECRET", category: "oauth", isSecret: true },
  { key: "AWS_INSTANCE_ID", category: "aws", isSecret: false },
  { key: "AWS_REGION", category: "aws", isSecret: false },
  { key: "AWS_PUBLIC_IP", category: "aws", isSecret: false },
  { key: "AWS_DEPLOY_PATH", category: "aws", isSecret: false },
  { key: "AWS_SSH_USER", category: "aws", isSecret: false },
  { key: "AWS_SERVER_NAME", category: "aws", isSecret: false },
];

export async function POST(req: NextRequest) {
  const { session, error } = await requireOwner();
  if (error) return error;

  if (!isVaultConfigured()) {
    return Response.json({ error: "SETTINGS_ENCRYPTION_KEY not configured" }, { status: 503 });
  }

  const url = new URL(req.url);
  const overwrite = url.searchParams.get("overwrite") === "true";
  const existingRows = await prisma.systemSetting.findMany({ select: { key: true } });
  const existing = new Set(existingRows.map((r) => r.key));
  const results: Array<{ key: string; status: "synced" | "skipped" | "missing" | "exists" }> = [];
  const updatedBy = session.user.email ?? session.user.id;
  const ipAddress = req.headers.get("x-forwarded-for") ?? undefined;

  for (const item of SYNC_KEYS) {
    if (SKIP_SYNC.has(item.key)) {
      results.push({ key: item.key, status: "skipped" });
      continue;
    }
    const val = process.env[item.key];
    if (!val) {
      results.push({ key: item.key, status: "missing" });
      continue;
    }
    if (existing.has(item.key) && !overwrite) {
      results.push({ key: item.key, status: "exists" });
      continue;
    }
    await saveSetting(item.key, val, {
      category: item.category,
      isSecret: item.isSecret,
      requireRestart: REQUIRES_RESTART.has(item.key),
      updatedBy,
      ipAddress,
    });
    invalidateConfigCache(item.key);
    results.push({ key: item.key, status: "synced" });
  }

  const synced = results.filter((r) => r.status === "synced").length;

  await logAuditEvent({
    userId: session.user.id,
    action: "ENV_VAULT_SYNC",
    resource: "system-settings",
    success: true,
    metadata: { synced, total: results.length, masked: results.filter((r) => r.status === "synced").map((r) => ({ key: r.key, masked: maskSecret(process.env[r.key] ?? "") })) },
    ipAddress,
  });

  return Response.json({ success: true, synced, results }, { headers: { "Cache-Control": "no-store" } });
}
