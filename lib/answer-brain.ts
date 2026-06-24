/**
 * lib/answer-brain.ts
 *
 * Grounded Answer Generator.
 * Takes SearchBrainResult + user query → calls LLM with rich injected context
 * → returns structured answer with confidence, facts, sources.
 */

import { generateChatCompletion } from "./model-router";
import type { SearchBrainResult, RankedSource } from "./search-brain";

// ── Types ────────────────────────────────────────────────────────────────────

export type Confidence = "high" | "medium" | "low" | "unverified";

export interface AnswerBrainResult {
  answer: string;          // Natural language response (markdown)
  confidence: Confidence;
  sources: RankedSource[];
  searchQueries: string[];
  checkedAt: string;
  provider: string;
  cacheHit: boolean;
}

// ── Confidence calculator ─────────────────────────────────────────────────────

function calculateConfidence(sources: RankedSource[]): Confidence {
  const tier1Count = sources.filter((s) => s.tier === 1).length;
  const tier2Count = sources.filter((s) => s.tier === 2).length;
  const hasContent  = sources.some((s) => s.content && s.content.length > 100);

  if (tier1Count >= 1 && hasContent) return "high";
  if (tier1Count >= 1) return "medium";
  if (tier2Count >= 2 && hasContent) return "medium";
  if (tier2Count >= 1) return "low";
  return "unverified";
}

// ── System prompt builder ────────────────────────────────────────────────────

function buildSystemPrompt(searchResult: SearchBrainResult, userQuery: string): string {
  const lang = detectLanguage(userQuery);

  return `You are Meldex AI Search Brain — an accurate, source-grounded AI assistant.

CRITICAL RULES:
1. Answer ONLY from the provided search results. Do NOT use training memory for current facts.
2. If the search results contain a clear answer, state it directly and confidently.
3. Use the SAME LANGUAGE as the user question (Gujarati/Hindi/English).
4. Never say "as of my knowledge cutoff" — use the search results and mention the source.
5. If sources conflict, say "According to [source], ..." and note the discrepancy.
6. If no reliable answer found in sources, say "I could not verify this from current sources."
7. Be DIRECT — put the main answer in the first sentence.
8. For government/official facts (CM, PM, ministers), ONLY trust Tier 1 (official) sources.

LANGUAGE: ${lang}

SEARCH CONTEXT:
${searchResult.topContent.slice(0, 4000)}

SEARCH PERFORMED: ${searchResult.checkedAt}
PROVIDER: ${searchResult.provider}

ANSWER FORMAT (respond in ${lang}):
**[Direct Answer in 1-2 sentences]**

[2-3 sentences of supporting detail if needed]

*Sources checked at ${new Date(searchResult.checkedAt).toLocaleTimeString("en-IN")} · ${searchResult.provider}*`;
}

function detectLanguage(text: string): string {
  // Check for Gujarati Unicode range
  if (/[\u0A80-\u0AFF]/.test(text)) return "Gujarati";
  // Check for Devanagari (Hindi)
  if (/[\u0900-\u097F]/.test(text)) return "Hindi";
  // Check for common Gujarati romanization patterns
  if (/\b(kon che|kem cho|shu|chhe|no |na |ni |che |atyare|haal|banavi|bana|tamne)\b/i.test(text)) return "Gujarati";
  // Check for Hindi romanization
  if (/\b(kya|kaun|hai|hain|ka|ki|ke|mein|aaj|abhi)\b/i.test(text)) return "Hindi";
  return "English";
}

// ── Main answer generation ────────────────────────────────────────────────────

export async function generateAnswer(
  userQuery: string,
  searchResult: SearchBrainResult,
  model?: string
): Promise<AnswerBrainResult> {
  const systemPrompt = buildSystemPrompt(searchResult, userQuery);
  const confidence = calculateConfidence(searchResult.sources);

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userQuery },
  ];

  const answer = await generateChatCompletion({ messages, model, maxTokens: 512 });

  return {
    answer,
    confidence,
    sources: searchResult.sources,
    searchQueries: searchResult.searchQueries,
    checkedAt: searchResult.checkedAt,
    provider: searchResult.provider,
    cacheHit: searchResult.cacheHit,
  };
}
