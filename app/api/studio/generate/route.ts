import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { requireAuth } from "@/lib/role-guard";
import { prisma } from "@/lib/prisma";
import { enhanceStudioPrompt, type StudioSettings } from "@/lib/ai-studio";
import { listStudioProviderStatuses } from "@/lib/ai-studio-providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  projectId: z.string().min(1),
  prompt: z.string().min(1).max(8000),
  settings: z.object({
    model: z.string().optional(),
    resolution: z.string().default("1080p"),
    durationSec: z.number().int().min(2).max(120).default(8),
    aspectRatio: z.string().default("16:9"),
    fps: z.number().int().min(12).max(60).default(24),
    seed: z.string().optional(),
    contentPreference: z.string().optional(),
    negativePrompt: z.string().optional(),
    motionStrength: z.number().min(0).max(100).default(52),
    cameraMotion: z.string().default("Dolly"),
    styleLock: z.string().default("Cinematic"),
    consistency: z.number().min(0).max(100).default(72),
  }),
});

function sse(controller: ReadableStreamDefaultController<Uint8Array>, sequence: number, type: string, message: string, payload?: Record<string, unknown>) {
  controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ sequence, type, message, payload, timestamp: new Date().toISOString() })}\n\n`));
}

export async function POST(request: Request) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const body = schema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: body.error.issues[0]?.message || "Invalid Studio request" }, { status: 400 });

  const project = await prisma.studioProject.findFirst({ where: { id: body.data.projectId, userId: session.user.id } });
  if (!project) return NextResponse.json({ error: "Studio project not found" }, { status: 404 });

  let sequence = 0;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (type: string, message: string, payload?: Record<string, unknown>) => {
        sequence += 1;
        sse(controller, sequence, type, message, payload);
      };
      let generationId: string | null = null;
      let jobId: string | null = null;
      try {
        send("request_received", "Request received", { projectId: project.id });
        const settings = body.data.settings as StudioSettings;
        const generation = await prisma.studioGeneration.create({
          data: {
            userId: session.user.id,
            projectId: project.id,
            type: project.mode,
            status: "RUNNING",
            sourcePrompt: body.data.prompt,
            settingsJson: settings as Prisma.InputJsonValue,
            provider: "openrouter",
            startedAt: new Date(),
            progress: 5,
          },
        });
        generationId = generation.id;
        const job = await prisma.studioJob.create({
          data: {
            userId: session.user.id,
            projectId: project.id,
            generationId: generation.id,
            status: "RUNNING",
            stage: "LANGUAGE_DETECTION",
            progress: 8,
            currentModel: settings.model || "OpenRouter active model",
            startedAt: new Date(),
            logsJson: [{ type: "request_received", message: "Studio generation started" }] as Prisma.InputJsonValue,
          },
        });
        jobId = job.id;

        send("provider_scan", "Checking Studio provider layer", { localFirst: true });
        const providers = await listStudioProviderStatuses();
        send("provider_status", "Provider layer ready", {
          providers: providers.map((provider) => ({ key: provider.key, status: provider.status, message: provider.message })),
          policy: "No fake media generation. Missing providers block render jobs.",
        });

        send("language_detection", "Detecting language", { stage: "Language Detection" });
        send("prompt_enhancement", "Enhancing cinematic prompt", { styleLock: settings.styleLock });
        send("story_generation", "Writing story/script", { mode: project.mode });
        send("scene_breakdown", "Splitting scenes", { durationSec: settings.durationSec });
        send("storyboard_started", "Creating storyboard", { aspectRatio: settings.aspectRatio });

        const result = await enhanceStudioPrompt(body.data.prompt, settings, { userId: session.user.id });
        send("storyboard_ready", "Storyboard ready", { scenes: result.plan.scenes.length, model: result.model, provider: result.provider });
        send("shot_planner", "Building cinematic shot plan", { timeline: result.plan.timeline });

        await prisma.studioScene.deleteMany({ where: { generationId: generation.id } });
        await prisma.studioScene.createMany({
          data: result.plan.scenes.map((scene, index) => ({
            userId: session.user.id,
            projectId: project.id,
            generationId: generation.id,
            order: index + 1,
            title: scene.title,
            prompt: scene.prompt,
            negativePrompt: scene.negativePrompt,
            durationSec: scene.durationSec,
            camera: scene.camera,
            emotion: scene.emotion,
            lighting: scene.lighting,
            environment: scene.environment,
            charactersJson: (scene.characters || []) as Prisma.InputJsonValue,
            settingsJson: settings as Prisma.InputJsonValue,
          })),
        });
        send("timeline_updated", "Timeline updated", { scenes: result.plan.scenes.length });
        send("media_provider_plan", "Media provider plan prepared", {
          storyboardImages: "FLUX.1 Schnell through ComfyUI",
          draftPreview: "Wan 2.1 1.3B through ComfyUI",
          finalRender: "Wan 2.1 14B through ComfyUI",
          audio: ["XTTS v2", "MusicGen", "AudioGen"],
          export: "FFmpeg",
        });

        await prisma.studioGeneration.update({
          where: { id: generation.id },
          data: {
            status: "COMPLETED",
            detectedLanguage: result.plan.detectedLanguage,
            enhancedPrompt: result.plan.enhancedPrompt,
            negativePrompt: result.plan.negativePrompt,
            storyboardJson: result.plan as unknown as Prisma.InputJsonValue,
            model: result.model,
            provider: result.provider,
            progress: 100,
            completedAt: new Date(),
          },
        });
        await prisma.studioJob.update({
          where: { id: job.id },
          data: {
            status: "COMPLETED",
            stage: "STORYBOARD_READY",
            progress: 100,
            completedAt: new Date(),
            logsJson: [
              { type: "language_detection", message: result.plan.detectedLanguage },
              { type: "storyboard_ready", message: `${result.plan.scenes.length} scenes planned` },
            ] as Prisma.InputJsonValue,
          },
        });
        await prisma.studioHistory.create({
          data: {
            userId: session.user.id,
            projectId: project.id,
            generationId: generation.id,
            action: "generation_completed",
            summary: result.plan.summary,
            metadataJson: { model: result.model, provider: result.provider, usage: result.usage, studioProviders: providers } as Prisma.InputJsonValue,
          },
        });
        await prisma.studioProject.update({
          where: { id: project.id },
          data: {
            styleLock: settings.styleLock,
            aspectRatio: settings.aspectRatio,
            resolution: settings.resolution,
            durationSec: settings.durationSec,
            fps: settings.fps,
            seed: settings.seed,
            settingsJson: settings as Prisma.InputJsonValue,
          },
        });
        send("preview_ready", "Preview storyboard ready", {
          status: "storyboard_preview",
          renderer: "OpenRouter planning only",
          nextAction: "Configure local ComfyUI + Wan 2.1 to render video",
        });
        send("done", "Studio generation complete", { generationId: generation.id, projectId: project.id });
        controller.close();
      } catch (err) {
        const message = err instanceof Error ? err.message : "AI Studio generation failed";
        if (generationId) await prisma.studioGeneration.update({ where: { id: generationId }, data: { status: "FAILED", error: message, completedAt: new Date() } }).catch(() => undefined);
        if (jobId) await prisma.studioJob.update({ where: { id: jobId }, data: { status: "FAILED", stage: "FAILED", error: message, completedAt: new Date() } }).catch(() => undefined);
        send("error", message);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
