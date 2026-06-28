import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { requireAuth } from "@/lib/role-guard";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  action: z.enum(["update", "duplicate", "delete", "move"]),
  title: z.string().max(160).optional(),
  prompt: z.string().max(6000).optional(),
  negativePrompt: z.string().max(3000).nullable().optional(),
  durationSec: z.number().int().min(1).max(60).optional(),
  camera: z.string().max(80).nullable().optional(),
  emotion: z.string().max(80).nullable().optional(),
  lighting: z.string().max(80).nullable().optional(),
  environment: z.string().max(160).nullable().optional(),
  order: z.number().int().min(1).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;
  const scene = await prisma.studioScene.findFirst({ where: { id, userId: session.user.id } });
  if (!scene) return NextResponse.json({ error: "Studio scene not found" }, { status: 404 });
  const body = schema.parse(await request.json());

  if (body.action === "delete") {
    await prisma.studioScene.delete({ where: { id: scene.id } });
    await prisma.studioHistory.create({ data: { userId: session.user.id, projectId: scene.projectId, generationId: scene.generationId, action: "scene_deleted", summary: `Deleted ${scene.title}` } }).catch(() => undefined);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  }

  if (body.action === "duplicate") {
    const duplicated = await prisma.studioScene.create({
      data: {
        userId: session.user.id,
        projectId: scene.projectId,
        generationId: scene.generationId,
        order: scene.order + 1,
        title: `${scene.title} Copy`,
        prompt: scene.prompt,
        negativePrompt: scene.negativePrompt,
        durationSec: scene.durationSec,
        camera: scene.camera,
        emotion: scene.emotion,
        lighting: scene.lighting,
        environment: scene.environment,
        charactersJson: scene.charactersJson ?? undefined,
        settingsJson: scene.settingsJson ?? undefined,
      },
    });
    await prisma.studioHistory.create({ data: { userId: session.user.id, projectId: scene.projectId, generationId: scene.generationId, action: "scene_duplicated", summary: `Duplicated ${scene.title}` } }).catch(() => undefined);
    return NextResponse.json({ scene: duplicated }, { headers: { "Cache-Control": "no-store" } });
  }

  const updated = await prisma.studioScene.update({
    where: { id: scene.id },
    data: {
      title: body.title,
      prompt: body.prompt,
      negativePrompt: body.negativePrompt,
      durationSec: body.durationSec,
      camera: body.camera,
      emotion: body.emotion,
      lighting: body.lighting,
      environment: body.environment,
      order: body.order,
    },
  });

  if (scene.generationId) {
    const scenes = await prisma.studioScene.findMany({ where: { generationId: scene.generationId }, orderBy: { order: "asc" } });
    await prisma.studioGeneration.update({
      where: { id: scene.generationId },
      data: {
        storyboardJson: {
          scenes,
          timeline: scenes.map((item, index) => ({ scene: index + 1, start: scenes.slice(0, index).reduce((sum, current) => sum + current.durationSec, 0), end: scenes.slice(0, index + 1).reduce((sum, current) => sum + current.durationSec, 0), label: item.title })),
        } as unknown as Prisma.InputJsonValue,
      },
    }).catch(() => undefined);
  }

  await prisma.studioHistory.create({ data: { userId: session.user.id, projectId: scene.projectId, generationId: scene.generationId, action: "scene_updated", summary: `Updated ${updated.title}` } }).catch(() => undefined);
  return NextResponse.json({ scene: updated }, { headers: { "Cache-Control": "no-store" } });
}
