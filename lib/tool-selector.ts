/**
 * lib/tool-selector.ts
 *
 * Smart Tool Selection — v2 brain router.
 * Extends intent classification with memory, project, planning, and multi-agent routing.
 *
 * Decision tree:
 *  memory query           → Memory Brain
 *  continue work query    → Project Brain
 *  current events/facts   → Search Brain + Answer Brain
 *  math/calculation       → Math Brain (direct LLM)
 *  time query             → Utility Brain (client-side / time util)
 *  complex analysis       → Reasoning Brain
 *  project planning/arch  → Planning Brain
 *  multi-agent request    → Multi-Agent Pipeline
 *  coding task            → Agent Brain (Coding Agent)
 *  general chat           → Chat Brain
 */

import { classifyIntent } from "./intent-router";
import { isMemoryQuery } from "./memory-brain";
import { isContinueQuery } from "./project-brain";
import { needsReasoning } from "./reasoning-brain";
import { needsPlanning } from "./planning-brain";
import { needsMultiAgent } from "./multi-agent";
import { isKnowledgeQuery } from "./knowledge-brain";

// ── Brain labels (shown in UI) ────────────────────────────────────────────────

export type BrainType =
  | "chat"
  | "search"
  | "agent"
  | "memory"
  | "project"
  | "planner"
  | "reasoner"
  | "multi_agent"
  | "math"
  | "time"
  | "utility"
  | "knowledge";

export interface BrainSelection {
  brain: BrainType;
  label: string;      // UI display label
  color: string;      // Tailwind text color class
  reason: string;
}

export const BRAIN_LABELS: Record<BrainType, { label: string; color: string }> = {
  chat:        { label: "CHAT",        color: "text-slate-400" },
  search:      { label: "SEARCH",      color: "text-mint" },
  agent:       { label: "AGENT",       color: "text-iris" },
  memory:      { label: "MEMORY",      color: "text-amber-400" },
  project:     { label: "PROJECT",     color: "text-cyan-400" },
  planner:     { label: "PLANNER",     color: "text-purple-400" },
  reasoner:    { label: "REASONER",    color: "text-orange-400" },
  multi_agent: { label: "MULTI-AGENT", color: "text-rose-400" },
  math:        { label: "MATH",        color: "text-emerald-400" },
  time:        { label: "UTILITY",     color: "text-slate-400" },
  utility:     { label: "UTILITY",     color: "text-slate-400" },
  knowledge:   { label: "KNOWLEDGE",   color: "text-teal-400" },
};

// ── Main selector ─────────────────────────────────────────────────────────────

/**
 * @param message             Current user message
 * @param mode                "chat" | "agent"
 * @param conversationHistory Previous messages in this conversation
 */
export function selectBrain(
  message: string,
  mode: "chat" | "agent" = "chat",
  conversationHistory: { role: string; content: string }[] = []
): BrainSelection {
  const meta = (brain: BrainType, reason: string): BrainSelection => ({
    brain,
    label: BRAIN_LABELS[brain].label,
    color: BRAIN_LABELS[brain].color,
    reason,
  });

  // --- Hard overrides (checked before intent) ---

  // Memory queries
  if (isMemoryQuery(message)) {
    return meta("memory", "User is asking about stored preferences or memory");
  }

  // "Continue work" queries
  if (isContinueQuery(message)) {
    return meta("project", "User wants to resume or reference previous project work");
  }

  // Multi-agent requests
  if (needsMultiAgent(message)) {
    return meta("multi_agent", "Task requires full Planner→Researcher→Coder→Tester→Reviewer pipeline");
  }

  // Planning/architecture requests
  if (needsPlanning(message)) {
    return meta("planner", "Task needs architecture design and task breakdown before coding");
  }
  // Knowledge Brain — static verified facts (skip for purely conversational messages)
  // Run intent first to detect if this is a conversational message
  const preIntent = classifyIntent(message);
  if (
    isKnowledgeQuery(message) &&
    preIntent.type !== "live_search" &&
    !(preIntent.reason?.includes("conversational"))
  ) {
    return meta("knowledge", "Static verified fact available in local knowledge base");
  }

// --- Intent classification (with conversation context) ---
  // Pass last 4 user messages as context so the classifier can detect
  // when we're in a conversational vs. live-search conversation thread.
  const recentUserMsgs = conversationHistory
    .filter((m) => m.role === "user")
    .slice(-4)
    .map((m) => m.content);

  // Re-classify with full context (preIntent was without context)
  const intent = recentUserMsgs.length > 0
    ? classifyIntent(message, recentUserMsgs)
    : preIntent;

  if (intent.type === "live_search") {
    return meta("search", "Query requires live web search for current information");
  }

  if (intent.type === "time_query") {
    return meta("time", "Time query handled locally");
  }

  if (intent.type === "math_query") {
    return meta("math", "Mathematical calculation");
  }

  if (intent.type === "coding_agent" || mode === "agent") {
    // Check if needs reasoning first
    if (needsReasoning(message)) {
      return meta("reasoner", "Complex coding/design decision needs structured reasoning");
    }
    return meta("agent", "Coding task for Coding Agent brain");
  }

  // Reasoning for complex general questions (only in chat mode)
  if (needsReasoning(message)) {
    return meta("reasoner", "Complex question requiring think→verify→answer pipeline");
  }

  return meta("chat", "General conversational query");
}
