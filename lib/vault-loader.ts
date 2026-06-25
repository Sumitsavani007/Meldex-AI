/**
 * lib/vault-loader.ts
 *
 * Loads non-boot-critical secrets from the encrypted vault into process.env
 * at server startup (called from instrumentation.ts).
 *
 * This runs BEFORE auth.ts and other modules are initialized, so providers
 * like GoogleProvider will see the vault values when they read process.env.
 *
 * Boot-critical keys (DATABASE_URL, AUTH_SECRET, NEXTAUTH_URL etc.) are
 * intentionally skipped — they must already exist in the .env file.
 *
 * For non-secret settings: valueMasked holds the raw plaintext value.
 * For secret settings:      valueEncrypted holds AES-256-GCM ciphertext.
 */

// ── Keys that must NOT be overridden by vault ─────────────────────────────
const BOOT_CRITICAL = new Set([
  "DATABASE_URL",
  "NEXTAUTH_SECRET",
  "AUTH_SECRET",
  "AUTH_URL",
  "NEXTAUTH_URL",
  "SETTINGS_ENCRYPTION_KEY",
]);

export async function loadVaultIntoEnv(): Promise<void> {
  // Lightweight guard: vault requires both a DB URL and an encryption key
  if (!process.env.DATABASE_URL || !process.env.SETTINGS_ENCRYPTION_KEY) {
    console.log("[vault-loader] Skipped — DATABASE_URL or SETTINGS_ENCRYPTION_KEY not set");
    return;
  }

  try {
    // Dynamic imports to avoid bundling DB/crypto in edge contexts
    const { prisma } = await import("./prisma");
    const { decryptSecret, isVaultConfigured } = await import("./secret-vault");

    if (!isVaultConfigured()) {
      console.log("[vault-loader] Vault not configured — skipping");
      return;
    }

    const settings = await prisma.systemSetting.findMany();
    let loaded = 0;

    for (const setting of settings) {
      // Never override boot-critical keys
      if (BOOT_CRITICAL.has(setting.key)) continue;
      // process.env always wins over vault
      if (process.env[setting.key]) continue;

      try {
        let value: string | null = null;

        if (setting.isSecret && setting.valueEncrypted) {
          value = decryptSecret(setting.valueEncrypted);
        } else if (!setting.isSecret && setting.valueMasked) {
          // Non-secret: valueMasked stores the raw plaintext value
          value = setting.valueMasked;
        }

        if (value) {
          process.env[setting.key] = value;
          loaded++;
        }
      } catch {
        // Skip individual key decrypt errors — don't abort the whole load
      }
    }

    if (loaded > 0) {
      console.log(`[vault-loader] ✓ Loaded ${loaded} settings from vault into process.env`);
    } else {
      console.log("[vault-loader] No vault settings to load (all already in env or vault empty)");
    }
  } catch (err) {
    // DB not available at startup — not fatal, app continues without vault settings
    console.warn("[vault-loader] Could not load vault settings:", err instanceof Error ? err.message : err);
  }
}
