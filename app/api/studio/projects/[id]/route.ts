import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { requireAuth } from "@/lib/role-guard";
import { prisma } from "@/lib/prisma";
import { studioSlug } from "@/lib/ai-studio";

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).nullable().optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
  styleLock: z.string().nullable().optional(),
  aspectRatio: z.string().optional(),
  resolution: z.string().optional(),
  durationSec: z.number().int().min(2).max(120).optional(),
  fps: z.number().int().min(12).max(60).optional(),
  seed: z.string().nullable().optional(),
  action: z.enum(["rename", "settings", "archive", "favorite", "duplicate"]).optional(),
});

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

async function uniqueSlug(userId: string, name: string, exceptId?: string) {
  const base = studioSlug(name);
  for (let index = 0; index < 50; index += 1) {
    const slug = index === 0 ? base : `${base}-${index + 1}`;
    const existing = await prisma.studioProject.findUnique({ where: { userId_slug: { userId, slug } }, select: { id: true } });
    if (!existing || existing.id === exceptId) return slug;
  }
  return `${base}-${Date.now()}`;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;
  const project = await prisma.studioProject.findFirst({ where: { id, userId: session.user.id } });
  if (!project) return NextResponse.json({ error: "Studio project not found" }, { status: 404 });
  const body = patchSchema.parse(await request.json());

  if (body.action === "duplicate") {
    const copy = await prisma.studioProject.create({
      data: {
        userId: session.user.id,
        name: `${project.name} Copy`,
        slug: await uniqueSlug(session.user.id, `${project.name} Copy`),
        description: project.description,
        mode: project.mode,
        styleLock: project.styleLock,
        aspectRatio: project.aspectRatio,
        resolution: project.resolution,
        durationSec: project.durationSec,
        fps: project.fps,
        seed: project.seed,
        settingsJson: project.settingsJson ?? undefined,
      },
    });
    await prisma.studioHistory.create({ data: { userId: session.user.id, projectId: copy.id, action: "project_duplicated", summary: `Duplicated ${project.name}` } });
    return NextResponse.json({ project: copy }, { headers: { "Cache-Control": "no-store" } });
  }

  const nextName = body.name ?? project.name;
  const updated = await prisma.studioProject.update({
    where: { id: project.id },
    data: {
      name: body.name,
      slug: body.name ? await uniqueSlug(session.user.id, nextName, project.id) : undefined,
      description: body.description,
      styleLock: body.styleLock,
      aspectRatio: body.aspectRatio,
      resolution: body.resolution,
      durationSec: body.durationSec,
      fps: body.fps,
      seed: body.seed,
      settingsJson: body.settings ? body.settings as Prisma.InputJsonValue : undefined,
      archivedAt: body.action === "archive" ? new Date() : undefined,
      favoritedAt: body.action === "favorite" ? new Date() : undefined,
    },
  });
  await prisma.studioHistory.create({ data: { userId: session.user.id, projectId: project.id, action: body.action || "project_updated", summary: `Updated ${updated.name}` } }).catch(() => undefined);
  return NextResponse.json({ project: updated }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;
  const project = await prisma.studioProject.findFirst({ where: { id, userId: session.user.id }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "Studio project not found" }, { status: 404 });
  await prisma.studioProject.delete({ where: { id: project.id } });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
