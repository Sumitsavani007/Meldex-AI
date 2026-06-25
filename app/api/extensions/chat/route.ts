/**
 * POST /api/extensions/chat
 * Chat endpoint for the VS Code extension.
 * Uses Bearer JWT auth. Supports workspace context.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { extractBearerToken, verifyAnyExtensionToken } from "@/lib/extension-auth";
import { getConfig } from "@/lib/runtime-config";

const schema = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant", "system"]), content: z.string() })).min(1),
  model: z.string().optional(),
  context: z.object({
    projectType: z.string().optional(),
    activeFile: z.string().optional(),
    activeFileContent: z.string().optional(),
    selectedText: z.string().optional(),
    workspaceName: z.string().optional(),
    recentFiles: z.array(z.string()).optional(),
    terminalError: z.string().optional(),
  }).optional(),
});

export async function POST(req: NextRequest) {
  // Auth
  const token = extractBearerToken(req.headers.get("authorization"));
  if (!token) return NextResponse.json({ error: "Authorization required" }, { status: 401 });

  let user: Awaited<ReturnType<typeof verifyAnyExtensionToken>>;
  try {
    user = await verifyAnyExtensionToken(token);
  } catch {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { messages, model, context } = body.data;
  const lastMessage = messages[messages.length - 1].content;

  // Build system context from workspace
  const contextParts: string[] = [];
  if (context?.workspaceName) contextParts.push(`Workspace: ${context.workspaceName}`);
  if (context?.projectType) contextParts.push(`Project type: ${context.projectType}`);
  if (context?.activeFile) contextParts.push(`Active file: ${context.activeFile}`);
  if (context?.selectedText) contextParts.push(`Selected text:\n\`\`\`\n${context.selectedText}\n\`\`\``);
  if (context?.terminalError) contextParts.push(`Terminal error:\n\`\`\`\n${context.terminalError}\n\`\`\``);
  if (context?.activeFileContent) {
    const preview = context.activeFileContent.slice(0, 2000);
    contextParts.push(`File content (preview):\n\`\`\`\n${preview}\n\`\`\``);
  }

  const systemContext = contextParts.length > 0
    ? `You are Meldex AI coding assistant inside VS Code.\n\n${contextParts.join("\n\n")}`
    : "You are Meldex AI, a helpful coding assistant.";

  const allMessages = [
    { role: "system" as const, content: systemContext },
    ...messages,
  ];

  try {
    const apiKey = await getConfig("OPENROUTER_API_KEY");
    const baseUrl = await getConfig("OPENROUTER_BASE_URL") ?? "https://openrouter.ai/api/v1";
    const defaultModel = model ?? await getConfig("OPENROUTER_MODEL") ?? "qwen/qwen3-coder:free";

    if (!apiKey) {
      return NextResponse.json({ error: "AI backend not configured" }, { status: 503 });
    }

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://meldex.newsyfly.com",
        "X-Title": "Meldex AI VS Code Extension",
      },
      body: JSON.stringify({
        model: defaultModel,
        messages: allMessages,
        max_tokens: 4096,
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `AI error: ${err}` }, { status: 502 });
    }

    const data = await res.json() as { choices?: { message?: { content?: string } }[] };
    const content = data?.choices?.[0]?.message?.content ?? "No response";

    return NextResponse.json({
      message: content,
      model: defaultModel,
      user: { id: user.userId, email: user.email },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Chat failed" },
      { status: 500 }
    );
  }
}
