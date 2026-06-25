/**
 * POST /api/extensions/chat
 * Chat endpoint for the VS Code extension.
 * Uses Bearer JWT auth. Supports workspace context.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { extractBearerToken, verifyAnyExtensionToken } from "@/lib/extension-auth";
import { generateChatCompletion, ModelRouterError } from "@/lib/model-router";

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
    const message = await generateChatCompletion({
      messages: allMessages,
      model: model ?? undefined,
      timeoutMs: 60_000,
    });

    return NextResponse.json({
      message,
      user: { id: user.userId, email: user.email },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof ModelRouterError) {
      if (err.code === "rate_limit") {
        return NextResponse.json(
          { error: "Free model is temporarily rate limited. A fallback model was tried. Please retry in a moment." },
          { status: 429 }
        );
      }
      if (err.code === "missing_api_key") {
        return NextResponse.json({ error: "AI backend not configured on server." }, { status: 503 });
      }
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Chat failed" },
      { status: 500 }
    );
  }
}
