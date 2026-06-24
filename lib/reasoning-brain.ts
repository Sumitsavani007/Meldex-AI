/**
 * lib/reasoning-brain.ts
 *
 * Chain-of-thought reasoning pipeline: Think → Verify → Answer
 * Used for complex questions, comparisons, analysis, and planning.
 *
 * Pipeline:
 *  1. THINK  — decompose the problem, list what needs to be known
 *  2. VERIFY — fact-check the reasoning steps, flag assumptions
 *  3. ANSWER — synthesise final answer based on verified reasoning
 */

import { generateChatCompletion } from "./model-router";
import type { ChatMessage } from "./model-router";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ReasoningResult {
  thinking: string;
  verification: string;
  answer: string;
  confidence: "high" | "medium" | "low";
  thinkMs: number;
  verifyMs: number;
  answerMs: number;
  totalMs: number;
}

// ── Confidence heuristic ─────────────────────────────────────────────────────

function scoreConfidence(thinking: string, verification: string): "high" | "medium" | "low" {
  const uncertainWords = /uncertain|unclear|might|may|could|possibly|assume|assumption|not sure|unknown/gi;
  const highCount = (thinking.match(uncertainWords)?.length ?? 0) +
                    (verification.match(uncertainWords)?.length ?? 0);
  if (highCount === 0) return "high";
  if (highCount <= 3) return "medium";
  return "low";
}

// ── Three-step prompts ────────────────────────────────────────────────────────

const THINK_SYSTEM = `You are a deep-thinking AI reasoning engine.
Given a question or task, your job is to THINK through it carefully.

Steps:
1. Decompose the question into sub-problems
2. Identify what you know and what you need to know
3. List any assumptions you're making
4. Think step-by-step through the reasoning

Output ONLY your thinking process. Be thorough but concise.`;

const VERIFY_SYSTEM = `You are a verification and fact-checking AI.
You will receive:
- An original question
- A thinking/reasoning draft

Your job:
1. Check each reasoning step for errors or wrong assumptions
2. Flag any claims that might be incorrect
3. Identify gaps in the reasoning
4. Rate confidence: HIGH (well-reasoned, no gaps) / MEDIUM (minor gaps) / LOW (significant assumptions)

Be critical but fair. Output a brief verification report.`;

const ANSWER_SYSTEM = `You are Meldex AI delivering a final, verified answer.
You have access to:
- The original question
- A thinking draft
- A verification report

Your job: synthesise a clear, direct, accurate answer.

Rules:
- Start with the direct answer
- Support Gujarati, Hindi, English — answer in the user's language
- Be confident where reasoning is solid, hedge where uncertain
- Keep it concise and useful`;

// ── Main pipeline ─────────────────────────────────────────────────────────────

export async function reason(
  question: string,
  context?: string,
  model?: string
): Promise<ReasoningResult> {
  const start = Date.now();

  const contextPrefix = context ? `\n\nContext:\n${context}` : "";

  // ── Step 1: THINK ─────────────────────────────────────────────────────────
  const t0 = Date.now();
  const thinkMessages: ChatMessage[] = [
    { role: "system", content: THINK_SYSTEM },
    { role: "user", content: `Question: ${question}${contextPrefix}` },
  ];
  const thinking = await generateChatCompletion({
    messages: thinkMessages,
    model,
    maxTokens: 600,
    temperature: 0.3,
  });
  const thinkMs = Date.now() - t0;

  // ── Step 2: VERIFY ────────────────────────────────────────────────────────
  const v0 = Date.now();
  const verifyMessages: ChatMessage[] = [
    { role: "system", content: VERIFY_SYSTEM },
    {
      role: "user",
      content: `Original question: ${question}\n\nReasoning draft:\n${thinking}`,
    },
  ];
  const verification = await generateChatCompletion({
    messages: verifyMessages,
    model,
    maxTokens: 400,
    temperature: 0.2,
  });
  const verifyMs = Date.now() - v0;

  // ── Step 3: ANSWER ────────────────────────────────────────────────────────
  const a0 = Date.now();
  const answerMessages: ChatMessage[] = [
    { role: "system", content: ANSWER_SYSTEM },
    {
      role: "user",
      content: `Question: ${question}\n\nThinking:\n${thinking}\n\nVerification:\n${verification}`,
    },
  ];
  const answer = await generateChatCompletion({
    messages: answerMessages,
    model,
    maxTokens: 800,
    temperature: 0.4,
  });
  const answerMs = Date.now() - a0;

  return {
    thinking,
    verification,
    answer,
    confidence: scoreConfidence(thinking, verification),
    thinkMs,
    verifyMs,
    answerMs,
    totalMs: Date.now() - start,
  };
}

// ── Detection: when to use reasoning brain ────────────────────────────────────

const REASONING_PATTERNS = [
  /compare|comparison|vs\b|versus/i,
  /why (is|are|does|do|would|should)/i,
  /how (does|do|would|can|should)/i,
  /explain (the|how|why|what)/i,
  /what.*difference|differences between/i,
  /pros (and|&|vs) cons/i,
  /should i (use|choose|pick|build|go with)/i,
  /best (way|approach|method|practice)/i,
  /analyze|analyse|analysis/i,
  /tradeoff|trade-off/i,
  /recommend.*architecture|design.*pattern/i,
  /complex|complicated|difficult question/i,
  /step.*step|step by step/i,
  /deep.*dive|in.*depth/i,
];

export function needsReasoning(message: string): boolean {
  // Long messages often need reasoning
  if (message.split(" ").length > 30) return true;
  return REASONING_PATTERNS.some((p) => p.test(message));
}
