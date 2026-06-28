import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/role-guard";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;
  const project = await prisma.studioProject.findFirst({
    where: { id, userId: session.user.id },
    include: {
      assets: { orderBy: { createdAt: "desc" }, take: 50 },
      characters: { orderBy: { createdAt: "desc" }, take: 30 },
      voices: { orderBy: { createdAt: "desc" }, take: 30 },
      generations: {
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { scenes: { orderBy: { order: "asc" } }, jobs: { orderBy: { createdAt: "desc" }, take: 1 } },
      },
      history: { orderBy: { createdAt: "desc" }, take: 30 },
      _count: { select: { assets: true, generations: true, scenes: true } },
    },
  });
  if (!project) return NextResponse.json({ error: "Studio project not found" }, { status: 404 });
  return NextResponse.json({ project }, { headers: { "Cache-Control": "no-store" } });
}
