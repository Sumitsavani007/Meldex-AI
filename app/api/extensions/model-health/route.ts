import { NextResponse } from "next/server";
import { ExtensionTokenError, extractBearerToken, requireExtensionScope, verifyAnyExtensionToken } from "@/lib/extension-auth";
import { testOpenRouterHealth } from "@/lib/provider-health";

const NO_CACHE = { "Cache-Control": "no-store, no-cache", "Pragma": "no-cache" };

export async function GET(req: Request) {
  const token = extractBearerToken(req.headers.get("authorization"));
  if (!token) return NextResponse.json({ error: "Authorization required" }, { status: 401, headers: NO_CACHE });

  try {
    const user = await verifyAnyExtensionToken(token);
    requireExtensionScope(user, "model-health");
  } catch (err) {
    const code = err instanceof ExtensionTokenError ? err.code : "token_invalid";
    return NextResponse.json({ error: err instanceof Error ? err.message : "Invalid or expired token", code }, { status: 401, headers: NO_CACHE });
  }

  const result = await testOpenRouterHealth();
  return NextResponse.json({
    provider: result.provider,
    model: result.model,
    status: result.code,
    healthy: result.ok,
    message: result.userMessage,
    retryAfter: result.retryAfter ?? null,
  }, { status: 200, headers: NO_CACHE });
}
