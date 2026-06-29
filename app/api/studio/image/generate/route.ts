import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { requireAuth } from "@/lib/role-guard";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL_MAP: Record<string, { id: string; label: string; steps?: number }> = {
  "FLUX.1 Schnell": { id: "black-forest-labs/FLUX.1-schnell", label: "FLUX.1 Schnell", steps: 4 },
  "FLUX Dev": { id: "black-forest-labs/FLUX.1-dev", label: "FLUX Dev", steps: 20 },
  SDXL: { id: "stabilityai/stable-diffusion-xl-base-1.0", label: "SDXL", steps: 30 },
  "Stable Diffusion XL": { id: "stabilityai/stable-diffusion-xl-base-1.0", label: "Stable Diffusion XL", steps: 30 },
};

const schema = z.object({
  projectId: z.string().min(1),
  prompt: z.string().min(3).max(6000),
  model: z.string().default("FLUX.1 Schnell"),
});

function getHuggingFaceToken() {
  return (
    process.env.HF_TOKEN ||
    process.env.HUGGINGFACE_API_KEY ||
    process.env.HUGGING_FACE_API_KEY ||
    process.env.HUGGINGFACE_TOKEN ||
    ""
  ).trim();
}

function cleanProviderMessage(status: number, detail: string) {
  if (status === 401 || status === 403) return "Hugging Face access is not authorized for this model. Check the API token and model access.";
  if (status === 404) return "Selected Hugging Face model was not found.";
  if (status === 429) return "Hugging Face is rate limiting requests. Please retry in a moment.";
  if (status === 503) return "The selected model is warming up or temporarily unavailable. Please retry shortly.";
  return detail.slice(0, 220) || "Image provider returned an error.";
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function callHuggingFaceImage(modelId: string, prompt: string, steps: number) {
  const token = getHuggingFaceToken();
  if (!token) {
    return {
      ok: false as const,
      status: 503,
      message: "Hugging Face API key is not configured. Add HF_TOKEN or HUGGINGFACE_API_KEY to the server environment.",
    };
  }

  let lastMessage = "Image generation failed.";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);
    try {
      const response = await fetch(`https://api-inference.huggingface.co/models/${modelId}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "image/png",
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: { num_inference_steps: steps },
          options: { wait_for_model: true, use_cache: false },
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const contentType = response.headers.get("content-type") || "";
      if (response.ok && contentType.startsWith("image/")) {
        const buffer = Buffer.from(await response.arrayBuffer());
        return {
          ok: true as const,
          mimeType: contentType.split(";")[0] || "image/png",
          dataUrl: `data:${contentType.split(";")[0] || "image/png"};base64,${buffer.toString("base64")}`,
        };
      }

      const detail = await response.text().catch(() => "");
      lastMessage = cleanProviderMessage(response.status, detail);
      if (![429, 500, 502, 503, 504].includes(response.status)) break;
    } catch (error) {
      clearTimeout(timeout);
      lastMessage = error instanceof DOMException && error.name === "AbortError"
        ? "Image generation timed out. Please retry with a shorter prompt or another model."
        : "Unable to reach Hugging Face image provider.";
    }
    await sleep(900 * (attempt + 1));
  }

  return { ok: false as const, status: 502, message: lastMessage };
}

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

  const project = await prisma.studioProject.findFirst({
    where: { id: parsed.data.projectId, userId: session.user.id },
  });
  if (!project) return NextResponse.json({ error: "Studio project not found" }, { status: 404 });

  const startedAt = new Date();
  const result = await callHuggingFaceImage(model.id, parsed.data.prompt.trim(), model.steps || 20);
  const completedAt = new Date();
  const generated = result.ok;
  const output = generated ? {
    id: `hf-${completedAt.getTime()}`,
    url: result.dataUrl,
    mimeType: result.mimeType,
    provider: "huggingface",
    model: model.label,
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
        provider: "huggingface",
        model: model.label,
        modelId: model.id,
        outputs: output ? [output] : [],
        error: generated ? null : result.message,
      } as Prisma.InputJsonValue,
      settingsJson: { model: model.label, provider: "huggingface" } as Prisma.InputJsonValue,
      model: model.label,
      provider: "huggingface",
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
      summary: generated ? "Image generated with Hugging Face." : result.message,
      metadataJson: {
        provider: "huggingface",
        model: model.label,
        modelId: model.id,
        durationMs: completedAt.getTime() - startedAt.getTime(),
      } as Prisma.InputJsonValue,
    },
  });

  await prisma.studioProject.update({
    where: { id: project.id },
    data: {
      mode: "TEXT_TO_IMAGE",
      settingsJson: {
        imagePrompt: parsed.data.prompt.trim(),
        imageModel: model.label,
        imageResults: output ? [{
          id: generation.id,
          url: output.url,
          enhancedPrompt: parsed.data.prompt.trim(),
          providerMessage: "Image generated with Hugging Face.",
          provider: "huggingface",
          model: model.label,
          createdAt: completedAt.toISOString(),
        }] : [],
      } as Prisma.InputJsonValue,
    },
  });

  if (!generated) {
    return NextResponse.json({
      error: result.message,
      generation,
      provider: "huggingface",
      model: model.label,
    }, { status: result.status || 502, headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.json({
    ok: true,
    generation,
    outputs: [output],
    provider: "huggingface",
    providerMessage: "Image generated with Hugging Face.",
    selectedProvider: "huggingface",
    model: model.label,
  }, { headers: { "Cache-Control": "no-store" } });
}
