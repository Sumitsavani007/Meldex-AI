import { NextResponse } from "next/server";
import { chatRequestSchema, checkRateLimit } from "@/lib/security";
import { requireAuth } from "@/lib/role-guard";
import { generateChatCompletion, getActiveProvider, getProviderLabel, ModelRouterError } from "@/lib/model-router";

export async function POST(request: Request) {
  try {
    const { error } = await requireAuth();
    if (error) return error;

    checkRateLimit(request.headers.get("x-forwarded-for") || "local-chat", 40);

    const body = chatRequestSchema.parse(await request.json()) as {
      messages: { role: "system" | "user" | "assistant"; content: string }[];
      model?: string;
      // baseUrl kept for backwards-compat with local-dev override; ignored when
      // server-side provider is openrouter or custom.
      baseUrl?: string;
    };

    if (!body.messages.length) {
      return NextResponse.json({ error: "No chat messages were provided." }, { status: 400 });
    }

    const message = await generateChatCompletion({
      messages: body.messages,
      model: body.model,
    });

    return NextResponse.json({
      message,
      provider: getActiveProvider(),
      providerLabel: getProviderLabel(),
    });
  } catch (err) {
    if (err instanceof ModelRouterError) {
      const status =
        err.code === "missing_api_key" ? 401 :
        err.code === "rate_limit" ? 429 :
        err.code === "invalid_model" ? 400 :
        err.code === "network_failure" ? 503 : 502;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    const message = err instanceof Error ? err.message : "Chat request failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
