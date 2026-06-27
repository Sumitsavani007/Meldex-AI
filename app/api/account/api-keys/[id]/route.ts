import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/role-guard";
import { prisma } from "@/lib/prisma";
import { createUserApiKey } from "@/lib/ai-infrastructure";
import { logAuditEvent } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;
  const key = await prisma.userApiKey.findFirst({ where: { id, userId: session.user.id } });
  if (!key) return NextResponse.json({ error: "API key not found" }, { status: 404 });
  const revoked = await prisma.userApiKey.update({ where: { id }, data: { revokedAt: new Date() } });
  await logAuditEvent({ userId: session.user.id, action: "USER_API_KEY_REVOKE", resource: "UserApiKey", resourceId: id, success: true });
  return NextResponse.json({ key: serializeKey(revoked) }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;
  const oldKey = await prisma.userApiKey.findFirst({ where: { id, userId: session.user.id } });
  if (!oldKey) return NextResponse.json({ error: "API key not found" }, { status: 404 });
  await prisma.userApiKey.update({ where: { id }, data: { revokedAt: new Date() } });
  const scopes = Array.isArray(oldKey.scopesJson) ? oldKey.scopesJson.filter((item): item is string => typeof item === "string") : [];
  const { raw, apiKey } = await createUserApiKey({
    userId: session.user.id,
    name: `${oldKey.name} (rotated)`,
    scopes,
    expiresAt: oldKey.expiresAt,
  });
  await logAuditEvent({ userId: session.user.id, action: "USER_API_KEY_ROTATE", resource: "UserApiKey", resourceId: id, success: true, metadata: { newKeyId: apiKey.id } });
  return NextResponse.json({
    apiKey: raw,
    key: serializeKey(apiKey),
    message: "Copy this rotated API key now. It will not be shown again.",
  }, { headers: { "Cache-Control": "no-store" } });
}
