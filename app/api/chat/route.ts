import { NextResponse } from "next/server";
import { chatRequestSchema, checkRateLimit } from "@/lib/security";
import { requireAuth } from "@/lib/role-guard";
import { generateChatCompletion, getActiveProvider, getProviderLabel, ModelRouterError } from "@/lib/model-router";
import { classifyIntent } from "@/lib/intent-router";
import { webSearch, buildSearchContext } from "@/lib/search";

const CHAT_SYSTEM_PROMPT = `You are Meldex AI, a helpful AI assistant.
Answer questions clearly and conversationally.
Support Gujarati, Hindi and English — respond in the same language the user writes in.
Do NOT create files, run commands, or modify any workspace unless the user explicitly asks to build or fix code.
Keep answers concise, accurate and useful.`;

const AGENT_SYSTEM_PROMPT = `You are Meldex AI Coding Agent.
Your job is to create, edit, and fix project files when the user asks for coding or build tasks.
Always show a plan first, then list changed files, and end with a clear summary.
Support Gujarati, Hindi and English — respond in the same language the user writes in.
Only perform file or system operations when explicitly requested.`;

const MATH_SYSTEM_PROMPT = `You are Meldex AI. Solve the mathematical problem accurately.
Show steps if needed. Support Gujarati, Hindi and English.`;

const SEARCH_SYSTEM_PROMPT = `You are Meldex AI with access to live web search results.
Use the provided search context to answer the question accurately.
Always mention when information comes from search results.
If the search result is insufficient, say so clearly.
Support Gujarati, Hindi and English — respond in the same language the user writes in.`;

export async function POST(request: Request) {
  try {
    const { error } = await requireAuth();
    if (error) return error;

    checkRateLimit(request.headers.get("x-forwarded-for") || "local-chat", 40);

    const body = chatRequestSchema.parse(await request.json()) as {
      messages: { role: "system" | "user" | "assistant"; content: string }[];
      model?: string;
      mode?: "chat" | "agent";
      baseUrl?: string;
    };

    if (!body.messages.length) {
      return NextResponse.json({ error: "No chat messages were provided." }, { status: 400 });
    }

    const userMessages = body.messages.filter((m) => m.role !== "system");
    const lastUserMessage = userMessages.filter((m) => m.role === "user").at(-1)?.content ?? "";

    // Classify intent from the latest user message
    const intent = classifyIntent(lastUserMessage);

    // Handle live_search intent
    if (intent.type === "live_search" && body.mode !== "agent") {
      try {
        const searchResult = await webSearch(lastUserMessage);
        const searchContext = buildSearchContext(searchResult);

        const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
          {
            role: "system",
            content: `${SEARCH_SYSTEM_PROMPT}\n\n## Live Search Results\n${searchContext}`,
          },
          ...userMessages,
        ];

        const message = await generateChatCompletion({ messages, model: body.model });

        return NextResponse.json({
          message,
          provider: getActiveProvider(),
          providerLabel: getProviderLabel(),
          intent: intent.type,
          sources: searchResult.sources,
          searchQuery: searchResult.searchQuery,
          searchProvider: searchResult.provider,
        });
      } catch {
        // Search failed — fall through to normal chat with a note
        const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
          {
            role: "system",
            content: `${CHAT_SYSTEM_PROMPT}\n\nNote: Live search is currently unavailable. Answer from your training knowledge and mention the limitation.`,
          },
          ...userMessages,
        ];
        const message = await generateChatCompletion({ messages, model: body.model });
        return NextResponse.json({
          message,
          provider: getActiveProvider(),
          providerLabel: getProviderLabel(),
          intent: "general_chat",
        });
      }
    }

    // Select system prompt based on mode/intent
    let systemPrompt = CHAT_SYSTEM_PROMPT;
    if (body.mode === "agent" || intent.type === "coding_agent") {
      systemPrompt = AGENT_SYSTEM_PROMPT;
    } else if (intent.type === "math_query") {
      systemPrompt = MATH_SYSTEM_PROMPT;
    }

    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: systemPrompt },
      ...userMessages,
    ];

    const message = await generateChatCompletion({ messages, model: body.model });

    return NextResponse.json({
      message,
      provider: getActiveProvider(),
      providerLabel: getProviderLabel(),
      intent: intent.type,
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

