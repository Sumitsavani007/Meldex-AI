import { NextResponse } from "next/server";
import { chatRequestSchema, checkRateLimit } from "@/lib/security";
import { requireAuth } from "@/lib/role-guard";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export async function POST(request: Request) {
  try {
    const { error } = await requireAuth();
    if (error) return error;

    checkRateLimit(request.headers.get("x-forwarded-for") || "local-chat", 40);
    const body = chatRequestSchema.parse(await request.json()) as {
      messages: ChatMessage[];
      baseUrl?: string;
      model?: string;
    };

    const baseUrl = body.baseUrl?.trim() || "http://localhost:11434";
    const model = body.model?.trim() || "qwen3-coder:30b";
    const messages = body.messages;

    if (!messages.length) {
      return NextResponse.json({ error: "No chat messages were provided." }, { status: 400 });
    }

    const ollamaResponse = await fetch(`${baseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, stream: false }),
      signal: AbortSignal.timeout(60000)
    });

    if (!ollamaResponse.ok) {
      const detail = await ollamaResponse.text();
      return NextResponse.json(
        { error: `Ollama returned ${ollamaResponse.status}. ${detail || "Check the model name and local server."}` },
        { status: 502 }
      );
    }

    const data = await ollamaResponse.json();
    return NextResponse.json({ message: data.message?.content ?? data.response ?? "" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Unable to reach Ollama. Confirm it is running and accessible. Details: ${message}` },
      { status: 500 }
    );
  }
}
