import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/role-guard";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const logs = await prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        action: true,
        resource: true,
        ipAddress: true,
        createdAt: true,
        user: { select: { email: true } },
      },
    });

    return NextResponse.json({ logs });
  } catch (err) {
    console.error("Admin audit error:", err);
    return NextResponse.json({ logs: [] }, { status: 200 });
  }
}
