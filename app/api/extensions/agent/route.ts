/**
 * POST /api/extensions/agent
 * Agent endpoint for the VS Code extension.
 * Returns a structured plan with file changes.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ExtensionTokenError, extractBearerToken, requireExtensionScope, verifyAnyExtensionToken } from "@/lib/extension-auth";
import { generateChatCompletion, ModelRouterError } from "@/lib/model-router";
import { getNumberSetting } from "@/lib/runtime-config";
import { modelErrorStatus, toSafeProviderError } from "@/lib/provider-health";

const schema = z.object({
  task: z.string().min(1).max(12000),
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

const AGENT_SYSTEM = `You are Meldex AI Agent powered by Qwen3-Coder — an expert coding assistant running inside VS Code.
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
  "thoughtSummary": "short safe reasoning summary only",
  "validation": ["checks to run"],
  "summary": "What was accomplished",
  "warnings": ["any important warnings"]
}

Rules:
- Use relative paths from workspace root
- For "edit" operations, provide the FULL new file content
- Only suggest safe commands (no rm -rf, sudo, etc.)
- Be concise in plan steps (max 6 steps)
- For large files, provide complete working code
- Follow the project type conventions
- Prefer minimal patches over unrelated rewrites
- Do not expose hidden chain-of-thought
- Do not invent fake imports or unnecessary dependencies`;

const CODING_ENGINE_V2 = `Coding Engine V2 rules for all coding tasks:
- Never directly generate random files. Internally run: understand request, detect project type, detect framework, plan architecture, plan files, plan reusable components, plan state/data flow, generate code, self-review, run checks, fix errors, refactor if needed, verify final output.
- Before coding decide project type, framework, folder structure, components, utilities, data model, API routes, validation, state management, styling approach, and testing approach.
- Static sites must remain dependency-free unless explicitly requested: index.html, style.css, script.js, README.md.
- React/Vite: use correct main entry, component imports, CSS import, and no Next-only APIs.
- Next.js: follow existing app/pages router conventions, server/client boundaries, metadata, imports, and route placement.
- Backend: prefer routes/controllers/services/middleware/validators/utils structure, validation, error handling, status codes, and security middleware where appropriate.
- Use reusable components, constants, helpers, clean naming, small functions, and separation of concerns.
- Avoid one giant file, repeated code, inline random styles, fake imports, unused imports, placeholder TODOs, broken paths, and duplicate logic.
- Never add dependencies unless necessary and already present. If a dependency is required, put it in warnings and commands; do not silently force installs for static tasks.
- When editing existing projects, read/preserve relevant style and patch the smallest possible files. Do not rewrite unrelated files.
- If no test framework exists, do not add a heavy test framework unless asked.
- README for generated projects must include what was built, how to run, file structure, preview command, and next steps.
- Internal quality target: code quality, architecture, maintainability, security, performance, and testing overall >= 85 before returning.`;

const WEBSITE_DESIGNER_V2 = `Website Designer Agent V2 rules for website/static/landing-page tasks:
- Never generate a bare hero/footer page. Internally run: intent detection, category detection, visual designer, UX planner, layout planner, section planner, animation planner, palette planner, typography planner, component planner, responsive planner, accessibility planner, code generation, self review, visual quality review, preview readiness, improve if needed.
- Detect category internally from: Restaurant, Hotel, Cafe, Portfolio, Agency, AI Startup, SaaS, E-commerce, Landing Page, Corporate, Healthcare, Education, Finance, Travel, Event, Photography, Construction, Real Estate, Gaming, Developer Tool, Open Source, Admin Dashboard, Blog, Documentation.
- Create a distinct design system before code: palette, typography, spacing, radius, buttons, cards, shadows, icons, animations.
- Use complete section plans. Restaurant includes hero, menu, popular items, chef, gallery, testimonials, location, reservation CTA, footer. SaaS includes hero, features, how it works, integrations, pricing, testimonials, FAQ, CTA, footer. Portfolio includes hero, projects, skills, experience, testimonials, contact, footer.
- If prompt says animated, modern, beautiful, premium, creative, or interactive, include tasteful IntersectionObserver reveals, hover motion, smooth scrolling, gradient/glass effects, and reduced-motion support.
- Static HTML tasks should create only index.html, style.css, script.js, README.md unless the user explicitly asks for a framework.
- Quality bar: output must feel client-ready, comparable to a skilled frontend engineer, not a basic school assignment. Internal visual score must be 90+ before returning.`;

function isWebsiteTask(task: string) {
  return /\b(website|landing page|restaurant|hotel|cafe|portfolio|agency|saas|e-?commerce|travel|event|photography|real estate|developer tool|animated|beautiful|premium)\b/i.test(task);
}

export async function POST(req: NextRequest) {
  // Auth
  const token = extractBearerToken(req.headers.get("authorization"));
  if (!token) return NextResponse.json({ error: "Authorization required" }, { status: 401 });

  let user: Awaited<ReturnType<typeof verifyAnyExtensionToken>>;
  try {
    user = await verifyAnyExtensionToken(token);
    requireExtensionScope(user, "agent");
  } catch (err) {
    const code = err instanceof ExtensionTokenError ? err.code : "token_invalid";
    return NextResponse.json({ error: err instanceof Error ? err.message : "Invalid or expired token", code }, { status: 401 });
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
    const temperature = await getNumberSetting("QWEN_TEMPERATURE", 0.2);
    const maxTokens = await getNumberSetting("QWEN_MAX_TOKENS", 8192);
    const timeoutMs = await getNumberSetting("QWEN_TIMEOUT_MS", 90000);

    const rawContent = await generateChatCompletion({
      model,
      temperature,
      maxTokens,
      timeoutMs,
      messages: [
        { role: "system", content: `${AGENT_SYSTEM}\n${CODING_ENGINE_V2}\n${isWebsiteTask(task) ? `\n${WEBSITE_DESIGNER_V2}` : ""}\nReturn JSON only. No markdown fences.` },
        { role: "user", content: ctxParts.join("\n\n") },
      ],
    });

    let plan: unknown;
    try {
      plan = JSON.parse(rawContent);
    } catch {
      plan = { plan: ["Task analysis completed"], files: [], commands: [], summary: rawContent };
    }

    return NextResponse.json({
      ...(plan as object),
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
      { error: err instanceof Error ? err.message : "Agent failed" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
