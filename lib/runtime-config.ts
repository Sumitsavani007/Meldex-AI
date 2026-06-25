/**
 * lib/runtime-config.ts
 *
 * Priority resolution:
 *  1. process.env (always wins — required for boot-critical settings)
 *  2. Encrypted SystemSetting from DB
 *  3. Safe default
 *
 * Boot-critical settings (DATABASE_URL, NEXTAUTH_SECRET, AUTH_SECRET) must
 * exist in process.env and are NOT overridden by DB values.
 */

import { getSetting } from "@/lib/secret-vault";

// Settings that MUST come from process.env — never from DB
const BOOT_CRITICAL = new Set([
  "DATABASE_URL",
  "NEXTAUTH_SECRET",
  "AUTH_SECRET",
  "AUTH_URL",
  "NEXTAUTH_URL",
]);

// Settings that require app restart when changed
export const REQUIRES_RESTART = new Set([
  "DATABASE_URL",
  "NEXTAUTH_SECRET",
  "AUTH_SECRET",
  "NEXTAUTH_URL",
  "AUTH_URL",
]);

// Settings that can be hot-reloaded
export const HOT_RELOAD = new Set([
  "OPENROUTER_MODEL",
  "OPENROUTER_BASE_URL",
  "R2_PUBLIC_URL",
  "MELDEX_BRAIN_PROVIDER",
]);

// In-memory cache for hot-reload settings
const runtimeCache = new Map<string, { value: string; cachedAt: number }>();
const CACHE_TTL_MS = 60_000; // 1 minute

/**
 * Get a config value with priority: process.env > DB > default
 */
export async function getConfig(key: string, defaultValue?: string): Promise<string | undefined> {
  // Boot-critical: only from process.env
  if (BOOT_CRITICAL.has(key)) {
    return process.env[key] ?? defaultValue;
  }

  // Check cache for hot-reload settings
  if (HOT_RELOAD.has(key)) {
    const cached = runtimeCache.get(key);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
      return cached.value;
    }
  }

  // process.env takes priority
  const envVal = process.env[key];
  if (envVal) return envVal;

  // Try DB
  try {
    const dbVal = await getSetting(key);
    if (dbVal) {
      if (HOT_RELOAD.has(key)) {
        runtimeCache.set(key, { value: dbVal, cachedAt: Date.now() });
      }
      return dbVal;
    }
  } catch {
    // DB not available — fall through to default
  }

  return defaultValue;
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
