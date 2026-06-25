/**
 * instrumentation.ts
 *
 * Next.js server instrumentation hook. Runs once at server startup before
 * any routes or modules are initialized.
 *
 * Loads encrypted vault secrets into process.env so that auth.ts
 * (which reads process.env.GOOGLE_CLIENT_ID etc. at module load time)
 * gets the vault values without requiring them to be in .env.production.
 *
 * Docs: https://nextjs.org/docs/app/guides/instrumentation
 */

export async function register() {
  // Only run in the Node.js runtime (not Edge)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { loadVaultIntoEnv } = await import("./lib/vault-loader");
    await loadVaultIntoEnv();
  }
}
