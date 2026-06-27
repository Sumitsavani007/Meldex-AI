/**
 * POST /api/extensions/chat
 * Chat endpoint for the Meldex extension.
 * Uses Bearer JWT auth. Supports workspace context.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ExtensionTokenError, extractBearerToken, requireExtensionScope, verifyAnyExtensionToken } from "@/lib/extension-auth";
import { generateChatCompletion, ModelRouterError } from "@/lib/model-router";
import { modelErrorStatus, toSafeProviderError } from "@/lib/provider-health";
import { canUseFeature, featureBlockedResponse } from "@/lib/plans-credits";
import { CHAT_QUALITY_CORPUS } from "@/lib/chat-quality-corpus";

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
    requireExtensionScope(user, "chat");
    for (const key of ["api_access", "vscode_extension", "chat"] as const) {
      const gate = await canUseFeature(user.userId, key);
      if (!gate.ok) return NextResponse.json(featureBlockedResponse(gate), { status: 402, headers: { "Cache-Control": "no-store" } });
    }
  } catch (err) {
    const code = err instanceof ExtensionTokenError ? err.code : "token_invalid";
    return NextResponse.json({ error: err instanceof Error ? err.message : "Invalid or expired token", code }, { status: 401 });
  }

  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { messages, model, context } = body.data;

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
    ? `You are Meldex AI coding assistant inside Meldex IDE.\n\n${CHAT_QUALITY_CORPUS}\n\n${contextParts.join("\n\n")}`
    : `You are Meldex AI, a helpful coding assistant.\n\n${CHAT_QUALITY_CORPUS}`;

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
      const safe = toSafeProviderError(err);
      return NextResponse.json(
        { error: safe.userMessage, providerError: safe },
        { status: modelErrorStatus(safe.code, safe.statusCode), headers: { "Cache-Control": "no-store" } }
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Chat failed" },
      { status: 500 }
    );
  }
}
