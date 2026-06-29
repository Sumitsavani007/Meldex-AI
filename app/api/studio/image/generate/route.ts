import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { requireAuth } from "@/lib/role-guard";
import { prisma } from "@/lib/prisma";
import { enhanceImagePrompt, type ImageStudioSettings } from "@/lib/ai-studio-image";
import { generateImageWithProvider, getImageProviderStatuses, selectImageProvider } from "@/lib/ai-studio-image-provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const referenceSchema = z.object({
  id: z.string(),
  type: z.enum(["Face", "Character", "Couple", "Style"]),
  name: z.string(),
  dataUrl: z.string().max(12_000_000).optional(),
  mimeType: z.string().optional(),
  sizeBytes: z.number().int().nonnegative().max(8 * 1024 * 1024).optional(),
});

const schema = z.object({
  projectId: z.string().min(1),
  prompt: z.string().min(1).max(8000),
  settings: z.object({
    model: z.string().optional(),
    imageModel: z.string().default("SDXL Turbo"),
    mode: z.enum(["Text only", "My face", "Couple photo", "Two face references", "Character reference", "Style reference"]).default("Text only"),
    aspectRatio: z.string().default("16:9"),
    size: z.number().int().min(256).max(2048).default(1024),
    quality: z.string().default("Balanced"),
    seedMode: z.enum(["Random", "Custom"]).default("Random"),
    seed: z.string().optional(),
    steps: z.number().int().min(1).max(60).default(8),
    negativePrompt: z.string().optional(),
    style: z.string().default("Realistic"),
    identityLock: z.boolean().default(false),
    faceSimilarity: z.number().min(50).max(100).default(90),
    referenceStrength: z.number().min(0).max(100).default(80),
    preserveFaceStructure: z.boolean().default(true),
    preserveSkinTone: z.boolean().default(true),
    preserveHair: z.boolean().default(true),
    preserveAge: z.boolean().default(true),
    referenceType: z.enum(["Face", "Character", "Couple", "Style"]).default("Face"),
  }),
  references: z.array(referenceSchema).max(8).default([]),
});

export async function POST(request: Request) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const body = schema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: body.error.issues[0]?.message || "Invalid image generation request" }, { status: 400 });

  const project = await prisma.studioProject.findFirst({ where: { id: body.data.projectId, userId: session.user.id } });
  if (!project) return NextResponse.json({ error: "Studio project not found" }, { status: 404 });
  const invalidReference = body.data.references.find((reference) => {
    if (reference.mimeType && !reference.mimeType.startsWith("image/")) return true;
    if (reference.dataUrl && !reference.dataUrl.startsWith("data:image/") && !/^https:\/\//.test(reference.dataUrl)) return true;
    return false;
  });
  if (invalidReference) return NextResponse.json({ error: "Only image references are allowed" }, { status: 400 });

  const settings = body.data.settings as ImageStudioSettings;
  const references = body.data.references.map((reference) => ({
    type: reference.type,
    name: reference.name,
    mimeType: reference.mimeType,
    sizeBytes: reference.sizeBytes,
    dataUrl: reference.dataUrl,
  }));

  const result = await enhanceImagePrompt(body.data.prompt, settings, references, { userId: session.user.id });
  const selectedProvider = selectImageProvider({ references, settings });
  const providerStatuses = await getImageProviderStatuses();
  const generationResult = await generateImageWithProvider({
    prompt: result.plan.enhancedPrompt,
    negativePrompt: result.plan.negativePrompt,
    settings,
    references,
    plan: result.plan,
  });
  const generated = generationResult.ok;
  const status = generated ? "COMPLETED" : "FAILED";
  const message = generated ? "Image generated successfully." : generationResult.message;
  const outputs = generated ? generationResult.outputs : [];

  const generation = await prisma.studioGeneration.create({
    data: {
      userId: session.user.id,
      projectId: project.id,
      type: "TEXT_TO_IMAGE",
      status,
      sourcePrompt: body.data.prompt,
      detectedLanguage: result.plan.detectedLanguage,
      enhancedPrompt: result.plan.enhancedPrompt,
      negativePrompt: result.plan.negativePrompt,
      storyboardJson: {
        kind: "image_generation",
        referenceSummary: result.plan.referenceSummary,
        providerPayload: result.plan.providerPayload,
        providerStatus: { configured: generated, message, selectedProvider, providers: providerStatuses },
        outputs,
        notes: result.plan.notes,
        providerError: generationResult.ok ? null : { code: generationResult.code, message: generationResult.message },
      } as Prisma.InputJsonValue,
      settingsJson: { ...settings, references } as Prisma.InputJsonValue,
      model: result.model,
      provider: result.provider,
      outputUrl: outputs[0]?.url,
      thumbnailUrl: outputs[0]?.url,
      error: generated ? null : generationResult.message,
      progress: 100,
      startedAt: new Date(),
      completedAt: new Date(),
    },
  });

  if (body.data.references.length) {
    await prisma.studioAsset.createMany({
      data: body.data.references.map((reference) => ({
        userId: session.user.id,
        projectId: project.id,
        type: `IMAGE_REFERENCE_${reference.type.toUpperCase()}`,
        name: reference.name,
        url: reference.dataUrl,
        mimeType: reference.mimeType,
        sizeBytes: reference.sizeBytes || 0,
        metadataJson: {
          source: "generate_image",
          identityLock: settings.identityLock,
          faceSimilarity: settings.faceSimilarity,
          referenceType: reference.type,
        } as Prisma.InputJsonValue,
      })),
    });
  }

  await prisma.studioHistory.create({
    data: {
      userId: session.user.id,
      projectId: project.id,
      generationId: generation.id,
      action: generated ? "image_generation_completed" : "image_generation_failed",
      summary: generated ? "Image generated successfully." : message,
      metadataJson: {
        model: result.model,
        provider: result.provider,
        usage: result.usage,
        imageProvider: selectedProvider,
        providerStatus: { generated, providers: providerStatuses },
        outputs,
        referenceCount: body.data.references.length,
      } as Prisma.InputJsonValue,
    },
  });

  await prisma.studioProject.update({
    where: { id: project.id },
    data: {
      mode: "TEXT_TO_IMAGE",
      aspectRatio: settings.aspectRatio,
      resolution: `${settings.size}`,
      seed: settings.seedMode === "Custom" ? settings.seed : null,
      styleLock: settings.style,
      settingsJson: {
        imagePrompt: body.data.prompt,
        imageSettings: settings,
        imageReferences: body.data.references,
        imageResults: outputs.map((output) => ({
          id: generation.id,
          url: output.url,
          enhancedPrompt: result.plan.enhancedPrompt,
          negativePrompt: result.plan.negativePrompt,
          providerMessage: message,
          provider: selectedProvider,
          seed: output.seed ?? result.plan.providerPayload.seed,
          size: settings.size,
          aspectRatio: settings.aspectRatio,
          model: settings.imageModel,
          createdAt: generation.createdAt.toISOString(),
        })),
      } as Prisma.InputJsonValue,
    },
  });

  return NextResponse.json({
    ok: true,
    generation,
    plan: result.plan,
    providerConfigured: generated,
    providerMessage: message,
    providerStatus: providerStatuses,
    selectedProvider,
    outputs,
  }, { headers: { "Cache-Control": "no-store" } });
}
