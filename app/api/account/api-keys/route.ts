import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/role-guard";
import { prisma } from "@/lib/prisma";
import { canUseFeature, featureBlockedResponse } from "@/lib/plans-credits";
import { checkDynamicRateLimit, createUserApiKey } from "@/lib/ai-infrastructure";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(1).max(80).default("Meldex API Key"),
  scopes: z.array(z.string().min(1).max(60)).default(["chat", "workspace", "usage"]),
  expiresInDays: z.number().int().min(1).max(365).nullable().optional(),
});

function serializeKey(key: {
  id: string;
  name: string;
  keyPrefix: string;
  keyLast4: string;
  scopesJson: unknown;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: key.id,
    name: key.name,
    maskedKey: `${key.keyPrefix}****${key.keyLast4}`,
    scopes: Array.isArray(key.scopesJson) ? key.scopesJson : [],
    expiresAt: key.expiresAt,
    lastUsedAt: key.lastUsedAt,
    revokedAt: key.revokedAt,
    createdAt: key.createdAt,
    updatedAt: key.updatedAt,
    status: key.revokedAt ? "revoked" : key.expiresAt && key.expiresAt < new Date() ? "expired" : "active",
  };
}

export async function GET() {
  const { session, error } = await requireAuth();
  if (error) return error;
  const keys = await prisma.userApiKey.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ keys: keys.map(serializeKey) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const { session, error } = await requireAuth();
  if (error) return error;
  try {
    const gate = await canUseFeature(session.user.id, "api_access");
    if (!gate.ok) return NextResponse.json(featureBlockedResponse(gate), { status: 402, headers: { "Cache-Control": "no-store" } });
    const rate = await checkDynamicRateLimit(session.user.id, "api_access");
    if (!rate.ok) return NextResponse.json(rate, { status: 429, headers: { "Cache-Control": "no-store" } });
    const body = createSchema.parse(await request.json().catch(() => ({})));
    const expiresAt = body.expiresInDays ? new Date(Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000) : null;
    const { raw, apiKey } = await createUserApiKey({ userId: session.user.id, name: body.name, scopes: body.scopes, expiresAt });
    return NextResponse.json({
      apiKey: raw,
      key: serializeKey(apiKey),
      message: "Copy this API key now. It will not be shown again.",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to create API key" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
