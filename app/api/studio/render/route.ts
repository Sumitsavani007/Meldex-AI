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
import { runComfyCloudGeneration } from "@/lib/ai-studio-comfy-cloud";

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
  const stage = studioRenderStage(mode);

  if (mode === "draft_preview" || mode === "final_render") {
    const latest = project.generations[0];
    const prompt = String(latest?.enhancedPrompt || latest?.sourcePrompt || project.description || project.name || "").trim();
    if (!prompt) {
      return NextResponse.json({ error: "No prompt is available for video generation. Generate a script or enter a prompt first." }, { status: 400 });
    }
    const startedAt = new Date();
    const job = await prisma.studioJob.create({
      data: {
        userId: session.user.id,
        projectId: project.id,
        generationId,
        status: "RUNNING",
        stage,
        progress: 10,
        currentModel: "Wan 2.x on Comfy Cloud",
        logsJson: {
          mode,
          provider: "comfy_cloud",
          state: "Preparing workflow",
          policy: "No fake video generation. Output URL is written only after Comfy Cloud returns a real video.",
        } as Prisma.InputJsonValue,
        startedAt,
      },
    });
    const result = await runComfyCloudGeneration({
      kind: "video",
      prompt,
      negativePrompt: String(latest?.negativePrompt || "low quality, blurry, distorted, watermark"),
      model: "Wan 2.x",
      aspectRatio: project.aspectRatio,
      durationSec: project.durationSec,
      fps: project.fps || 24,
      timeoutMs: 900000,
    });
    const completedAt = new Date();
    if (!result.ok) {
      const failed = await prisma.studioJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          stage: "PROVIDER_ERROR",
          progress: 100,
          error: result.message,
          logsJson: {
            mode,
            provider: "comfy_cloud",
            code: result.code,
            message: result.message,
            promptId: result.metadata?.promptId,
          } as Prisma.InputJsonValue,
          completedAt,
        },
      });
      await prisma.studioHistory.create({
        data: {
          userId: session.user.id,
          projectId: project.id,
          generationId,
          action: "video_generation_failed",
          summary: result.message,
          metadataJson: { mode, provider: "comfy_cloud", code: result.code } as Prisma.InputJsonValue,
        },
      }).catch(() => undefined);
      return NextResponse.json({ error: result.message, mode, job: failed, provider: "comfy_cloud" }, { status: result.status || 502, headers: { "Cache-Control": "no-store" } });
    }
    const output = result.outputs.find((item) => item.mimeType.startsWith("video/")) || result.outputs[0];
    const completed = await prisma.studioJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        stage: "COMPLETED",
        progress: 100,
        logsJson: {
          mode,
          provider: "comfy_cloud",
          promptId: result.promptId,
          outputs: result.outputs,
        } as Prisma.InputJsonValue,
        completedAt,
      },
    });
    if (generationId && output?.url) {
      await prisma.studioGeneration.updateMany({
        where: { id: generationId, userId: session.user.id },
        data: {
          status: "COMPLETED",
          provider: "comfy_cloud",
          model: "Wan 2.x",
          outputUrl: output.url,
          previewUrl: output.url,
          thumbnailUrl: output.kind === "image" ? output.url : undefined,
          completedAt,
        },
      });
    }
    await prisma.studioHistory.create({
      data: {
        userId: session.user.id,
        projectId: project.id,
        generationId,
        action: "video_generation_completed",
        summary: "Video generated with Comfy Cloud.",
        metadataJson: { mode, provider: "comfy_cloud", promptId: result.promptId, output } as Prisma.InputJsonValue,
      },
    }).catch(() => undefined);
    return NextResponse.json({ job: completed, mode, provider: "comfy_cloud", outputs: result.outputs }, { status: 200, headers: { "Cache-Control": "no-store" } });
  }

  const missingProviders = await getMissingProvidersForRender(mode);
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
