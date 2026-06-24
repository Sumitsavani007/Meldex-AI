/**
 * lib/planning-brain.ts
 *
 * Architecture & Task Planner.
 * Before the Coding Agent executes, the Planning Brain generates:
 * - Architecture overview
 * - Technology choices with rationale
 * - File structure plan
 * - Ordered task list
 * - Execution checklist for the agent
 */

import { generateChatCompletion } from "./model-router";
import type { ChatMessage } from "./model-router";

// ── Types ────────────────────────────────────────────────────────────────────

export interface PlannedTask {
  id: number;
  title: string;
  description: string;
  agent: "planner" | "architect" | "coder" | "tester" | "reviewer";
  dependsOn: number[];
  priority: "critical" | "high" | "medium" | "low";
}

export interface FilePlan {
  path: string;
  purpose: string;
  language: string;
}

export interface ArchitecturePlan {
  projectName: string;
  overview: string;
  techStack: string[];
  architecture: string;
  filePlan: FilePlan[];
  tasks: PlannedTask[];
  estimatedComplexity: "simple" | "moderate" | "complex";
  rawPlan: string;
}

// ── System prompt ─────────────────────────────────────────────────────────────

const PLANNER_SYSTEM = `You are Meldex AI Planning Brain — a senior software architect.

When a user describes a project or feature to build, you output a COMPLETE PLAN in JSON.

RESPONSE FORMAT (strict JSON, no markdown around it):
{
  "projectName": "short-name",
  "overview": "1-2 sentence description",
  "techStack": ["Next.js 15", "Prisma", "PostgreSQL", ...],
  "architecture": "Description of system architecture and data flow",
  "estimatedComplexity": "simple|moderate|complex",
  "filePlan": [
    { "path": "app/...", "purpose": "...", "language": "typescript" }
  ],
  "tasks": [
    {
      "id": 1,
      "title": "...",
      "description": "...",
      "agent": "planner|architect|coder|tester|reviewer",
      "dependsOn": [],
      "priority": "critical|high|medium|low"
    }
  ]
}

Rules:
- Be specific and actionable
- filePlan should list every file that needs to be created or modified
- tasks should be in logical order, respecting dependencies
- Use the existing Meldex stack when appropriate (Next.js App Router, Prisma, Tailwind, TypeScript)
- Output ONLY the JSON object, nothing else`;

// ── JSON parser with fallback ─────────────────────────────────────────────────

function safeParsePlan(raw: string, projectName: string): ArchitecturePlan {
  // Try to extract JSON block
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        projectName: parsed.projectName ?? projectName,
        overview: parsed.overview ?? "No overview generated.",
        techStack: Array.isArray(parsed.techStack) ? parsed.techStack : [],
        architecture: parsed.architecture ?? "",
        filePlan: Array.isArray(parsed.filePlan) ? parsed.filePlan : [],
        tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
        estimatedComplexity: parsed.estimatedComplexity ?? "moderate",
        rawPlan: raw,
      };
    } catch { /* fall through */ }
  }

  // Fallback: return raw as overview
  return {
    projectName,
    overview: raw.slice(0, 300),
    techStack: [],
    architecture: raw,
    filePlan: [],
    tasks: [],
    estimatedComplexity: "moderate",
    rawPlan: raw,
  };
}

// ── Main plan function ────────────────────────────────────────────────────────

export async function createPlan(
  request: string,
  context?: string,
  model?: string
): Promise<ArchitecturePlan> {
  const messages: ChatMessage[] = [
    { role: "system", content: PLANNER_SYSTEM },
    {
      role: "user",
      content: context
        ? `${request}\n\nAdditional context:\n${context}`
        : request,
    },
  ];

  const raw = await generateChatCompletion({
    messages,
    model,
    maxTokens: 2048,
    temperature: 0.3,
  });

  // Extract project name from first few words of request
  const nameParts = request
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .split(" ")
    .filter(Boolean)
    .slice(0, 4)
    .join("-")
    .toLowerCase();

  return safeParsePlan(raw, nameParts || "new-project");
}

// ── Format plan as human-readable Markdown ────────────────────────────────────

export function formatPlanMarkdown(plan: ArchitecturePlan): string {
  const lines: string[] = [
    `## Architecture Plan: ${plan.projectName}`,
    "",
    `**Complexity:** ${plan.estimatedComplexity}`,
    "",
    `### Overview`,
    plan.overview,
    "",
  ];

  if (plan.techStack.length) {
    lines.push("### Tech Stack");
    plan.techStack.forEach((t) => lines.push(`- ${t}`));
    lines.push("");
  }

  if (plan.architecture) {
    lines.push("### Architecture");
    lines.push(plan.architecture);
    lines.push("");
  }

  if (plan.filePlan.length) {
    lines.push("### Files to Create/Modify");
    lines.push("| Path | Purpose | Language |");
    lines.push("|------|---------|----------|");
    plan.filePlan.forEach((f) =>
      lines.push(`| \`${f.path}\` | ${f.purpose} | ${f.language} |`)
    );
    lines.push("");
  }

  if (plan.tasks.length) {
    lines.push("### Tasks");
    plan.tasks.forEach((t) => {
      const deps = t.dependsOn.length ? ` _(after #${t.dependsOn.join(", #")})_` : "";
      lines.push(`**${t.id}. [${t.agent.toUpperCase()}] ${t.title}**${deps}`);
      lines.push(t.description);
      lines.push("");
    });
  }

  return lines.join("\n");
}

// ── Detection: when to use planning brain ────────────────────────────────────

const PLANNING_PATTERNS = [
  /build (a |an |the )?(full|complete|saas|app|platform|system|website|api|backend|frontend)/i,
  /create (a |an |the )?(full|complete|saas|app|platform|system|website|api)/i,
  /design.*architecture/i,
  /plan.*project|project.*plan/i,
  /scaffold.*project/i,
  /start.*from scratch/i,
  /new (project|app|system|service|platform)/i,
  /architecture.*for/i,
  /how (should|would) (i|we) structure/i,
  /implement.*feature.*from scratch/i,
];

export function needsPlanning(message: string): boolean {
  return PLANNING_PATTERNS.some((p) => p.test(message));
}
