import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/role-guard";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId") || undefined;
  const generations = await prisma.studioGeneration.findMany({
    where: {
      userId: session.user.id,
      type: "TEXT_TO_IMAGE",
      projectId,
    },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  return NextResponse.json({ generations }, { headers: { "Cache-Control": "no-store" } });
}
