/**
 * lib/intent-router.ts
 *
 * Classifies user messages into intent types.
 *
 * Search routing rules:
 *  STRONG pattern match (explicit live data request)  → live_search immediately
 *  CONVERSATIONAL block (personal/location Gujarati)  → general_chat immediately
 *  WEAK keyword score >= 2 (and no conversational block) → live_search
 *  Otherwise                                           → general_chat
 *
 * This prevents over-triggering SEARCH for casual Gujarati conversation.
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

// ── Coding keywords ───────────────────────────────────────────────────────────

const CODING_KEYWORDS = [
  "build", "create", "website", "app", "landing page", "fix code", "edit file",
  "run project", "banavi", "bana", "code", "dashboard", "component", "api",
  "database", "schema", "generate", "scaffold", "implement", "develop", "deploy",
  "repository", "bug", "error", "typescript", "javascript", "python", "react",
  "nextjs", "next.js", "fix", "refactor", "function", "class", "algorithm",
  "html", "css", "tailwind", "prisma", "backend", "frontend", "server", "router",
  "endpoint", "migration", "install", "package", "npm", "yarn", "pnpm",
];

// ── STRONG search patterns — unambiguous live data requests ───────────────────
//
// Single match is enough to trigger search.
// These explicitly ask for CURRENT or LIVE information.

const STRONG_SEARCH_PATTERNS: RegExp[] = [
  // CM / PM / official position + "now" / "who is" / "kon che"
  /\b(current|atyare|atyarena|haal\s*ma|haalman[ao])\b.{0,40}\b(cm|pm|chief\s*minister|prime\s*minister|president|governor|mukhyamantri)\b/i,
  /\b(cm|pm|chief\s*minister|prime\s*minister|president|governor|mukhyamantri)\b.{0,40}\b(kon\s*ch[eh]|who\s*is|kaun\s*h[ae][in]|atyare|current)\b/i,
  /\b(who\s*is|kon\s*ch[eh])\b.{0,30}\b(cm|pm|chief\s*minister|prime\s*minister|president|governor)\b/i,

  // Latest / breaking / live news
  /\b(latest|breaking|live)\s+(news|update|score)\b/i,
  /\b(aajnu|aaj\s*na|aajno)\s*(samachar|news|weather|havaman|score|bhav|result)/i,
  /\b(today.?s?)\s+(news|weather|score|result|price)\b/i,

  // Live scores / real-time
  /\b(live|real.?time)\s+(score|update|result|match)\b/i,

  // Stock / crypto prices explicitly
  /\b(stock|crypto|share|bitcoin|ethereum)\s+(price|rate|value|aaj|today)\b/i,

  // Weather explicitly with time marker
  /\b(aaj\s*no|today.?s?)\s*havaman\b/i,
  /\bhavaman\s*(aaj|today|forecast|report|update)\b/i,

  // Election results
  /\b(election|chuntani)\s*(result|news|update|taarikh|date)\b/i,

  // IPL / cricket / sports score with time marker
  /\b(ipl|cricket|football|hockey)\s*(score|result|live|today|aaj)\b/i,
  /\b(aaj\s*no|today.?s?)\s*(ipl|cricket|match|score)\b/i,

  // Explicit samachar with time marker
  /\b(samachar|khabar|khabaro)\s*(aaj|latest|live|breaking|taza)/i,

  // Explicit search command
  /\b(meldex\s*search|search\s*kar|search\s*karo)\b/i,

  // Song / artist factual lookup
  /\b(song|gaano|gana|ગીત|ગાણું)\b.{0,60}\b(who|singer|artist|sang|gayu|gayo|gાયું|કોણ|kone|kon)\b/i,
  /\b(who|singer|artist|sang|gayu|gayo|gાયું|કોણ|kone|kon)\b.{0,60}\b(song|gaano|gana|ગીત|ગાણું)\b/i,

  // Public-person lookup: "govind dholakiya kon che", "who is first last".
  // Keep this away from single-word casual questions so normal chat still works.
  /^(?!\s*(tu|tame|hu|mane|mara|maru)\b)([a-z][a-z.'-]{2,}\s+){1,4}[a-z][a-z.'-]{2,}\s+(kon\s*ch[eh]|who\s*is|kaun\s*h[ae][in])\??$/i,
  /^(who\s*is|kon\s*ch[eh]|kaun\s*h[ae][in])\s+([a-z][a-z.'-]{2,}\s+){1,4}[a-z][a-z.'-]{2,}\??$/i,
];

// ── WEAK search keywords — need score >= 2 to trigger ─────────────────────────
//
// Generic words associated with search but used in normal conversation too.
// Require at least 2 matches (or 1 if no conversational context).

const WEAK_SEARCH_KEYWORDS: string[] = [
  "who is", "latest", "current", "today", "news", "score",
  "price", "weather", "election", "stock", "crypto",
  "ipl", "cricket", "football",
  "cm", "pm", "president", "minister",
  "live", "breaking", "winner",
  "samachar", "khabaro", "bhav", "havaman", "chuntani",
  "kon che", "kone chhe", "kone che", "koun che",
  "song", "singer", "artist", "gayu", "gayo", "gaano", "gana",
  "atyare", "atayre", "haalma", "haal ma",
  "mukhyamantri", "no cm", "no pm", "na mukhyamantri",
  "no result", "live score",
  // Gujarati Unicode
  "કોણ", "અત્યારે", "સમાચાર", "ભાવ", "હવામાન", "ચૂંટણી",
];

// ── Conversational blocklist — personal / location / casual Gujarati ──────────
//
// If ANY of these match the current message, it is personal conversation → CHAT.
// These cannot be live search queries.

const CONVERSATIONAL_PATTERNS: RegExp[] = [
  // Location personal movement: "pase ryu", "najik gayo", "pase aavyo"
  /\b(pase|najik|nazdik|paas?e?)\s*(ryu|rahyo|rahya|gayo|gayi|aavyo|aavi|hato|hati|chu|chhu|che)\b/i,

  // Personal activity / storytelling
  /\b(vat|vato)\s*(kru|karo|kariye|karish|chhu|chu|karta|hata)\b/i,  // talking/chatting
  /kru\s*chhu|kari\s*ryo|karto\s*hato|karti\s*hati/i,              // doing (first-person)
  /\b(gayo|gayi|aavyo|aavi|jayo|jayi|jais|javaano|aavaano)\b/i,    // went/came/will go
  /\b(ryu|rahi|rahyo|rahya|raho|rahi)\b/i,                         // was/stayed
  /\b(hato|hati|hata|hati)\b.{0,20}\b(gayo|gayi|aavyo|aavi)/i,    // was there, then went

  // First-person Gujarati pronouns (I/me/we/our)
  /\b(mane|mare|mara|maru|amne|ame|amara|amaru)\b/i,

  // Second-person Gujarati (you/your) — conversational
  /\b(tamne|tane|tamara|tamaru|tara|taru)\b/i,

  // Common conversational verb endings
  /\bchu\b|\bchhu\b/i,     // "I am" — strong conversational signal

  // Personal locations (home / school / work)
  /\b(ghare|school|college|office|kaam\s*par|nokri|hospital)\b/i,

  // Casual "what happened" in personal context
  /\b(kem|shu\s*thyu|keva|kevu|kem\s*che|kevo)\b/i,

  // Follow-up indicators
  /^(haan|ha|naa|na|okay|ok|thik|theek|bas|sari|saru|bilkul|bane)\b/i,
];

// ── Time patterns ─────────────────────────────────────────────────────────────

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

// ── Math patterns ─────────────────────────────────────────────────────────────

const MATH_PATTERNS = [
  /^\s*[\d\s+\-*/()%.^,]+\s*=?\s*$/, // pure arithmetic
  /\b(\d+[\s]*[+\-*/^][\s]*\d+)/,   // inline math
  /calculate|compute|percentage|emi|interest|tax|convert|formula/i,
  /how many|kitlu|kitla|convert\s+\d/i,
];

// ── Classifier ────────────────────────────────────────────────────────────────

/**
 * Classify the intent of a user message.
 *
 * @param message       Current user message
 * @param contextMsgs   Previous user messages in this conversation (for context awareness)
 */
export function classifyIntent(
  message: string,
  contextMsgs: string[] = []
): Intent {
  const lower = message.toLowerCase().trim();

  // ── 1. Time (always instant, top priority) ────────────────────────────────
  if (TIME_PATTERNS.some((p) => p.test(message))) {
    return { type: "time_query", confidence: "high", reason: "time pattern matched" };
  }

  // ── 2. Math ───────────────────────────────────────────────────────────────
  if (MATH_PATTERNS.some((p) => p.test(message))) {
    return { type: "math_query", confidence: "high", reason: "math pattern matched" };
  }

  // ── 3. Conversational block — personal/location Gujarati → always CHAT ────
  if (CONVERSATIONAL_PATTERNS.some((p) => p.test(message))) {
    return {
      type: "general_chat",
      confidence: "high",
      reason: "conversational gujarati pattern — personal/location context",
    };
  }

  // ── 4. Strong search patterns → immediate live_search ────────────────────
  if (STRONG_SEARCH_PATTERNS.some((p) => p.test(message))) {
    return { type: "live_search", confidence: "high", reason: "strong search pattern matched" };
  }

  // ── 5. Score-based routing ────────────────────────────────────────────────
  const codingScore = CODING_KEYWORDS.filter((kw) => lower.includes(kw)).length;
  const searchScore = WEAK_SEARCH_KEYWORDS.filter((kw) => lower.includes(kw)).length;

  // Determine if we are in a conversational context from history.
  // If recent messages were personal conversation, raise the search threshold.
  const conversationalHistoryCount = contextMsgs.filter((msg) =>
    CONVERSATIONAL_PATTERNS.some((p) => p.test(msg))
  ).length;
  const inConversationalContext = conversationalHistoryCount > 0;

  // Search confidence threshold:
  //   Normal context:        need >= 2 weak keyword matches
  //   Conversational context: need >= 3 weak keyword matches
  const searchThreshold = inConversationalContext ? 3 : 2;

  if (codingScore > 0 && codingScore >= searchScore) {
    return {
      type: "coding_agent",
      confidence: codingScore >= 2 ? "high" : "medium",
      reason: `coding keywords: ${codingScore}`,
    };
  }

  if (searchScore >= searchThreshold) {
    return {
      type: "live_search",
      confidence: searchScore >= 3 ? "high" : "medium",
      reason: `search keywords: ${searchScore} (threshold: ${searchThreshold})`,
    };
  }

  // ── 6. Default: general chat ──────────────────────────────────────────────
  return {
    type: "general_chat",
    confidence: "high",
    reason: "no specialized pattern matched",
  };
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
