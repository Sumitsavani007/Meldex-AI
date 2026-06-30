import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { requireAuth } from "@/lib/role-guard";
import { prisma } from "@/lib/prisma";
import { generateImageWithProvider } from "@/lib/ai-studio-image-provider";
import { calculateStudioCredits, precheckStudioCreditRequest, recordStudioCreditUsage } from "@/lib/plans-credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL_MAP: Record<string, { label: string }> = {
  "FLUX.1 Schnell": { label: "FLUX.1 Schnell" },
  "FLUX Dev": { label: "FLUX Dev" },
  SDXL: { label: "SDXL" },
  "Stable Diffusion XL": { label: "Stable Diffusion XL" },
};

const SCALE_MAP: Record<string, { width: number; height: number; size: string }> = {
  "1:1": { width: 1024, height: 1024, size: "1024 x 1024" },
  "9:16": { width: 768, height: 1344, size: "768 x 1344" },
  "16:9": { width: 1344, height: 768, size: "1344 x 768" },
};

const schema = z.object({
  projectId: z.string().min(1),
  prompt: z.string().min(3).max(6000),
  model: z.string().default("FLUX.1 Schnell"),
  imageScale: z.enum(["1:1", "9:16", "16:9"]).default("1:1"),
  width: z.number().int().min(256).max(1536).optional(),
  height: z.number().int().min(256).max(1536).optional(),
});

export async function POST(request: Request) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid image generation request" }, { status: 400 });
  }

  const model = MODEL_MAP[parsed.data.model];
  if (!model) {
    return NextResponse.json({ error: "Selected image model is not available yet." }, { status: 400 });
  }
  const scale = SCALE_MAP[parsed.data.imageScale] || SCALE_MAP["1:1"];
  const dimensions = {
    width: parsed.data.width || scale.width,
    height: parsed.data.height || scale.height,
  };

  const project = await prisma.studioProject.findFirst({
    where: { id: parsed.data.projectId, userId: session.user.id },
  });
  if (!project) return NextResponse.json({ error: "Studio project not found" }, { status: 404 });

  const creditEstimate = await calculateStudioCredits({
    kind: "image",
    provider: "comfy_cloud",
    model: model.label,
    width: dimensions.width,
    height: dimensions.height,
    imageCount: 1,
    referenceImages: 0,
    advancedSettings: 0,
    aspectRatio: parsed.data.imageScale,
  });
  const creditCheck = await precheckStudioCreditRequest({ userId: session.user.id, estimate: creditEstimate });
  if (!creditCheck.ok) {
    return NextResponse.json({
      error: creditCheck.message,
      code: creditCheck.legacyCode || creditCheck.code,
      limitType: creditCheck.limitType,
      currentUsage: creditCheck.currentUsage,
      limit: creditCheck.limit,
      resetAt: creditCheck.resetAt,
      recommendedPlan: creditCheck.recommendedPlan,
      estimate: { credits: creditEstimate.credits, provider: creditEstimate.provider, model: creditEstimate.model },
    }, { status: 402, headers: { "Cache-Control": "no-store" } });
  }

  const startedAt = new Date();
  const result = await generateImageWithProvider({
    prompt: parsed.data.prompt.trim(),
    negativePrompt: "low quality, blurry, distorted, watermark",
    settings: {
      imageModel: model.label,
      aspectRatio: parsed.data.imageScale,
      size: Math.max(dimensions.width, dimensions.height),
      quality: "Fast",
      steps: 4,
      mode: "Text only",
      identityLock: false,
      seedMode: "Random",
      seed: "",
      negativePrompt: "low quality, blurry, distorted, watermark",
      style: "Realistic",
      faceSimilarity: 0,
      referenceStrength: 0,
      preserveFaceStructure: false,
      preserveSkinTone: false,
      preserveHair: false,
      preserveAge: false,
      referenceType: "Style",
    },
    references: [],
    plan: {
      detectedLanguage: "unknown",
      enhancedPrompt: parsed.data.prompt.trim(),
      negativePrompt: "low quality, blurry, distorted, watermark",
      referenceSummary: "No reference images supplied.",
      providerPayload: {
        model: model.label,
        aspectRatio: parsed.data.imageScale,
        size: Math.max(dimensions.width, dimensions.height),
        quality: "Fast",
        steps: 4,
        seed: null,
        style: "Realistic",
        identityLock: false,
        faceSimilarity: 0,
        referenceStrength: 0,
        preserveFaceStructure: false,
        preserveSkinTone: false,
        preserveHair: false,
        preserveAge: false,
        referenceType: "Style",
      },
      notes: ["Comfy Cloud production image generation"],
    },
  });
  const completedAt = new Date();
  const generated = result.ok;
  const output = generated ? {
    id: `comfy-cloud-${completedAt.getTime()}`,
    url: result.outputs[0]?.url,
    mimeType: result.outputs[0]?.contentType || "image/png",
    provider: "comfy_cloud",
    model: model.label,
    aspectRatio: parsed.data.imageScale,
    size: `${dimensions.width} x ${dimensions.height}`,
    width: dimensions.width,
    height: dimensions.height,
    createdAt: completedAt.toISOString(),
  } : null;

  const generation = await prisma.studioGeneration.create({
    data: {
      userId: session.user.id,
      projectId: project.id,
      type: "TEXT_TO_IMAGE",
      status: generated ? "COMPLETED" : "FAILED",
      sourcePrompt: parsed.data.prompt.trim(),
      enhancedPrompt: parsed.data.prompt.trim(),
      storyboardJson: {
        kind: "minimal_image_generation",
        provider: "comfy_cloud",
        model: model.label,
        modelId: "comfy-cloud-flux-schnell",
        imageScale: parsed.data.imageScale,
        width: dimensions.width,
        height: dimensions.height,
        outputs: output ? [output] : [],
        providerStatus: {
          selectedProvider: "comfy_cloud",
          message: generated ? "Image generated with Comfy Cloud." : result.message,
        },
        error: generated ? null : result.message,
      } as Prisma.InputJsonValue,
      settingsJson: {
        model: model.label,
        provider: "comfy_cloud",
        imageScale: parsed.data.imageScale,
        width: dimensions.width,
        height: dimensions.height,
      } as Prisma.InputJsonValue,
      model: model.label,
      provider: "comfy_cloud",
      outputUrl: output?.url,
      thumbnailUrl: output?.url,
      error: generated ? null : result.message,
      progress: 100,
      startedAt,
      completedAt,
    },
  });

  await prisma.studioHistory.create({
    data: {
      userId: session.user.id,
      projectId: project.id,
      generationId: generation.id,
      action: generated ? "image_generation_completed" : "image_generation_failed",
      summary: generated ? "Image generated with Comfy Cloud." : result.message,
      metadataJson: {
        provider: "comfy_cloud",
        model: model.label,
        modelId: "comfy-cloud-flux-schnell",
        imageScale: parsed.data.imageScale,
        width: dimensions.width,
        height: dimensions.height,
        durationMs: completedAt.getTime() - startedAt.getTime(),
      } as Prisma.InputJsonValue,
    },
  });

  let usage = null;
  if (generated) {
    usage = await recordStudioCreditUsage({
      userId: session.user.id,
      credits: creditEstimate.credits,
      provider: "comfy_cloud",
      model: model.label,
      generationId: generation.id,
      projectId: project.id,
      mediaType: "image",
      prompt: parsed.data.prompt.trim(),
      metadata: {
        width: dimensions.width,
        height: dimensions.height,
        aspectRatio: parsed.data.imageScale,
        durationMs: completedAt.getTime() - startedAt.getTime(),
        breakdown: creditEstimate.breakdown,
      },
    });
  }

  await prisma.studioProject.update({
    where: { id: project.id },
    data: {
      mode: "TEXT_TO_IMAGE",
      settingsJson: {
        imagePrompt: parsed.data.prompt.trim(),
        imageModel: model.label,
        aspectRatio: parsed.data.imageScale,
        size: `${dimensions.width} x ${dimensions.height}`,
        imageResults: output ? [{
          id: generation.id,
          url: output.url,
          enhancedPrompt: parsed.data.prompt.trim(),
          providerMessage: "Image generated with Comfy Cloud.",
          provider: "comfy_cloud",
          model: model.label,
          aspectRatio: parsed.data.imageScale,
          size: `${dimensions.width} x ${dimensions.height}`,
          createdAt: completedAt.toISOString(),
        }] : [],
      } as Prisma.InputJsonValue,
    },
  });

  if (!generated) {
    return NextResponse.json({
      error: result.message,
      generation,
      provider: "comfy_cloud",
      model: model.label,
    }, { status: ("status" in result && result.status) ? result.status : 502, headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.json({
    ok: true,
    generation,
    outputs: [output],
    provider: "comfy_cloud",
    providerMessage: "Image generated with Comfy Cloud.",
    selectedProvider: "comfy_cloud",
    model: model.label,
    creditsUsed: creditEstimate.credits,
    usage: usage?.balance,
  }, { headers: { "Cache-Control": "no-store" } });
}
