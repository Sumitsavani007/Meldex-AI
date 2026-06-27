/**
 * lib/runtime-config.ts
 *
 * Priority resolution:
 *
 *  Boot-critical (DATABASE_URL, NEXTAUTH_SECRET, etc.):
 *    process.env → default
 *    These are NEVER overridden by DB/vault values.
 *
 *  Hot-reloadable (OPENROUTER_MODEL, MELDEX_BRAIN_PROVIDER, etc.):
 *    vault (DB) → process.env → default
 *    Admin can save a value to vault and it takes effect immediately
 *    without a PM2 restart.
 *
 *  All other settings:
 *    process.env → vault → default
 */

import { getSetting } from "@/lib/secret-vault";

// Settings that MUST come from process.env — never from DB
const BOOT_CRITICAL = new Set([
  "DATABASE_URL",
  "NEXTAUTH_SECRET",
  "AUTH_SECRET",
  "AUTH_URL",
  "NEXTAUTH_URL",
  "SETTINGS_ENCRYPTION_KEY",
]);

// Settings that require app restart when changed
export const REQUIRES_RESTART = new Set([
  "DATABASE_URL",
  "NEXTAUTH_SECRET",
  "AUTH_SECRET",
  "NEXTAUTH_URL",
  "AUTH_URL",
  "SETTINGS_ENCRYPTION_KEY",
]);

// Settings that can be hot-reloaded — vault OVERRIDES process.env for these
export const HOT_RELOAD = new Set([
  "APP_PUBLIC_URL",
  "OPENROUTER_API_KEY",
  "OPENROUTER_MODEL",
  "OPENROUTER_BASE_URL",
  "OPENROUTER_FALLBACK_MODEL",
  "MELDEX_BRAIN_PROVIDER",
  "QWEN_TEMPERATURE",
  "QWEN_MAX_TOKENS",
  "QWEN_TIMEOUT_MS",
  "QWEN_RETRY_COUNT",
  "QWEN_CONTEXT_SIZE",
  "QWEN_ACTION_MODE",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_PUBLIC_URL",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GITHUB_ID",
  "GITHUB_SECRET",
  "SERPER_API_KEY",
  "BRAVE_API_KEY",
  "AWS_INSTANCE_ID",
  "AWS_REGION",
  "AWS_PUBLIC_IP",
  "PAYMENT_PROVIDER",
  "PAYMENT_MODE",
  "PAYMENT_CURRENCY",
  "PAYMENT_SUCCESS_URL",
  "PAYMENT_CANCEL_URL",
  "PAYMENT_TAX_GST_PERCENT",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
  "RAZORPAY_WEBHOOK_SECRET",
]);

// In-memory cache for hot-reload settings
const runtimeCache = new Map<string, { value: string; cachedAt: number }>();
const CACHE_TTL_MS = 60_000; // 1 minute

/**
 * Get a config value with correct priority per key type.
 */
export async function getConfig(key: string, defaultValue?: string): Promise<string | undefined> {
  // Boot-critical: only from process.env, never vault
  if (BOOT_CRITICAL.has(key)) {
    return process.env[key] ?? defaultValue;
  }

  // Hot-reload: vault wins over process.env so admin changes apply live
  if (HOT_RELOAD.has(key)) {
    // Check in-memory cache first
    const cached = runtimeCache.get(key);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
      return cached.value;
    }
    // Try vault first — vault value overrides process.env for hot-reload keys
    try {
      const dbVal = await getSetting(key);
      if (dbVal) {
        runtimeCache.set(key, { value: dbVal, cachedAt: Date.now() });
        return dbVal;
      }
    } catch {
      // DB not available — fall through to process.env
    }
    // Fall back to process.env, then default
    const envVal = process.env[key];
    if (envVal) {
      runtimeCache.set(key, { value: envVal, cachedAt: Date.now() });
      return envVal;
    }
    return defaultValue;
  }

  // All other settings: process.env wins, then vault, then default
  const envVal = process.env[key];
  if (envVal) return envVal;

  try {
    const dbVal = await getSetting(key);
    if (dbVal) return dbVal;
  } catch {
    // DB not available — fall through to default
  }

  return defaultValue;
}

export const getRuntimeSetting = getConfig;

export async function getSecretSetting(key: string): Promise<string | undefined> {
  return getConfig(key);
}

export async function getNumberSetting(key: string, defaultValue: number): Promise<number> {
  const value = await getConfig(key);
  if (!value) return defaultValue;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

export async function getBooleanSetting(key: string, defaultValue = false): Promise<boolean> {
  const value = await getConfig(key);
  if (value === undefined) return defaultValue;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export async function getProviderConfig(provider: "openrouter" | "r2" | "google" | "github" | "search") {
  if (provider === "openrouter") {
    return {
      provider,
      apiKey: await getSecretSetting("OPENROUTER_API_KEY"),
      baseUrl: await getRuntimeSetting("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
      model: await getRuntimeSetting("OPENROUTER_MODEL", "qwen/qwen3-coder:free"),
      fallbackModel: await getRuntimeSetting("OPENROUTER_FALLBACK_MODEL"),
      temperature: await getNumberSetting("QWEN_TEMPERATURE", 0.2),
      maxTokens: await getNumberSetting("QWEN_MAX_TOKENS", 8192),
      timeoutMs: await getNumberSetting("QWEN_TIMEOUT_MS", 90000),
      retryCount: await getNumberSetting("QWEN_RETRY_COUNT", 2),
      contextSize: await getNumberSetting("QWEN_CONTEXT_SIZE", 128000),
      actionMode: await getRuntimeSetting("QWEN_ACTION_MODE", "autonomous"),
    };
  }
  if (provider === "r2") {
    return {
      provider,
      accountId: await getSecretSetting("R2_ACCOUNT_ID"),
      accessKeyId: await getSecretSetting("R2_ACCESS_KEY_ID"),
      secretAccessKey: await getSecretSetting("R2_SECRET_ACCESS_KEY"),
      bucket: await getRuntimeSetting("R2_BUCKET"),
      publicUrl: await getRuntimeSetting("R2_PUBLIC_URL"),
    };
  }
  if (provider === "google") {
    return {
      provider,
      clientId: await getRuntimeSetting("GOOGLE_CLIENT_ID"),
      clientSecret: await getSecretSetting("GOOGLE_CLIENT_SECRET"),
    };
  }
  if (provider === "github") {
    return {
      provider,
      clientId: await getRuntimeSetting("GITHUB_ID"),
      clientSecret: await getSecretSetting("GITHUB_SECRET"),
    };
  }
  return {
    provider,
    serperApiKey: await getSecretSetting("SERPER_API_KEY"),
    braveApiKey: await getSecretSetting("BRAVE_API_KEY"),
  };
}

/**
 * Invalidate the hot-reload cache for a specific key (or all keys).
 */
export function invalidateConfigCache(key?: string): void {
  if (key) {
    runtimeCache.delete(key);
  } else {
    runtimeCache.clear();
  }
}

export function clearRuntimeConfigCache(key?: string): void {
  invalidateConfigCache(key);
}

export async function reloadRuntimeConfig() {
  invalidateConfigCache();
  return readRuntimeConfig();
}

/**
 * Get multiple config values at once.
 */
export async function getConfigs(keys: string[]): Promise<Record<string, string | undefined>> {
  const entries = await Promise.all(keys.map(async (k) => [k, await getConfig(k)] as const));
  return Object.fromEntries(entries);
}

/**
 * Synchronous env-only config (safe to use in edge/middleware contexts).
 */
export function getEnvConfig(key: string, defaultValue?: string): string | undefined {
  return process.env[key] ?? defaultValue;
}

export type RuntimeConfig = {
  openRouterModel: string;
  openRouterProvider: string;
  awsRegion: string;
  r2Bucket: string;
  r2PublicUrl: string;
  cloudflareAccountId: string;
  integrationWebhookUrl: string;
  deploymentTarget: string;
  githubRepo: string;
  databaseProvider: string;
  diagnosticsMode: "standard" | "verbose";
  vaultNote: string;
  // Compatibility with the Phase 2 brain registry shape on the production server.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  brains?: any;
};

const RUNTIME_KEY_MAP: Record<keyof Omit<RuntimeConfig, "brains">, string> = {
  openRouterModel: "OPENROUTER_MODEL",
  openRouterProvider: "MELDEX_BRAIN_PROVIDER",
  awsRegion: "AWS_REGION",
  r2Bucket: "R2_BUCKET",
  r2PublicUrl: "R2_PUBLIC_URL",
  cloudflareAccountId: "CLOUDFLARE_ACCOUNT_ID",
  integrationWebhookUrl: "INTEGRATION_WEBHOOK_URL",
  deploymentTarget: "DEPLOYMENT_TARGET",
  githubRepo: "GITHUB_REPO",
  databaseProvider: "DATABASE_PROVIDER",
  diagnosticsMode: "DIAGNOSTICS_MODE",
  vaultNote: "VAULT_NOTE",
};

export async function readRuntimeConfig(): Promise<RuntimeConfig> {
  const entries = await Promise.all(
    Object.entries(RUNTIME_KEY_MAP).map(async ([field, key]) => [field, await getConfig(key)] as const)
  );
  const values = Object.fromEntries(entries) as Partial<Record<keyof RuntimeConfig, string>>;

  return {
    openRouterModel: values.openRouterModel || "qwen/qwen3-coder:free",
    openRouterProvider: values.openRouterProvider || "openrouter",
    awsRegion: values.awsRegion || process.env.AWS_REGION || "",
    r2Bucket: values.r2Bucket || "",
    r2PublicUrl: values.r2PublicUrl || "",
    cloudflareAccountId: values.cloudflareAccountId || process.env.CLOUDFLARE_ACCOUNT_ID || "",
    integrationWebhookUrl: values.integrationWebhookUrl || "",
    deploymentTarget: values.deploymentTarget || "aws",
    githubRepo: values.githubRepo || "",
    databaseProvider: values.databaseProvider || "postgres",
    diagnosticsMode: values.diagnosticsMode === "verbose" ? "verbose" : "standard",
    vaultNote: values.vaultNote || "",
  };
}

export async function writeRuntimeConfig(input: Partial<RuntimeConfig>): Promise<RuntimeConfig> {
  const { saveSetting } = await import("@/lib/secret-vault");

  await Promise.all(
    Object.entries(input).map(async ([field, value]) => {
      if (field === "brains" || value === undefined || value === null) return;
      const key = RUNTIME_KEY_MAP[field as keyof Omit<RuntimeConfig, "brains">];
      if (!key) return;
      await saveSetting(key, String(value), { category: "runtime" });
      invalidateConfigCache(key);
    })
  );

  return readRuntimeConfig();
}
