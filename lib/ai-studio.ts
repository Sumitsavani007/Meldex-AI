import { generateChatCompletionWithUsage, ModelRouterError } from "@/lib/model-router";

export type StudioSettings = {
  model?: string;
  resolution: string;
  durationSec: number;
  aspectRatio: string;
  fps: number;
  seed?: string;
  negativePrompt?: string;
  motionStrength: number;
  cameraMotion: string;
  styleLock: string;
  consistency: number;
};

export type StudioScenePlan = {
  title: string;
  prompt: string;
  negativePrompt?: string;
  durationSec: number;
  camera: string;
  emotion: string;
  lighting: string;
  environment: string;
  characters?: string[];
};

export type StudioPlan = {
  detectedLanguage: string;
  enhancedPrompt: string;
  negativePrompt: string;
  summary: string;
  style: string;
  scenes: StudioScenePlan[];
  timeline: Array<{ scene: number; start: number; end: number; label: string }>;
  generationNotes: string[];
};

const fallbackPlan = (prompt: string, settings: StudioSettings): StudioPlan => ({
  detectedLanguage: /[\u0A80-\u0AFF]/.test(prompt) ? "Gujarati" : /[\u0900-\u097F]/.test(prompt) ? "Hindi" : "English",
  enhancedPrompt: `${prompt.trim()} Cinematic, premium, emotionally clear, high production value, ${settings.styleLock} style, ${settings.cameraMotion} camera motion, ${settings.resolution}, ${settings.aspectRatio}.`,
  negativePrompt: settings.negativePrompt || "low quality, blurry, distorted faces, extra limbs, watermark, unreadable text",
  summary: "Cinematic AI video plan prepared from the prompt.",
  style: settings.styleLock,
  scenes: [
    {
      title: "Opening moment",
      prompt: prompt.trim(),
      negativePrompt: settings.negativePrompt,
      durationSec: Math.max(3, Math.round(settings.durationSec / 2)),
      camera: settings.cameraMotion,
      emotion: "immersive",
      lighting: "cinematic",
      environment: "story-driven environment",
      characters: [],
    },
    {
      title: "Resolution",
      prompt: `${prompt.trim()} with a polished ending shot and clear emotional payoff.`,
      negativePrompt: settings.negativePrompt,
      durationSec: Math.max(3, Math.round(settings.durationSec / 2)),
      camera: "slow push-in",
      emotion: "uplifting",
      lighting: "golden hour",
      environment: "premium cinematic scene",
      characters: [],
    },
  ],
  timeline: [
    { scene: 1, start: 0, end: Math.max(3, Math.round(settings.durationSec / 2)), label: "Opening moment" },
    { scene: 2, start: Math.max(3, Math.round(settings.durationSec / 2)), end: settings.durationSec, label: "Resolution" },
  ],
  generationNotes: ["OpenRouter produced a safe fallback plan. Video rendering provider can be connected behind this contract later."],
});

function parseJsonPlan(content: string, prompt: string, settings: StudioSettings): StudioPlan {
  const cleaned = content.replace(/^```json/i, "").replace(/^```/i, "").replace(/```$/i, "").trim();
  try {
    const parsed = JSON.parse(cleaned) as Partial<StudioPlan>;
    const scenes = Array.isArray(parsed.scenes) && parsed.scenes.length ? parsed.scenes : fallbackPlan(prompt, settings).scenes;
    return {
      detectedLanguage: parsed.detectedLanguage || fallbackPlan(prompt, settings).detectedLanguage,
      enhancedPrompt: parsed.enhancedPrompt || fallbackPlan(prompt, settings).enhancedPrompt,
      negativePrompt: parsed.negativePrompt || settings.negativePrompt || fallbackPlan(prompt, settings).negativePrompt,
      summary: parsed.summary || "Cinematic AI video plan prepared.",
      style: parsed.style || settings.styleLock,
      scenes: scenes.map((scene, index) => ({
        title: String(scene.title || `Scene ${index + 1}`),
        prompt: String(scene.prompt || prompt),
        negativePrompt: scene.negativePrompt ? String(scene.negativePrompt) : settings.negativePrompt,
        durationSec: Number(scene.durationSec || Math.max(3, Math.round(settings.durationSec / scenes.length))),
        camera: String(scene.camera || settings.cameraMotion),
        emotion: String(scene.emotion || "cinematic"),
        lighting: String(scene.lighting || "studio"),
        environment: String(scene.environment || "premium environment"),
        characters: Array.isArray(scene.characters) ? scene.characters.map(String) : [],
      })),
      timeline: Array.isArray(parsed.timeline) ? parsed.timeline.map((item, index) => ({
        scene: Number(item.scene || index + 1),
        start: Number(item.start || index * 4),
        end: Number(item.end || (index + 1) * 4),
        label: String(item.label || `Scene ${index + 1}`),
      })) : fallbackPlan(prompt, settings).timeline,
      generationNotes: Array.isArray(parsed.generationNotes) ? parsed.generationNotes.map(String) : [],
    };
  } catch {
    return fallbackPlan(prompt, settings);
  }
}

export async function enhanceStudioPrompt(prompt: string, settings: StudioSettings, runtime?: { userId?: string }) {
  const system = `You are Meldex AI Studio's cinematic director.
Use one OpenRouter model for language detection, prompt enhancement, scene breakdown, storyboard, and shot planning.
Return JSON only with:
{
  "detectedLanguage": "Gujarati|Hindi|English|Mixed|Other",
  "enhancedPrompt": "cinematic production prompt",
  "negativePrompt": "quality and artifact negatives",
  "summary": "short creative direction",
  "style": "style lock",
  "scenes": [{"title":"Scene 1","prompt":"shot prompt","negativePrompt":"optional","durationSec":4,"camera":"dolly","emotion":"hopeful","lighting":"golden hour","environment":"rainy street","characters":["name"]}],
  "timeline": [{"scene":1,"start":0,"end":4,"label":"Opening"}],
  "generationNotes": ["renderer-ready notes"]
}
Rules:
- Understand Gujarati, Hindi, English, and mixed-language prompts.
- Do not expose hidden reasoning.
- Make scenes editable and production-ready.
- Keep the plan suitable for future text-to-video, image-to-video, lip sync, upscale, subtitles, and social export.`;
  try {
    const completion = await generateChatCompletionWithUsage({
      model: settings.model,
      userId: runtime?.userId,
      taskType: "ai_studio_prompt_enhance",
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `Prompt:\n${prompt}\n\nSettings:\n${JSON.stringify(settings, null, 2)}`,
        },
      ],
    });
    return {
      plan: parseJsonPlan(completion.content, prompt, settings),
      provider: completion.provider,
      model: completion.model,
      usage: completion.usage,
    };
  } catch (error) {
    if (error instanceof ModelRouterError) throw error;
    throw new ModelRouterError(error instanceof Error ? error.message : "AI Studio prompt enhancement failed", "provider_error");
  }
}

export function studioSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42) || "studio-project";
}
