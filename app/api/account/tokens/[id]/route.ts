import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/role-guard";
import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;
  if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  const token = await prisma.extensionToken.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!token) return NextResponse.json({ error: "Token not found" }, { status: 404 });

  await prisma.extensionToken.update({
    where: { id },
    data: { revokedAt: new Date() },
  });
  await logAuditEvent({
    userId: session.user.id,
    action: "EXTENSION_TOKEN_REVOKE",
    resource: "ExtensionToken",
    resourceId: id,
    success: true,
    metadata: { name: token.name, maskedToken: `${token.tokenPrefix || "mdx_"}****${token.tokenLast4 || "????"}` },
  });
  await createNotification({
    userId: session.user.id,
    type: "token_revoked",
    actionUrl: "/settings/tokens",
    metadata: { name: token.name, tokenId: id },
    dedupeWindowMinutes: 0,
  }).catch(() => undefined);

  return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
}
