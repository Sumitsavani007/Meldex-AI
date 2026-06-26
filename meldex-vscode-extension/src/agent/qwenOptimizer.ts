import * as vscode from "vscode";
import { WorkspaceCtx } from "../api/client";
import { BuiltContext } from "./contextBuilder";

export type QwenProfile =
  | "qwen_static_site"
  | "qwen_nextjs"
  | "qwen_react"
  | "qwen_node_api"
  | "qwen_php"
  | "qwen_python"
  | "qwen_debug"
  | "qwen_refactor"
  | "qwen_tests"
  | "qwen_ui_polish";

export interface OptimizedPrompt {
  task: string;
  context: WorkspaceCtx;
  profile: QwenProfile;
  reasoningSummary: string[];
  expectedPlanShape: string;
}

export function optimizeForQwen(userGoal: string, built: BuiltContext, terminalError?: string, orchestrationSection?: string): OptimizedPrompt {
  const profile = selectQwenProfile(userGoal, built.projectType, terminalError);
  const config = vscode.workspace.getConfiguration("meldex");
  const actionMode = config.get<boolean>("qwenActionMode") ?? true;
  const contextSize = config.get<number>("qwenContextSize") ?? 24000;
  const fileBlocks = built.relevantFiles
    .map((file) => `### ${file.path}\n\`\`\`\n${file.content}\n\`\`\``)
    .join("\n\n")
    .slice(0, contextSize);

  const commands = expectedCommands(userGoal, built.projectType, built.packageManager);
  const reasoningSummary = [
    `Detected ${built.projectType || "unknown project"}.`,
    `Selected ${built.relevantFiles.length} relevant file(s).`,
    commands.length ? `Will validate with ${commands.join(", ")}.` : "Validation will use detected checks.",
    terminalError ? "Existing error is included for minimal patching." : "No existing terminal error.",
  ];

  const expectedPlanShape = `{
  "goal": "...",
  "projectType": "${built.projectType}",
  "filesToRead": [],
  "filesToChange": [],
  "commandsToRun": [],
  "validationPlan": [],
  "riskLevel": "low|medium|high"
}`;

  const protocol = actionMode
    ? `Return valid JSON only. Use this compatible Agent Mode shape:
{
  "thoughtSummary": "safe reasoning summary only",
  "plan": ["step"],
  "files": [
    { "operation": "create|edit|delete", "path": "relative/path", "content": "full final file content", "description": "brief" }
  ],
  "commands": ["safe validation command"],
  "validation": ["check"],
  "summary": "brief result"
}
Do not return vague prose. Do not expose hidden chain-of-thought. Prefer minimal patches/full final file content for only changed files.`
    : "Return concise JSON with plan, files, commands, summary.";

  const task = `QWEN3-CODER MAX REQUEST

Profile: ${profile}
User goal:
${userGoal}

Reasoning summary to follow:
- ${reasoningSummary.join("\n- ")}

Required senior plan shape before editing:
${expectedPlanShape}

Project summary:
${built.summary}

${orchestrationSection ? `${orchestrationSection}\n` : ""}

Relevant context:
${fileBlocks || "(Empty or new workspace)"}

${terminalError ? `Existing error:\n\`\`\`\n${terminalError.slice(-5000)}\n\`\`\`\n` : ""}
Coding quality rules:
- production-ready, minimal, build-safe
- accessible and responsive for UI work
- typed when TypeScript
- no fake imports, dead code, or unnecessary dependencies
- preserve framework conventions

${protocol}`;

  return {
    task: task.slice(0, 3900),
    context: {
      ...built.context,
      terminalError,
      projectFiles: built.relevantFiles.map((file) => file.path),
      activeFileContent: built.context.activeFileContent,
    },
    profile,
    reasoningSummary,
    expectedPlanShape,
  };
}

export function selectQwenProfile(goal: string, projectType: string, terminalError?: string): QwenProfile {
  const lower = `${goal} ${projectType} ${terminalError ?? ""}`.toLowerCase();
  if (terminalError || /fix|bug|error|failed|debug/.test(lower)) return "qwen_debug";
  if (/test|spec|coverage/.test(lower)) return "qwen_tests";
  if (/refactor|cleanup|simplify/.test(lower)) return "qwen_refactor";
  if (/polish|responsive|style|css|landing|ui|design/.test(lower)) return projectType.toLowerCase().includes("unknown") ? "qwen_static_site" : "qwen_ui_polish";
  if (/next/.test(lower)) return "qwen_nextjs";
  if (/react|vite/.test(lower)) return "qwen_react";
  if (/api|endpoint|express|server/.test(lower)) return "qwen_node_api";
  if (/php|laravel/.test(lower)) return "qwen_php";
  if (/python|django|flask|fastapi/.test(lower)) return "qwen_python";
  if (/html|static|landing/.test(lower)) return "qwen_static_site";
  return projectType.toLowerCase().includes("next") ? "qwen_nextjs" : projectType.toLowerCase().includes("vite") ? "qwen_react" : "qwen_node_api";
}

export function isWeakAgentPlan(result: { plan?: string[]; files?: unknown[]; summary?: string }): boolean {
  if (!result) return true;
  const hasPlan = Array.isArray(result.plan) && result.plan.length > 0;
  const hasFiles = Array.isArray(result.files);
  const proseOnly = !hasFiles && !!result.summary;
  return !hasPlan || proseOnly;
}

export function reviewGeneratedActions(files: Array<{ operation: string; path: string; content?: string }>): string[] {
  const findings: string[] = [];
  for (const file of files) {
    if (!file.path || file.path.includes("..")) findings.push(`Unsafe path: ${file.path}`);
    if (/^\.env(\.|$)|\/\.env(\.|$)/.test(file.path)) findings.push(`Secret file blocked: ${file.path}`);
    if (file.operation !== "delete" && !file.content?.trim()) findings.push(`Empty content for ${file.path}`);
    if (/\.(ts|tsx|js|jsx)$/.test(file.path) && /from ["'][^"']+["']/.test(file.content ?? "")) {
      const fakeImport = (file.content ?? "").match(/from ["'](?:your-|some-|fake-|placeholder)/i);
      if (fakeImport) findings.push(`Placeholder import in ${file.path}`);
    }
  }
  return findings;
}

function expectedCommands(goal: string, projectType: string, pm: string): string[] {
  const lower = `${goal} ${projectType}`.toLowerCase();
  if (/next|vite|react|node/.test(lower)) return [`${pm} run build`];
  if (/test/.test(lower)) return [pm === "npm" ? "npm test" : `${pm} test`];
  if (/local server|preview|run/.test(lower)) return ["preview server"];
  return [];
}
