/**
 * GET /api/admin/master/settings  — list all settings with auto-discovery
 * POST /api/admin/master/settings — save/update a setting
 * Source badges: ENV | VAULT | MISSING
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/role-guard";
import { prisma } from "@/lib/prisma";
import { saveSetting, isVaultConfigured, maskSecret, decryptSecret } from "@/lib/secret-vault";
import { invalidateConfigCache, REQUIRES_RESTART, HOT_RELOAD } from "@/lib/runtime-config";
import { logAuditEvent } from "@/lib/audit";

const NO_CACHE = { "Cache-Control": "no-store, no-cache", "Pragma": "no-cache" };

const saveSchema = z.object({
  key: z.string().min(1).max(120),
  value: z.string(),
  category: z.string().default("general"),
  isSecret: z.boolean().default(false),
});

const KNOWN_KEYS: Array<{
  key: string; label: string; category: string; isSecret: boolean; description?: string;
}> = [
  { key: "DATABASE_URL", label: "Database URL", category: "database", isSecret: true },
  { key: "AUTH_SECRET", label: "Auth Secret", category: "auth", isSecret: true },
  { key: "NEXTAUTH_SECRET", label: "NextAuth Secret (legacy)", category: "auth", isSecret: true },
  { key: "NEXTAUTH_URL", label: "App URL", category: "auth", isSecret: false },
  { key: "AUTH_URL", label: "Auth URL", category: "auth", isSecret: false },
  { key: "APP_PUBLIC_URL", label: "Public App URL", category: "runtime", isSecret: false },
  { key: "OPENROUTER_API_KEY", label: "API Key", category: "openrouter", isSecret: true },
  { key: "OPENROUTER_BASE_URL", label: "Base URL", category: "openrouter", isSecret: false },
  { key: "OPENROUTER_MODEL", label: "Default Model", category: "openrouter", isSecret: false, description: "Active model — vault value overrides ENV" },
  { key: "OPENROUTER_FALLBACK_MODEL", label: "Fallback Model", category: "openrouter", isSecret: false, description: "Used when primary model hits rate limit" },
  { key: "MELDEX_BRAIN_PROVIDER", label: "Brain Provider", category: "openrouter", isSecret: false },
  { key: "QWEN_TEMPERATURE", label: "Qwen Temperature", category: "qwen", isSecret: false, description: "Default 0.2 for coding precision" },
  { key: "QWEN_MAX_TOKENS", label: "Qwen Max Tokens", category: "qwen", isSecret: false, description: "Output token cap for multi-file edits" },
  { key: "QWEN_TIMEOUT_MS", label: "Qwen Timeout", category: "qwen", isSecret: false, description: "Agent request timeout in milliseconds" },
  { key: "QWEN_RETRY_COUNT", label: "Qwen JSON Retries", category: "qwen", isSecret: false, description: "Retries for malformed/weak action JSON" },
  { key: "QWEN_CONTEXT_SIZE", label: "Qwen Context Size", category: "qwen", isSecret: false },
  { key: "QWEN_ACTION_MODE", label: "Qwen Action Mode", category: "qwen", isSecret: false },
  { key: "SERPER_API_KEY", label: "Serper API Key", category: "search", isSecret: true },
  { key: "BRAVE_API_KEY", label: "Brave Search API Key", category: "search", isSecret: true },
  { key: "R2_ACCOUNT_ID", label: "Account ID", category: "r2", isSecret: true },
  { key: "R2_ACCESS_KEY_ID", label: "Access Key ID", category: "r2", isSecret: true },
  { key: "R2_SECRET_ACCESS_KEY", label: "Secret Access Key", category: "r2", isSecret: true },
  { key: "R2_BUCKET", label: "Bucket Name", category: "r2", isSecret: false },
  { key: "R2_PUBLIC_URL", label: "Public URL", category: "r2", isSecret: false },
  { key: "GOOGLE_CLIENT_ID", label: "Google Client ID", category: "oauth", isSecret: false },
  { key: "GOOGLE_CLIENT_SECRET", label: "Google Client Secret", category: "oauth", isSecret: true },
  { key: "GITHUB_ID", label: "GitHub Client ID", category: "oauth", isSecret: false },
  { key: "GITHUB_SECRET", label: "GitHub Client Secret", category: "oauth", isSecret: true },
  { key: "AWS_INSTANCE_ID", label: "Instance ID", category: "aws", isSecret: false },
  { key: "AWS_REGION", label: "Region", category: "aws", isSecret: false },
  { key: "AWS_PUBLIC_IP", label: "Public IP", category: "aws", isSecret: false },
  { key: "AWS_DEPLOY_PATH", label: "Deploy Path", category: "aws", isSecret: false },
  { key: "AWS_SSH_USER", label: "SSH User", category: "aws", isSecret: false },
  { key: "AWS_SERVER_NAME", label: "Server Name", category: "aws", isSecret: false },
  { key: "SETTINGS_ENCRYPTION_KEY", label: "Encryption Key", category: "security", isSecret: true },
  { key: "PAYMENT_PROVIDER", label: "Payment Provider", category: "billing", isSecret: false, description: "manual, stripe, or razorpay" },
  { key: "PAYMENT_MODE", label: "Payment Mode", category: "billing", isSecret: false, description: "test or live" },
  { key: "PAYMENT_CURRENCY", label: "Payment Currency", category: "billing", isSecret: false },
  { key: "PAYMENT_SUCCESS_URL", label: "Checkout Success URL", category: "billing", isSecret: false },
  { key: "PAYMENT_CANCEL_URL", label: "Checkout Cancel URL", category: "billing", isSecret: false },
  { key: "PAYMENT_TAX_GST_PERCENT", label: "Tax / GST Percent", category: "billing", isSecret: false },
  { key: "STRIPE_SECRET_KEY", label: "Stripe Secret Key", category: "billing", isSecret: true },
  { key: "STRIPE_WEBHOOK_SECRET", label: "Stripe Webhook Secret", category: "billing", isSecret: true },
  { key: "RAZORPAY_KEY_ID", label: "Razorpay Key ID", category: "billing", isSecret: false },
  { key: "RAZORPAY_KEY_SECRET", label: "Razorpay Key Secret", category: "billing", isSecret: true },
  { key: "RAZORPAY_WEBHOOK_SECRET", label: "Razorpay Webhook Secret", category: "billing", isSecret: true },
];

function settingStatus(source: "ENV" | "VAULT" | "MISSING") {
  return source === "MISSING" ? "missing" : "active";
}

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const dbSettings = await prisma.systemSetting.findMany({ orderBy: { key: "asc" } });
  const dbMap = new Map(dbSettings.map((s) => [s.key, s]));
  const vaultOk = isVaultConfigured();

  const enriched = KNOWN_KEYS.map((meta) => {
    const envVal = process.env[meta.key];
    const dbRow = dbMap.get(meta.key);

    let source: "ENV" | "VAULT" | "MISSING" = "MISSING";
    let maskedValue: string | null = null;
    let updatedBy: string | null = null;
    let updatedAt: string | null = null;

    const isHotReload = HOT_RELOAD.has(meta.key);

    // For hot-reload keys: vault overrides ENV — show VAULT if both exist
    if (isHotReload && dbRow) {
      source = "VAULT";
      if (dbRow.isSecret && dbRow.valueEncrypted && vaultOk) {
        try { maskedValue = maskSecret(decryptSecret(dbRow.valueEncrypted)); }
        catch { maskedValue = dbRow.valueMasked; }
      } else {
        maskedValue = dbRow.valueMasked;
      }
      updatedBy = dbRow.updatedBy;
      updatedAt = dbRow.updatedAt.toISOString();
    } else if (envVal) {
      source = "ENV";
      maskedValue = meta.isSecret ? maskSecret(envVal) : envVal;
    } else if (dbRow) {
      source = "VAULT";
      if (dbRow.isSecret && dbRow.valueEncrypted && vaultOk) {
        try { maskedValue = maskSecret(decryptSecret(dbRow.valueEncrypted)); }
        catch { maskedValue = dbRow.valueMasked; }
      } else {
        maskedValue = dbRow.valueMasked;
      }
      updatedBy = dbRow.updatedBy;
      updatedAt = dbRow.updatedAt.toISOString();
    }

    return {
      key: meta.key, label: meta.label, category: meta.category,
      isSecret: meta.isSecret, description: meta.description ?? null,
      requireRestart: REQUIRES_RESTART.has(meta.key),
      hotReload: isHotReload,
      source, maskedValue, configured: source !== "MISSING",
      status: settingStatus(source),
      updatedBy, updatedAt,
    };
  });

  return NextResponse.json({ settings: enriched, vaultConfigured: vaultOk }, { headers: NO_CACHE });
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireAdmin();
  if (error) return error;

  const body = saveSchema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { key, value, category, isSecret } = body.data;
  if (isSecret && session.user.role !== "OWNER") {
    return NextResponse.json({ error: "Owner access required to update secrets" }, { status: 403 });
  }
  if (isSecret && !isVaultConfigured()) {
    return NextResponse.json({ error: "SETTINGS_ENCRYPTION_KEY not configured. Run: openssl rand -base64 32" }, { status: 503 });
  }

  const requireRestart = REQUIRES_RESTART.has(key);
  await saveSetting(key, value, {
    category, isSecret, requireRestart,
    updatedBy: session.user.email ?? session.user.id,
    ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  invalidateConfigCache(key);
  await logAuditEvent({
    userId: session.user.id, action: "SETTING_UPDATE", resource: key, success: true,
    metadata: { category, isSecret, requireRestart, masked: isSecret ? maskSecret(value) : value.slice(0, 30) },
    ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
  });

  return NextResponse.json({
    success: true,
    requireRestart,
    hotReload: HOT_RELOAD.has(key),
    source: "VAULT",
    maskedValue: isSecret ? maskSecret(value) : value,
  }, { headers: NO_CACHE });
}
