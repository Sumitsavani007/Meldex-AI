import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/role-guard";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/security";
import { createExtensionApiToken, maskExtensionToken, type ExtensionScope } from "@/lib/extension-auth";
import { canUseFeature, featureBlockedResponse } from "@/lib/plans-credits";
import { createNotification } from "@/lib/notifications";

const createSchema = z.object({
  name: z.string().min(1).max(80).default("Meldex Extension"),
  expiresInDays: z.number().int().min(1).max(365).default(365),
  scopes: z.array(z.enum(["chat", "agent", "model-health", "benchmark"])).default(["chat", "agent", "model-health", "benchmark"]),
});

function tokenSelect() {
  return {
    id: true,
    name: true,
    tokenPrefix: true,
    tokenLast4: true,
    scopesJson: true,
    lastUsedAt: true,
    expiresAt: true,
    revokedAt: true,
    createdAt: true,
    updatedAt: true,
  } as const;
}

function serializeToken(token: {
  id: string;
  name: string;
  tokenPrefix: string | null;
  tokenLast4: string | null;
  scopesJson: unknown;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  const scopes = Array.isArray(token.scopesJson)
    ? token.scopesJson
    : token.scopesJson && typeof token.scopesJson === "object" && "scopes" in token.scopesJson
      ? (token.scopesJson as { scopes?: unknown[] }).scopes ?? []
      : [];
  return {
    id: token.id,
    name: token.name,
    maskedToken: `${token.tokenPrefix || "mdx_"}****${token.tokenLast4 || "????"}`,
    scopes,
    lastUsedAt: token.lastUsedAt,
    expiresAt: token.expiresAt,
    revokedAt: token.revokedAt,
    createdAt: token.createdAt,
    updatedAt: token.updatedAt,
    status: token.revokedAt ? "revoked" : token.expiresAt && token.expiresAt < new Date() ? "expired" : "active",
  };
}

export async function GET() {
  const { session, error } = await requireAuth();
  if (error) return error;
  if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const tokens = await prisma.extensionToken.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: tokenSelect(),
  });

  return NextResponse.json({ tokens: tokens.map(serializeToken) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;
  if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    checkRateLimit(`token-create:${session.user.id}`, 10, 60_000);
    const body = createSchema.parse(await req.json().catch(() => ({})));
    const apiGate = await canUseFeature(session.user.id, "api_access");
    if (!apiGate.ok) return NextResponse.json(featureBlockedResponse(apiGate), { status: 402, headers: { "Cache-Control": "no-store" } });
    if (body.scopes.includes("benchmark")) {
      const benchmarkGate = await canUseFeature(session.user.id, "benchmark");
      if (!benchmarkGate.ok) return NextResponse.json(featureBlockedResponse(benchmarkGate), { status: 402, headers: { "Cache-Control": "no-store" } });
    }
    const expiresAt = new Date(Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000);
    const raw = await createExtensionApiToken(session.user.id, body.name, {
      expiresAt,
      scopes: body.scopes as ExtensionScope[],
    });
    await createNotification({
      userId: session.user.id,
      type: "token_created",
      actionUrl: "/settings/tokens",
      metadata: { name: body.name, scopes: body.scopes, expiresAt },
      dedupeWindowMinutes: 0,
    }).catch(() => undefined);
    const tokens = await prisma.extensionToken.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      select: tokenSelect(),
    });
    return NextResponse.json({
      token: raw,
      maskedToken: maskExtensionToken(raw),
      message: "Copy this token now. It will not be shown again.",
      tokens: tokens.map(serializeToken),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create token" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }
}
