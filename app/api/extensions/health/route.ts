/**
 * GET /api/extensions/health
 *
 * Lightweight authenticated health endpoint for the Meldex extension.
 * Verifies the bearer token and returns the current user plus backend/model status.
 */
import { NextRequest, NextResponse } from "next/server";
import { ExtensionTokenError, extractBearerToken, verifyAnyExtensionToken } from "@/lib/extension-auth";
import { getConfig } from "@/lib/runtime-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = extractBearerToken(req.headers.get("authorization"));
  if (!token) {
    return NextResponse.json({ error: "Missing Bearer token" }, { status: 401 });
  }

  try {
    const user = await verifyAnyExtensionToken(token);
    const [model, apiKey] = await Promise.all([
      getConfig("OPENROUTER_MODEL", "qwen/qwen3-coder"),
      getConfig("OPENROUTER_API_KEY"),
    ]);

    return NextResponse.json({
      ok: true,
      user: {
        id: user.userId,
        email: user.email,
        name: user.name,
        role: user.role,
        tokenId: user.tokenId ?? null,
      },
      backend: "ok",
      model: {
        provider: "openrouter",
        model,
        status: apiKey ? "ok" : "not_configured",
      },
      extensionApi: "ok",
    });
  } catch (err) {
    const code = err instanceof ExtensionTokenError ? err.code : "token_invalid";
    return NextResponse.json({ error: err instanceof Error ? err.message : "Invalid or expired token", code }, { status: 401 });
  }
}
