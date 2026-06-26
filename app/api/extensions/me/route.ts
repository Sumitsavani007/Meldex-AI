/**
 * GET /api/extensions/me
 * Verify Bearer token and return current user info.
 * Works with both mdx_ API tokens and legacy JWTs.
 */
import { NextRequest, NextResponse } from "next/server";
import { ExtensionTokenError, extractBearerToken, verifyAnyExtensionToken } from "@/lib/extension-auth";

export async function GET(req: NextRequest) {
  try {
    const token = extractBearerToken(req.headers.get("authorization"));
    if (!token) {
      return NextResponse.json({ error: "Missing Bearer token" }, { status: 401 });
    }

    const user = await verifyAnyExtensionToken(token);

    return NextResponse.json({
      id: user.userId,
      email: user.email,
      name: user.name,
      role: user.role,
      expiresAt: user.expiresAt ? user.expiresAt.toISOString() : null,
      tokenId: user.tokenId ?? null,
    });
  } catch (err) {
    const code = err instanceof ExtensionTokenError ? err.code : "unauthorized";
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unauthorized", code },
      { status: 401 }
    );
  }
}
