/**
 * POST /api/extensions/agent
 * Agent endpoint for the VS Code extension.
 * Returns a structured plan with file changes.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { extractBearerToken, verifyAnyExtensionToken } from "@/lib/extension-auth";
import { getConfig } from "@/lib/runtime-config";

const schema = z.object({
  task: z.string().min(1).max(4000),
  model: z.string().optional(),
  context: z.object({
    projectType: z.string().optional(),
    workspaceName: z.string().optional(),
    activeFile: z.string().optional(),
    activeFileContent: z.string().optional(),
    selectedText: z.string().optional(),
    projectFiles: z.array(z.string()).optional(),
    terminalError: z.string().optional(),
    packageJson: z.string().optional(),
  }).optional(),
});

const AGENT_SYSTEM = `You are Meldex AI Agent — an expert coding assistant running inside VS Code.
You receive a task and workspace context, then return a structured JSON plan with file operations.

IMPORTANT: Always respond with valid JSON in this exact format:
{
  "plan": ["step 1", "step 2", ...],
  "files": [
    {
      "operation": "create" | "edit" | "delete",
      "path": "relative/path/to/file.ts",
      "content": "full file content here",
      "description": "what this change does"
    }
  ],
  "commands": ["npm install react", "npm run build"],
  "summary": "What was accomplished",
  "warnings": ["any important warnings"]
}

Rules:
- Use relative paths from workspace root
- For "edit" operations, provide the FULL new file content
- Only suggest safe commands (no rm -rf, sudo, etc.)
- Be concise in plan steps (max 6 steps)
- For large files, provide complete working code
- Follow the project type conventions`;

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

  const { task, model, context } = body.data;

  // Build context message
  const ctxParts: string[] = [`Task: ${task}`];
  if (context?.workspaceName) ctxParts.push(`Workspace: ${context.workspaceName}`);
  if (context?.projectType) ctxParts.push(`Project type: ${context.projectType}`);
  if (context?.activeFile) ctxParts.push(`Active file: ${context.activeFile}`);
  if (context?.packageJson) ctxParts.push(`package.json:\n${context.packageJson.slice(0, 1000)}`);
  if (context?.projectFiles?.length) ctxParts.push(`Project files:\n${context.projectFiles.slice(0, 30).join("\n")}`);
  if (context?.selectedText) ctxParts.push(`Selected code:\n\`\`\`\n${context.selectedText}\n\`\`\``);
  if (context?.activeFileContent) ctxParts.push(`Active file content:\n\`\`\`\n${context.activeFileContent.slice(0, 3000)}\n\`\`\``);
  if (context?.terminalError) ctxParts.push(`Terminal error:\n\`\`\`\n${context.terminalError}\n\`\`\``);

  try {
    const apiKey = await getConfig("OPENROUTER_API_KEY");
    const baseUrl = await getConfig("OPENROUTER_BASE_URL") ?? "https://openrouter.ai/api/v1";
    const agentModel = model ?? await getConfig("OPENROUTER_MODEL") ?? "qwen/qwen3-coder:free";

    if (!apiKey) return NextResponse.json({ error: "AI backend not configured" }, { status: 503 });

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://meldex.newsyfly.com",
        "X-Title": "Meldex AI Agent",
      },
      body: JSON.stringify({
        model: agentModel,
        messages: [
          { role: "system", content: AGENT_SYSTEM },
          { role: "user", content: ctxParts.join("\n\n") },
        ],
        max_tokens: 8192,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(90000),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `AI error: ${err}` }, { status: 502 });
    }

    const data = await res.json() as { choices?: { message?: { content?: string } }[] };
    const rawContent = data?.choices?.[0]?.message?.content ?? "{}";

    let plan: unknown;
    try {
      plan = JSON.parse(rawContent);
    } catch {
      plan = { plan: ["Task analysis completed"], files: [], commands: [], summary: rawContent };
    }

    return NextResponse.json({
      ...(plan as object),
      model: agentModel,
      user: { id: user.userId, email: user.email },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Agent failed" },
      { status: 500 }
    );
  }
}
