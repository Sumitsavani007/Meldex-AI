/**
 * lib/multi-agent.ts
 *
 * Multi-Agent Coordinator
 * Pipeline: Planner → Researcher → Coder → Tester → Reviewer
 *
 * Each agent has a specific role and system prompt.
 * The Coordinator manages the flow and assembles the final output.
 */

import { generateChatCompletion } from "./model-router";
import type { ChatMessage } from "./model-router";

// ── Agent definitions ─────────────────────────────────────────────────────────

export type AgentName = "planner" | "researcher" | "coder" | "tester" | "reviewer";

export interface AgentResult {
  agent: AgentName;
  output: string;
  durationMs: number;
}

export interface MultiAgentResult {
  task: string;
  agents: AgentResult[];
  finalAnswer: string;
  totalMs: number;
}

// ── Agent system prompts ──────────────────────────────────────────────────────

const AGENT_PROMPTS: Record<AgentName, string> = {
  planner: `You are the Planner Agent in a multi-agent AI system.
Your job: Break the user's task into a clear, ordered list of sub-tasks.
Output a numbered list of steps. Be specific and actionable.
Do NOT write code yet. Identify what needs to be built and in what order.`,

  researcher: `You are the Researcher Agent in a multi-agent AI system.
You receive a task and the Planner's plan.
Your job: For each planned step, identify the best approach, relevant APIs,
libraries, patterns, or caveats. Output concise research notes per step.`,

  coder: `You are the Coder Agent in a multi-agent AI system.
You receive a task, a plan, and research notes.
Your job: Write the actual implementation code.
Use TypeScript, React, Next.js App Router patterns unless specified otherwise.
Show complete, working code with file paths clearly marked.`,

  tester: `You are the Tester Agent in a multi-agent AI system.
You receive a task, plan, research, and the code implementation.
Your job: Review the code for bugs, edge cases, security issues, and missing tests.
Write test cases or suggest fixes. Be specific with line-level feedback.`,

  reviewer: `You are the Reviewer Agent in a multi-agent AI system.
You receive all previous agents' output.
Your job: Final quality review. Check:
- Does the code solve the original task?
- Is it production-ready?
- Any last improvements?
Write a final summary and the polished final answer for the user.`,
};

// ── Context accumulator ───────────────────────────────────────────────────────

function buildAgentContext(task: string, results: AgentResult[]): string {
  const parts = [`Original Task: ${task}`];
  for (const r of results) {
    parts.push(`\n[${r.agent.toUpperCase()} OUTPUT]\n${r.output}`);
  }
  return parts.join("\n\n");
}

// ── Run a single agent ────────────────────────────────────────────────────────

async function runAgent(
  name: AgentName,
  task: string,
  previousResults: AgentResult[],
  model?: string
): Promise<AgentResult> {
  const t0 = Date.now();

  const context = buildAgentContext(task, previousResults);
  const messages: ChatMessage[] = [
    { role: "system", content: AGENT_PROMPTS[name] },
    { role: "user", content: context },
  ];

  const output = await generateChatCompletion({
    messages,
    model,
    maxTokens: 1500,
    temperature: name === "coder" ? 0.2 : 0.4,
  });

  return { agent: name, output, durationMs: Date.now() - t0 };
}

// ── Full pipeline ─────────────────────────────────────────────────────────────

export async function runMultiAgent(
  task: string,
  model?: string,
  /**
   * Which agents to include. Defaults to full pipeline.
   * For simple coding tasks, ["planner", "coder", "reviewer"] is faster.
   */
  pipeline: AgentName[] = ["planner", "researcher", "coder", "tester", "reviewer"]
): Promise<MultiAgentResult> {
  const t0 = Date.now();
  const results: AgentResult[] = [];

  for (const agentName of pipeline) {
    const result = await runAgent(agentName, task, results, model);
    results.push(result);
  }

  // Final answer is the reviewer's output (or last agent if no reviewer)
  const finalResult =
    results.find((r) => r.agent === "reviewer") ?? results[results.length - 1];

  return {
    task,
    agents: results,
    finalAnswer: finalResult.output,
    totalMs: Date.now() - t0,
  };
}

// ── Fast pipeline: Planner + Coder + Reviewer (no researcher/tester) ──────────

export async function runFastAgent(
  task: string,
  model?: string
): Promise<MultiAgentResult> {
  return runMultiAgent(task, model, ["planner", "coder", "reviewer"]);
}

// ── Format result for chat ────────────────────────────────────────────────────

export function formatMultiAgentResult(result: MultiAgentResult): string {
  const agentEmoji: Record<AgentName, string> = {
    planner: "📋",
    researcher: "🔍",
    coder: "💻",
    tester: "🧪",
    reviewer: "✅",
  };

  const lines: string[] = [`## Multi-Agent Result\n`];
  lines.push(`**Task:** ${result.task}`);
  lines.push(`**Total time:** ${(result.totalMs / 1000).toFixed(1)}s`);
  lines.push(`**Agents used:** ${result.agents.map((a) => `${agentEmoji[a.agent]} ${a.agent}`).join(" → ")}`);
  lines.push(`\n---\n`);
  lines.push(result.finalAnswer);

  return lines.join("\n");
}

// ── Detection ─────────────────────────────────────────────────────────────────

const MULTI_AGENT_PATTERNS = [
  /use.*multi.*agent|run.*agents|multi.?agent/i,
  /full.*pipeline|agent.*pipeline/i,
  /planner.*coder|plan.*then.*code/i,
  /build.*and.*test/i,
  /research.*then.*build/i,
  /end.?to.?end.*implementation/i,
  /production.?ready.*code/i,
  /complete.*implementation.*with.*tests/i,
];

export function needsMultiAgent(message: string): boolean {
  return MULTI_AGENT_PATTERNS.some((p) => p.test(message));
}
