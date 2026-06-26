import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/role-guard";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdmin();
  if (error) return error;
  const { id } = await params;
  await prisma.extensionToken.update({
    where: { id },
    data: { revokedAt: new Date() },
  });
  return NextResponse.json({ success: true });
}
