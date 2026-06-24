/**
 * lib/intent-router.ts
 *
 * Classifies user messages into one of five intent types so the API layer
 * can route them to the correct brain:
 *
 *  time_query    → instant JS Date response, no LLM needed
 *  math_query    → LLM with math-focused prompt
 *  coding_agent  → Qwen3-Coder / Agent pipeline
 *  live_search   → DuckDuckGo / Serper live web search
 *  general_chat  → conversational LLM
 */

export type IntentType =
  | "general_chat"
  | "coding_agent"
  | "live_search"
  | "time_query"
  | "math_query";

export interface Intent {
  type: IntentType;
  confidence: "high" | "medium" | "low";
  reason: string;
}

// ─────────────────────────────── keyword lists ───────────────────────────────

const CODING_KEYWORDS = [
  "build", "create", "website", "app", "landing page", "fix code", "edit file",
  "run project", "banavi", "bana", "code", "dashboard", "component", "api",
  "database", "schema", "generate", "scaffold", "implement", "develop", "deploy",
  "repository", "bug", "error", "typescript", "javascript", "python", "react",
  "nextjs", "next.js", "fix", "refactor", "function", "class", "algorithm",
  "html", "css", "tailwind", "prisma", "backend", "frontend", "server", "router",
  "endpoint", "migration", "install", "package", "npm", "yarn", "pnpm",
];

const LIVE_SEARCH_KEYWORDS = [
  "who is", "kon che", "kone chhe", "latest", "current", "today", "news",
  "score", "price", "weather", "election", "result", "stock", "crypto",
  "ipl", "cricket", "football", "politics", "cm", "pm", "president",
  "minister", "chairman", "recent", "happened", "update", "live", "breaking",
  "winner", "schedule", "match", "game", "tournament", "2024", "2025", "2026",
  "abhi", "haal", "samachar", "khabaro", "bhav", "aaj",
];

const TIME_PATTERNS = [
  /ketla\s*v[a-z]*ya/i,
  /kel[ao]\s*vag/i,
  /what\s*time(\s*is\s*it)?/i,
  /current\s*time/i,
  /time\s*shu\s*thay/i,
  /atyare\s*time/i,
  /time\s*che/i,
  /time\s*keto/i,
  /સમય\s*(ક|છ)/i,
];

const MATH_PATTERNS = [
  /^\s*[\d\s+\-*/()%.^,]+\s*=?\s*$/, // pure arithmetic expression
  /\b(\d+[\s]*[+\-*/^][\s]*\d+)/,   // inline math
  /calculate|compute|percentage|emi|interest|tax|convert|formula/i,
  /how many|kitlu|kitla|convert\s+\d/i,
];

// ────────────────────────────── classifier ───────────────────────────────────

export function classifyIntent(message: string): Intent {
  const lower = message.toLowerCase().trim();

  // 1. Time — always instant
  if (TIME_PATTERNS.some((p) => p.test(message))) {
    return { type: "time_query", confidence: "high", reason: "time pattern matched" };
  }

  // 2. Math — pure calculation
  if (MATH_PATTERNS.some((p) => p.test(message))) {
    return { type: "math_query", confidence: "high", reason: "math pattern matched" };
  }

  // 3. Score keyword matches
  const codingScore = CODING_KEYWORDS.filter((kw) => lower.includes(kw)).length;
  const searchScore = LIVE_SEARCH_KEYWORDS.filter((kw) => lower.includes(kw)).length;

  if (codingScore > 0 && codingScore >= searchScore) {
    return {
      type: "coding_agent",
      confidence: codingScore >= 2 ? "high" : "medium",
      reason: `coding keywords: ${codingScore}`,
    };
  }

  if (searchScore > 0 && searchScore > codingScore) {
    return {
      type: "live_search",
      confidence: searchScore >= 2 ? "high" : "medium",
      reason: `search keywords: ${searchScore}`,
    };
  }

  // 4. Default: general chat
  return { type: "general_chat", confidence: "high", reason: "no specialized pattern matched" };
}

/** Returns a human-readable label for the intent type. */
export function intentLabel(type: IntentType): string {
  switch (type) {
    case "time_query":   return "Time";
    case "math_query":   return "Math";
    case "coding_agent": return "Agent";
    case "live_search":  return "Live Search";
    case "general_chat": return "Chat";
  }
}
