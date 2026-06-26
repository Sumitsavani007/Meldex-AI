import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/role-guard";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const tokens = await prisma.extensionToken.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      name: true,
      tokenPrefix: true,
      tokenLast4: true,
      scopesJson: true,
      createdAt: true,
      expiresAt: true,
      lastUsedAt: true,
      revokedAt: true,
      user: { select: { id: true, email: true, name: true } },
    },
  });

  return NextResponse.json({
    tokens: tokens.map((token) => ({
      id: token.id,
      user: token.user,
      name: token.name,
      maskedToken: `${token.tokenPrefix || "mdx_"}****${token.tokenLast4 || "????"}`,
      scopes: token.scopesJson,
      createdAt: token.createdAt,
      expiresAt: token.expiresAt,
      lastUsedAt: token.lastUsedAt,
      revokedAt: token.revokedAt,
      status: token.revokedAt ? "revoked" : token.expiresAt && token.expiresAt < new Date() ? "expired" : "active",
    })),
  });
}
