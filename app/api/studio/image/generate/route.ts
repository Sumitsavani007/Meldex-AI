import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { requireAuth } from "@/lib/role-guard";
import { prisma } from "@/lib/prisma";
import { enhanceImagePrompt, type ImageStudioSettings } from "@/lib/ai-studio-image";
import { listStudioProviderStatuses } from "@/lib/ai-studio-providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const referenceSchema = z.object({
  id: z.string(),
  type: z.enum(["Face", "Character", "Couple", "Style"]),
  name: z.string(),
  dataUrl: z.string().optional(),
  mimeType: z.string().optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
});

const schema = z.object({
  projectId: z.string().min(1),
  prompt: z.string().min(1).max(8000),
  settings: z.object({
    model: z.string().optional(),
    imageModel: z.string().default("FLUX.1 Schnell"),
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
    referenceType: z.enum(["Face", "Character", "Couple", "Style"]).default("Face"),
  }),
  references: z.array(referenceSchema).max(8).default([]),
});

function providerReady(status: string) {
  return status === "running" || status === "installed";
}

export async function POST(request: Request) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const body = schema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: body.error.issues[0]?.message || "Invalid image generation request" }, { status: 400 });

  const project = await prisma.studioProject.findFirst({ where: { id: body.data.projectId, userId: session.user.id } });
  if (!project) return NextResponse.json({ error: "Studio project not found" }, { status: 404 });

  const settings = body.data.settings as ImageStudioSettings;
  const providers = await listStudioProviderStatuses();
  const required = providers.filter((provider) => provider.key === "comfyui" || provider.key === "flux_schnell");
  const configured = required.length === 2 && required.every((provider) => providerReady(provider.status));
  const references = body.data.references.map((reference) => ({
    type: reference.type,
    name: reference.name,
    mimeType: reference.mimeType,
    sizeBytes: reference.sizeBytes,
  }));

  const result = await enhanceImagePrompt(body.data.prompt, settings, references, { userId: session.user.id });
  const status = configured ? "QUEUED" : "SETUP_REQUIRED";
  const message = configured
    ? "Image provider is configured. ComfyUI dispatch can run through this payload."
    : "Local image provider not configured.";

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
        providerStatus: { configured, message, required },
        outputs: [],
        notes: result.plan.notes,
      } as Prisma.InputJsonValue,
      settingsJson: { ...settings, references } as Prisma.InputJsonValue,
      model: result.model,
      provider: result.provider,
      progress: configured ? 25 : 100,
      startedAt: new Date(),
      completedAt: configured ? null : new Date(),
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
      action: configured ? "image_generation_queued" : "image_provider_setup_required",
      summary: configured ? "Image generation payload prepared." : "Local image provider not configured. Enhanced prompt is ready.",
      metadataJson: {
        model: result.model,
        provider: result.provider,
        usage: result.usage,
        providerStatus: { configured, required },
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
        imageResults: [],
      } as Prisma.InputJsonValue,
    },
  });

  return NextResponse.json({
    ok: true,
    generation,
    plan: result.plan,
    providerConfigured: configured,
    providerMessage: message,
    providerStatus: required,
    outputs: [],
  }, { headers: { "Cache-Control": "no-store" } });
}
