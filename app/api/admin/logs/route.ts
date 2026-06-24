import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/role-guard";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const logs = await prisma.agentLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        level: true,
        message: true,
        agent: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ logs });
  } catch (err) {
    console.error("Admin logs error:", err);
    return NextResponse.json({ logs: [] }, { status: 200 });
  }
}
