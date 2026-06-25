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
]);

// Settings that require app restart when changed
export const REQUIRES_RESTART = new Set([
  "DATABASE_URL",
  "NEXTAUTH_SECRET",
  "AUTH_SECRET",
  "NEXTAUTH_URL",
  "AUTH_URL",
]);

// Settings that can be hot-reloaded — vault OVERRIDES process.env for these
export const HOT_RELOAD = new Set([
  "OPENROUTER_MODEL",
  "OPENROUTER_BASE_URL",
  "OPENROUTER_FALLBACK_MODEL",
  "R2_PUBLIC_URL",
  "MELDEX_BRAIN_PROVIDER",
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
