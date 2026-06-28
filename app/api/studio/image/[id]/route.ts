import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/role-guard";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;
  const generation = await prisma.studioGeneration.findFirst({
    where: { id, userId: session.user.id, type: "TEXT_TO_IMAGE" },
    include: { project: true },
  });
  if (!generation) return NextResponse.json({ error: "Image generation not found" }, { status: 404 });
  return NextResponse.json({ generation }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;
  const generation = await prisma.studioGeneration.findFirst({
    where: { id, userId: session.user.id, type: "TEXT_TO_IMAGE" },
    select: { id: true, projectId: true },
  });
  if (!generation) return NextResponse.json({ error: "Image generation not found" }, { status: 404 });
  await prisma.studioGeneration.delete({ where: { id: generation.id } });
  await prisma.studioHistory.create({
    data: {
      userId: session.user.id,
      projectId: generation.projectId,
      action: "image_generation_deleted",
      summary: "Deleted image generation",
    },
  }).catch(() => undefined);
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
