import { NextResponse } from "next/server";
import { extractBearerToken, verifyAnyExtensionToken } from "@/lib/extension-auth";
import { testOpenRouterHealth } from "@/lib/provider-health";

const NO_CACHE = { "Cache-Control": "no-store, no-cache", "Pragma": "no-cache" };

export async function GET(req: Request) {
  const token = extractBearerToken(req.headers.get("authorization"));
  if (!token) return NextResponse.json({ error: "Authorization required" }, { status: 401, headers: NO_CACHE });

  try {
    await verifyAnyExtensionToken(token);
  } catch {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401, headers: NO_CACHE });
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
