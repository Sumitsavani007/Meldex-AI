import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/role-guard";
import { prisma } from "@/lib/prisma";
import { studioSlug } from "@/lib/ai-studio";

const schema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  mode: z.string().max(60).optional(),
});

async function uniqueSlug(userId: string, name: string) {
  const base = studioSlug(name);
  for (let index = 0; index < 50; index += 1) {
    const slug = index === 0 ? base : `${base}-${index + 1}`;
    const existing = await prisma.studioProject.findUnique({ where: { userId_slug: { userId, slug } }, select: { id: true } });
    if (!existing) return slug;
  }
  return `${base}-${Date.now()}`;
}

export async function GET() {
  const { session, error } = await requireAuth();
  if (error) return error;
  const projects = await prisma.studioProject.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    include: {
      generations: { orderBy: { createdAt: "desc" }, take: 1 },
      _count: { select: { assets: true, generations: true, scenes: true } },
    },
  });
  const assets = await prisma.studioAsset.findMany({
    where: { userId: session.user.id, archivedAt: null },
    orderBy: { createdAt: "desc" },
    take: 16,
  });
  return NextResponse.json({ projects, assets }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const body = schema.parse(await request.json());
  const project = await prisma.studioProject.create({
    data: {
      userId: session.user.id,
      name: body.name,
      slug: await uniqueSlug(session.user.id, body.name),
      description: body.description,
      mode: body.mode || "TEXT_TO_VIDEO",
      settingsJson: {
        models: ["OpenRouter"],
        pipeline: ["language_detection", "prompt_enhancement", "scene_breakdown", "storyboard", "shot_planner"],
      },
    },
  });
  await prisma.studioHistory.create({
    data: {
      userId: session.user.id,
      projectId: project.id,
      action: "project_created",
      summary: `Created AI Studio project ${project.name}`,
    },
  });
  return NextResponse.json({ project }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
