/**
 * DELETE /api/extensions/tokens/[id]
 * Revoke (soft-delete) an extension token.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/role-guard";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { session, error } = await requireAuth();
    if (error) return error;
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const token = await prisma.extensionToken.findFirst({
      where: { id: params.id, userId: session.user.id },
    });

    if (!token) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }

    await prisma.extensionToken.update({
      where: { id: params.id },
      data: { revokedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}
