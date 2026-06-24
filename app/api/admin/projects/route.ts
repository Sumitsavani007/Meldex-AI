import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/role-guard";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const [total, active, archived, projects] = await Promise.all([
      prisma.project.count(),
      prisma.project.count({ where: { status: "ACTIVE" } }),
      prisma.project.count({ where: { status: "ARCHIVED" } }),
      prisma.project.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          name: true,
          status: true,
          createdAt: true,
          user: { select: { email: true, name: true } },
        },
      }),
    ]);

    return NextResponse.json({ total, active, archived, projects });
  } catch (err) {
    console.error("Admin projects error:", err);
    return NextResponse.json(
      { total: 0, active: 0, archived: 0, projects: [] },
      { status: 200 }
    );
  }
}
