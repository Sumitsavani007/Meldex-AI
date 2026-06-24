/**
 * lib/conversation-brain.ts
 *
 * Conversation context resolver.
 * Uses the last N messages to understand follow-up pronouns and references
 * in Gujarati, Hindi, and English, then builds an enriched context string
 * for the LLM so answers stay consistent across multi-turn conversations.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ConvMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ConversationContext {
  /** Enriched user message with resolved pronoun context */
  enrichedMessage: string;
  /** Most recent topic extracted from the conversation */
  topic: string | null;
  /** Whether context was used to enrich the message */
  contextInjected: boolean;
}

// ── Gujarati / Hindi follow-up pronoun patterns ───────────────────────────────

// These patterns signal the current message is a follow-up about a previous topic.
const FOLLOWUP_PATTERNS: RegExp[] = [
  /^(eni|ena|enu|tenu|teni|tena|e|aa|ama|aama|te|teo|teni|tena)\b/i,   // Gujarati pronouns
  /^(pase|najik|nazdik)\s*(ryu|gayo|gayi|aavyo|aavi)/i,                 // "near [previous place]"
  /^(ema|tema|jema)\b/i,                                                 // Gujarati "in it/them"
  /^(enu|tenu|teni|eni)\s*(vat|kaam|khabar)/i,                          // "its talk/work/news"
  /^(vat|vato)\s*(karu|karo|kari)\s*(chhu?|chu?)/i,                     // "talking about it"
  /\b(eni|teni|tena|ena)\s*(vat|khabar|details|info)\b/i,               // mid-sentence ref
  /^(upar|neeche|pachi|pachhi|tya|tyaa)\b/i,                            // "about/above/there"
  /^(it|this|that|there|those|these|the same)\b/i,                      // English follow-ups
  /^(iske|uske|unke|wahan|isko|usko)\b/i,                               // Hindi follow-ups
];

// ── Topic extractor ───────────────────────────────────────────────────────────

// Extracts the most likely "topic" from an assistant message (the last answer).
// Used to resolve follow-up pronouns in the next user message.
function extractTopic(assistantMessage: string): string | null {
  // Extract bolded terms (markdown **term**)
  const boldMatches = assistantMessage.match(/\*\*([^*]+)\*\*/g);
  if (boldMatches && boldMatches.length > 0) {
    return boldMatches[0].replace(/\*\*/g, "").trim();
  }

  // Extract first meaningful noun phrase (first 8 words)
  const words = assistantMessage
    .replace(/[*_`#]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 8);
  if (words.length > 0) return words.slice(0, 4).join(" ");

  return null;
}

// Extract geographic entities mentioned in a message
function extractLocationFromMessage(message: string): string | null {
  // Common Gujarat locations
  const locations = [
    "bhavnagar", "botad", "vallabhipur", "vallabhpur", "junagadh",
    "ahmedabad", "amdavad", "rajkot", "surat", "vadodara", "gandhinagar",
    "amreli", "anand", "kheda", "nadiad", "morbi", "jamnagar", "porbandar",
    "somnath", "dwarka", "kutch", "patan", "mehsana", "banaskantha",
    "gir", "saurashtra", "gujarat",
  ];
  const lower = message.toLowerCase();
  for (const loc of locations) {
    if (lower.includes(loc)) return loc;
  }
  return null;
}

// ── Main context resolver ─────────────────────────────────────────────────────

/**
 * Given the current user message and the last N messages in the conversation,
 * resolve any follow-up references and return an enriched message + context string.
 *
 * @param currentMessage  The latest user message
 * @param history         Last N messages (oldest first, mix of user + assistant)
 * @param maxHistory      How many messages to look back (default: 5)
 */
export function resolveConversationContext(
  currentMessage: string,
  history: ConvMessage[],
  maxHistory = 5
): ConversationContext {
  if (!history.length) {
    return { enrichedMessage: currentMessage, topic: null, contextInjected: false };
  }

  const recent = history.slice(-maxHistory);

  // ── Check if this is a follow-up message ─────────────────────────────────
  const isFollowUp = FOLLOWUP_PATTERNS.some((p) => p.test(currentMessage.trim()));

  // ── Extract context from previous messages ────────────────────────────────

  // Last assistant reply — likely the most relevant topic
  const lastAssistant = [...recent].reverse().find((m) => m.role === "assistant");

  // Last user message that mentioned a location or clear topic
  const prevUserMessages = recent.filter((m) => m.role === "user");

  // Find most recent location mentioned across user + assistant messages
  let resolvedLocation: string | null = null;
  for (const msg of [...recent].reverse()) {
    const loc = extractLocationFromMessage(msg.content);
    if (loc) { resolvedLocation = loc; break; }
  }

  // Extract topic from last assistant reply
  const topic = lastAssistant ? extractTopic(lastAssistant.content) : null;

  // ── Build enriched message ────────────────────────────────────────────────
  if (!isFollowUp && !resolvedLocation) {
    return { enrichedMessage: currentMessage, topic, contextInjected: false };
  }

  // Build context prefix
  const contextParts: string[] = [];

  if (resolvedLocation && isFollowUp) {
    contextParts.push(`[Context: User is referring to ${resolvedLocation}]`);
  }

  if (lastAssistant && isFollowUp) {
    const snippet = lastAssistant.content.slice(0, 120).replace(/\n/g, " ");
    contextParts.push(`[Previous answer was about: "${snippet}"]`);
  }

  if (prevUserMessages.length > 1 && isFollowUp) {
    const prevTopic = prevUserMessages[prevUserMessages.length - 2].content.slice(0, 80);
    contextParts.push(`[Previous question: "${prevTopic}"]`);
  }

  if (!contextParts.length) {
    return { enrichedMessage: currentMessage, topic, contextInjected: false };
  }

  const enrichedMessage = `${contextParts.join(" ")}\n\nCurrent question: ${currentMessage}`;
  return { enrichedMessage, topic, contextInjected: true };
}

// ── Build conversation system prompt enrichment ───────────────────────────────

/**
 * Builds a compact conversation context snippet to inject into the LLM system prompt.
 * Gives the LLM awareness of the current conversation thread.
 */
export function buildConversationContext(history: ConvMessage[], maxHistory = 5): string {
  const recent = history.slice(-maxHistory);
  if (!recent.length) return "";

  const parts: string[] = ["[Conversation context — last few exchanges:]"];
  for (const msg of recent) {
    const role = msg.role === "user" ? "User" : "Meldex";
    const snippet = msg.content.slice(0, 100).replace(/\n/g, " ");
    parts.push(`${role}: ${snippet}${msg.content.length > 100 ? "…" : ""}`);
  }

  return parts.join("\n");
}

/** Check if a message looks like a follow-up to a previous message. */
export function isFollowUpMessage(message: string): boolean {
  return FOLLOWUP_PATTERNS.some((p) => p.test(message.trim()));
}
