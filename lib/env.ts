/**
 * lib/env.ts
 *
 * Runtime environment validation.  Import this module anywhere you need
 * validated env vars.  It throws a descriptive error at server startup if a
 * required variable is missing, rather than failing silently later.
 *
 * Validation is intentionally skipped during `npm run build` (Next.js static
 * page collection phase) so the build can complete without a live database.
 * At actual server runtime the check runs on first import.
 *
 * Usage:
 *   import { env } from "@/lib/env";
 *   console.log(env.DATABASE_URL);
 */

// During `npm run build` Next.js sets NEXT_PHASE to "phase-production-build".
// We skip hard validation in that phase so CI / Docker builds work without a
// live database present.
const IS_BUILD =
  process.env.NEXT_PHASE === "phase-production-build" ||
  process.env.NEXT_PHASE === "phase-export";

function requireEnv(name: string, hint: string): string {
  const value = process.env[name];
  if (!value && !IS_BUILD) {
    throw new Error(
      `\n\n❌  Missing required environment variable: ${name}\n` +
      `   ${hint}\n` +
      `   Copy .env.example to .env.local and fill in all values.\n`
    );
  }
  return value ?? "";
}

function validateEnv() {
  // ── Required in all environments ────────────────────────────────────────
  const DATABASE_URL = requireEnv(
    "DATABASE_URL",
    "PostgreSQL connection string.  Format: postgresql://USER:PASS@HOST:PORT/DB"
  );

  const NEXTAUTH_SECRET = requireEnv(
    "NEXTAUTH_SECRET",
    "Generate with: openssl rand -base64 32"
  );

  const NEXTAUTH_URL = requireEnv(
    "NEXTAUTH_URL",
    "Full URL of this deployment, e.g. http://localhost:3000"
  );

  // ── OAuth — at least one provider or credentials must be usable ─────────
  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";
  const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "";
  const GITHUB_ID = process.env.GITHUB_ID ?? "";
  const GITHUB_SECRET = process.env.GITHUB_SECRET ?? "";

  if (process.env.NODE_ENV === "production" && !IS_BUILD) {
    const googleOk = GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET;
    const githubOk = GITHUB_ID && GITHUB_SECRET;
    if (!googleOk && !githubOk) {
      console.warn(
        "\n⚠️  WARNING: Neither Google nor GitHub OAuth is configured.\n" +
        "   Only email/password login will work in production.\n" +
        "   Set GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET or GITHUB_ID + GITHUB_SECRET.\n"
      );
    }
  }

  // ── Ollama ───────────────────────────────────────────────────────────────
  const OLLAMA_BASE_URL =
    process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";

  const DEFAULT_MODEL =
    process.env.DEFAULT_MODEL ?? "qwen3-coder:30b";

  // ── Model router / brain provider ────────────────────────────────────────
  const MELDEX_BRAIN_PROVIDER =
    process.env.MELDEX_BRAIN_PROVIDER ?? "local_ollama";

  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? "";
  const OPENROUTER_BASE_URL =
    process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
  const OPENROUTER_MODEL =
    process.env.OPENROUTER_MODEL ?? "qwen/qwen3-coder:free";

  const CUSTOM_AI_BASE_URL = process.env.CUSTOM_AI_BASE_URL ?? "";
  const CUSTOM_AI_API_KEY = process.env.CUSTOM_AI_API_KEY ?? "";
  const CUSTOM_AI_MODEL = process.env.CUSTOM_AI_MODEL ?? "";

  return {
    DATABASE_URL,
    NEXTAUTH_SECRET,
    NEXTAUTH_URL,
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GITHUB_ID,
    GITHUB_SECRET,
    OLLAMA_BASE_URL,
    DEFAULT_MODEL,
    MELDEX_BRAIN_PROVIDER,
    OPENROUTER_API_KEY,
    OPENROUTER_BASE_URL,
    OPENROUTER_MODEL,
    CUSTOM_AI_BASE_URL,
    CUSTOM_AI_API_KEY,
    CUSTOM_AI_MODEL,
    NODE_ENV: process.env.NODE_ENV ?? "development",
  } as const;
}

// Validate once at module load time.  During the build phase this will only
// warn; at server runtime missing required vars throw immediately.
export const env = validateEnv();
