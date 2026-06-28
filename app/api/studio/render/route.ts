import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { requireAuth } from "@/lib/role-guard";
import { prisma } from "@/lib/prisma";
import {
  getMissingProvidersForRender,
  STUDIO_RENDER_REQUIREMENTS,
  studioRenderStage,
  type StudioRenderMode,
} from "@/lib/ai-studio-providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  projectId: z.string().min(1),
  generationId: z.string().optional(),
  mode: z.enum([
    "storyboard_images",
    "draft_preview",
    "final_render",
    "voice",
    "music",
    "sound_effects",
    "lip_sync",
    "subtitles",
    "translation",
    "export",
  ]),
  sceneId: z.string().optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid render request" }, { status: 400 });

  const project = await prisma.studioProject.findFirst({
    where: { id: parsed.data.projectId, userId: session.user.id },
    include: { generations: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!project) return NextResponse.json({ error: "Studio project not found" }, { status: 404 });

  const generationId = parsed.data.generationId || project.generations[0]?.id || null;
  const mode = parsed.data.mode as StudioRenderMode;
  const missingProviders = await getMissingProvidersForRender(mode);
  const stage = studioRenderStage(mode);

  if (missingProviders.length) {
    const job = await prisma.studioJob.create({
      data: {
        userId: session.user.id,
        projectId: project.id,
        generationId,
        status: "FAILED",
        stage: "PROVIDER_NOT_INSTALLED",
        progress: 0,
        error: `Provider Not Installed: ${missingProviders.map((provider) => provider.name).join(", ")}`,
        logsJson: {
          mode,
          requiredProviders: STUDIO_RENDER_REQUIREMENTS[mode],
          missingProviders,
          policy: "No fake media generation. Install/configure required local providers.",
        } as Prisma.InputJsonValue,
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });
    await prisma.studioHistory.create({
      data: {
        userId: session.user.id,
        projectId: project.id,
        generationId,
        action: "render_blocked_provider_missing",
        summary: `Provider Not Installed for ${mode}`,
        metadataJson: { mode, missingProviders } as Prisma.InputJsonValue,
      },
    }).catch(() => undefined);
    return NextResponse.json({
      error: "Provider Not Installed",
      mode,
      job,
      missingProviders,
      requiredProviders: STUDIO_RENDER_REQUIREMENTS[mode],
    }, { status: 409, headers: { "Cache-Control": "no-store" } });
  }

  const job = await prisma.studioJob.create({
    data: {
      userId: session.user.id,
      projectId: project.id,
      generationId,
      status: "QUEUED",
      stage,
      progress: 0,
      currentScene: parsed.data.sceneId ? 1 : undefined,
      logsJson: {
        mode,
        requiredProviders: STUDIO_RENDER_REQUIREMENTS[mode],
        settings: parsed.data.settings || project.settingsJson || {},
        policy: "Queued for local-first provider execution. No output URL is created until provider execution completes.",
      } as Prisma.InputJsonValue,
    },
  });

  await prisma.studioHistory.create({
    data: {
      userId: session.user.id,
      projectId: project.id,
      generationId,
      action: "render_job_queued",
      summary: `Queued ${mode}`,
      metadataJson: { mode, jobId: job.id } as Prisma.InputJsonValue,
    },
  }).catch(() => undefined);

  return NextResponse.json({ job, mode, requiredProviders: STUDIO_RENDER_REQUIREMENTS[mode] }, { status: 202, headers: { "Cache-Control": "no-store" } });
}
