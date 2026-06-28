import { generateChatCompletionWithUsage, ModelRouterError } from "@/lib/model-router";

export type ImageStudioSettings = {
  model?: string;
  imageModel: string;
  aspectRatio: string;
  size: number;
  quality: string;
  seedMode: "Random" | "Custom";
  seed?: string;
  steps: number;
  negativePrompt?: string;
  style: string;
  identityLock: boolean;
  faceSimilarity: number;
  referenceType: "Face" | "Character" | "Couple" | "Style";
};

export type ImageReferenceSummary = {
  type: string;
  name: string;
  mimeType?: string;
  sizeBytes?: number;
};

export type ImagePromptPlan = {
  detectedLanguage: string;
  enhancedPrompt: string;
  negativePrompt: string;
  referenceSummary: string;
  providerPayload: {
    model: string;
    aspectRatio: string;
    size: number;
    quality: string;
    steps: number;
    seed: string | null;
    style: string;
    identityLock: boolean;
    faceSimilarity: number;
    referenceType: string;
  };
  notes: string[];
};

function fallbackImagePlan(prompt: string, settings: ImageStudioSettings, references: ImageReferenceSummary[]): ImagePromptPlan {
  const detectedLanguage = /[\u0A80-\u0AFF]/.test(prompt) ? "Gujarati" : /[\u0900-\u097F]/.test(prompt) ? "Hindi" : /[A-Za-z]/.test(prompt) ? "Mixed/English" : "Other";
  const referenceText = references.length
    ? `${references.length} reference image(s): ${references.map((item) => `${item.type} ${item.name}`).join(", ")}.`
    : "No reference images supplied.";
  return {
    detectedLanguage,
    enhancedPrompt: `${prompt.trim()} Ultra-realistic premium image, cinematic composition, natural skin texture, professional lighting, ${settings.style} style, ${settings.aspectRatio} aspect ratio, high detail. ${settings.identityLock ? `Preserve identity from references with ${settings.faceSimilarity}% face similarity.` : ""}`.trim(),
    negativePrompt: settings.negativePrompt || "low quality, blurry, distorted face, extra fingers, duplicate people, watermark, bad anatomy, over-smoothed skin",
    referenceSummary: referenceText,
    providerPayload: {
      model: settings.imageModel,
      aspectRatio: settings.aspectRatio,
      size: settings.size,
      quality: settings.quality,
      steps: settings.steps,
      seed: settings.seedMode === "Custom" && settings.seed ? settings.seed : null,
      style: settings.style,
      identityLock: settings.identityLock,
      faceSimilarity: settings.faceSimilarity,
      referenceType: settings.referenceType,
    },
    notes: ["Local image provider was not contacted by this fallback plan."],
  };
}

function parseImagePlan(content: string, prompt: string, settings: ImageStudioSettings, references: ImageReferenceSummary[]) {
  const cleaned = content.replace(/^```json/i, "").replace(/^```/i, "").replace(/```$/i, "").trim();
  try {
    const parsed = JSON.parse(cleaned) as Partial<ImagePromptPlan>;
    const fallback = fallbackImagePlan(prompt, settings, references);
    return {
      detectedLanguage: parsed.detectedLanguage || fallback.detectedLanguage,
      enhancedPrompt: parsed.enhancedPrompt || fallback.enhancedPrompt,
      negativePrompt: parsed.negativePrompt || fallback.negativePrompt,
      referenceSummary: parsed.referenceSummary || fallback.referenceSummary,
      providerPayload: {
        ...fallback.providerPayload,
        ...(parsed.providerPayload || {}),
      },
      notes: Array.isArray(parsed.notes) ? parsed.notes.map(String) : fallback.notes,
    } satisfies ImagePromptPlan;
  } catch {
    return fallbackImagePlan(prompt, settings, references);
  }
}

export async function enhanceImagePrompt(
  prompt: string,
  settings: ImageStudioSettings,
  references: ImageReferenceSummary[],
  runtime?: { userId?: string },
) {
  const system = `You are Meldex AI Studio's image prompt director.
Understand Gujarati, Hindi, English, and mixed-language prompts.
Convert user intent into a cinematic English image prompt for FLUX/SDXL.
Preserve identity intent when references are supplied, but do not claim an image was generated.
Return JSON only:
{
  "detectedLanguage": "Gujarati|Hindi|English|Mixed|Other",
  "enhancedPrompt": "production-ready image prompt in English",
  "negativePrompt": "artifact and safety negatives",
  "referenceSummary": "short summary of references and identity lock intent",
  "providerPayload": {
    "model": "FLUX.1 Schnell",
    "aspectRatio": "16:9",
    "size": 1024,
    "quality": "Balanced",
    "steps": 8,
    "seed": null,
    "style": "Realistic",
    "identityLock": true,
    "faceSimilarity": 90,
    "referenceType": "Couple"
  },
  "notes": ["renderer-ready note"]
}`;

  try {
    const completion = await generateChatCompletionWithUsage({
      model: settings.model,
      userId: runtime?.userId,
      taskType: "ai_studio_image_prompt_enhance",
      maxTokens: 1800,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `User prompt:\n${prompt}\n\nImage settings:\n${JSON.stringify(settings, null, 2)}\n\nReference images:\n${JSON.stringify(references, null, 2)}`,
        },
      ],
    });
    return {
      plan: parseImagePlan(completion.content, prompt, settings, references),
      provider: completion.provider,
      model: completion.model,
      usage: completion.usage,
    };
  } catch (error) {
    if (error instanceof ModelRouterError) throw error;
    throw new ModelRouterError(error instanceof Error ? error.message : "Image prompt enhancement failed", "provider_error");
  }
}
