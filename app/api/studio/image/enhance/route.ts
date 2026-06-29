import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/role-guard";
import { generateChatCompletionWithUsage, ModelRouterError } from "@/lib/model-router";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  prompt: z.string().min(3).max(6000),
});

function cleanEnhancedPrompt(content: string) {
  return content
    .replace(/^```(?:text|json)?/i, "")
    .replace(/```$/i, "")
    .replace(/^enhanced prompt:\s*/i, "")
    .trim();
}

export async function POST(request: Request) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Prompt is required" }, { status: 400 });
  }

  try {
    const completion = await generateChatCompletionWithUsage({
      userId: session.user.id,
      taskType: "ai_studio_image_prompt_enhance",
      temperature: 0.55,
      maxTokens: 700,
      timeoutMs: 60_000,
      messages: [
        {
          role: "system",
          content: [
            "You are Meldex AI's image prompt enhancer.",
            "Understand Gujarati, Hindi, English, and mixed-language prompts.",
            "Rewrite the user's idea into one concise, production-ready English image prompt for a Hugging Face image model.",
            "Preserve the user's subject, identity, language intent, mood, and constraints.",
            "Do not add unrelated people, brands, text, logos, or extra requirements.",
            "Return only the enhanced prompt, no markdown and no JSON.",
          ].join("\n"),
        },
        { role: "user", content: parsed.data.prompt.trim() },
      ],
    });

    const enhancedPrompt = cleanEnhancedPrompt(completion.content);
    if (!enhancedPrompt) {
      return NextResponse.json({ error: "Prompt enhancement returned an empty response." }, { status: 502 });
    }

    return NextResponse.json({
      enhancedPrompt,
      provider: completion.provider,
      model: completion.model,
      usage: completion.usage,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const message = err instanceof ModelRouterError
      ? "Prompt enhancement is unavailable from the configured OpenRouter model."
      : "Prompt enhancement is unavailable right now.";
    return NextResponse.json({ error: message }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
