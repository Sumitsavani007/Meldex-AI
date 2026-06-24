/**
 * lib/search-brain.ts
 *
 * Advanced Search Brain — orchestrates query rewriting, multi-provider search,
 * safe content fetching, source ranking, and result caching.
 *
 * Security: SSRF-protected — blocks localhost, private IPs, non-http(s) URLs.
 * Performance: 10-minute in-memory cache, 5s per-page fetch timeout.
 */

import { webSearch } from "./search";

// ── Types ────────────────────────────────────────────────────────────────────

export type SourceTier = 1 | 2 | 3;

export interface RankedSource {
  title: string;
  url: string;
  snippet?: string;
  tier: SourceTier;
  content?: string; // extracted page text
}

export interface SearchBrainResult {
  searchQueries: string[];
  sources: RankedSource[];
  topContent: string; // combined best content for LLM context
  provider: string;
  checkedAt: string;
  cacheHit: boolean;
}

// ── SSRF protection ──────────────────────────────────────────────────────────

const BLOCKED_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^0\./,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
  /^169\.254\./,
  /^100\.64\./,
];

function isSafeUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) return false;
    const host = url.hostname.toLowerCase();
    return !BLOCKED_PATTERNS.some((p) => p.test(host));
  } catch {
    return false;
  }
}

// ── Source tier ranking ──────────────────────────────────────────────────────

const TIER1_SIGNALS = [
  ".gov.in", ".gov", ".nic.in", "india.gov.in", "gujarat.gov.in",
  "cmogujaratoficial", "pmindia.gov.in", "mygov.in", "presidentofindia.gov.in",
  "rajyasabha.gov.in", "loksabha.gov.in", "mea.gov.in", "rbi.org.in",
  "sebi.gov.in", "eci.gov.in", "judiciary.gov.in",
];

const TIER2_SIGNALS = [
  "wikipedia.org", "bbc.com", "bbc.co.uk", "ndtv.com", "thehindu.com",
  "hindustantimes.com", "indiatoday.in", "timesofindia.indiatimes.com",
  "indianexpress.com", "reuters.com", "apnews.com", "thewire.in",
  "scroll.in", "livemint.com", "business-standard.com",
  "divyabhaskar.com", "gujaratsamachar.com", "sandesh.com", "aajkaal.net",
];

export function getSourceTier(url: string): SourceTier {
  const lower = url.toLowerCase();
  if (TIER1_SIGNALS.some((s) => lower.includes(s))) return 1;
  if (TIER2_SIGNALS.some((s) => lower.includes(s))) return 2;
  return 3;
}

// ── HTML text extractor ──────────────────────────────────────────────────────

function extractReadableText(html: string, maxChars = 2500): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<aside[\s\S]*?<\/aside>/gi, "")
    .replace(/<menu[\s\S]*?<\/menu>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, maxChars);
}

// ── Query rewriter ────────────────────────────────────────────────────────────

const GUJARATI_MAP: [RegExp, string][] = [
  [/\bgujrat\b/gi, "Gujarat"],
  [/\bgujarat\b/gi, "Gujarat"],
  [/\batayre\b|\batyare\b|\bhaal\b|\bhal ma\b|\bhaalma\b/gi, "current"],
  [/\bkon che\b|\bkone chhe\b|\bkone che\b|\bkoun che\b/gi, "who is"],
  [/\bkya chhe\b|\bshu chhe\b/gi, "what is"],
  [/\bsamachar\b/gi, "news"],
  [/\bbhav\b/gi, "price"],
  [/\bhavaman\b/gi, "weather"],
  [/\bchuntani\b/gi, "election"],
  [/\bmukhyamantri\b/gi, "Chief Minister"],
  [/\bvardhanpradhan\b|\bvardhan pradhan\b/gi, "Prime Minister"],
  [/\bpm kon\b/gi, "Prime Minister of India who is"],
  [/\bcm kon\b/gi, "Chief Minister who is"],
  [/\bno cm\b/gi, "'s Chief Minister"],
  [/\bno pm\b/gi, "'s Prime Minister"],
  [/\bkheladoo\b/gi, "player"],
  [/\bkheladioo\b/gi, "player"],
];

export function rewriteQuery(raw: string): string[] {
  let corrected = raw.trim();
  for (const [pattern, replacement] of GUJARATI_MAP) {
    corrected = corrected.replace(pattern, replacement);
  }

  const queries: string[] = [corrected];

  // Add "official" variant for authority queries
  if (/chief minister|prime minister|\bcm\b|\bpm\b|president|minister|governor/i.test(corrected)) {
    queries.push(`${corrected} official site`);
    queries.push(`${corrected} 2025 2026`);
  }
  // News queries
  if (/news|latest|recent|today|update/i.test(corrected)) {
    queries.push(`${corrected} today 2026`);
  }

  return [...new Set(queries)];
}

// ── In-memory cache (10 min TTL) ─────────────────────────────────────────────

interface CacheEntry {
  data: SearchBrainResult;
  expires: number;
}
const CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function cacheKey(query: string) {
  return query.toLowerCase().trim();
}

// ── Page fetcher (SSRF-safe, with timeout) ────────────────────────────────────

async function fetchPageContent(url: string): Promise<string | null> {
  if (!isSafeUrl(url)) return null;
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; MeldexBot/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return null;
    const ct = response.headers.get("content-type") ?? "";
    if (!ct.includes("text/html")) return null;
    const html = await response.text();
    return extractReadableText(html);
  } catch {
    return null;
  }
}

// ── Main brain function ───────────────────────────────────────────────────────

export async function advancedSearch(rawQuery: string): Promise<SearchBrainResult> {
  const key = cacheKey(rawQuery);

  // Cache hit
  const cached = CACHE.get(key);
  if (cached && cached.expires > Date.now()) {
    return { ...cached.data, cacheHit: true };
  }

  const checkedAt = new Date().toISOString();
  const searchQueries = rewriteQuery(rawQuery);
  const primaryQuery = searchQueries[0];

  // Run primary search
  const raw = await webSearch(primaryQuery);
  const provider = raw.provider;

  // Build ranked source list
  const sources: RankedSource[] = raw.sources.map((s) => ({
    title: s.title,
    url: s.url,
    snippet: s.snippet,
    tier: getSourceTier(s.url),
  }));

  // Sort: tier 1 first, then 2, then 3
  sources.sort((a, b) => a.tier - b.tier);

  // Fetch top 4 page contents in parallel (SSRF-safe)
  const fetchTargets = sources.slice(0, 4);
  const contentResults = await Promise.allSettled(
    fetchTargets.map((s) => fetchPageContent(s.url))
  );
  contentResults.forEach((result, i) => {
    if (result.status === "fulfilled" && result.value) {
      sources[i].content = result.value;
    }
  });

  // Build combined context for LLM (prioritise tier 1 content)
  const contextParts: string[] = [];

  // Add DDG/Serper answer snippet first
  if (raw.answer) {
    contextParts.push(`Quick answer: ${raw.answer}`);
  }

  // Add source content (tier 1 first)
  for (const s of sources) {
    if (contextParts.join("\n").length > 5000) break;
    const part = [`[${s.tier === 1 ? "Official" : s.tier === 2 ? "Reputed" : "Source"}] ${s.title}`, `URL: ${s.url}`];
    if (s.snippet) part.push(`Summary: ${s.snippet}`);
    if (s.content) part.push(`Content: ${s.content.slice(0, 800)}`);
    contextParts.push(part.join("\n"));
  }

  const topContent = contextParts.join("\n\n---\n\n");

  const result: SearchBrainResult = {
    searchQueries,
    sources,
    topContent,
    provider,
    checkedAt,
    cacheHit: false,
  };

  // Cache for 10 minutes
  CACHE.set(key, { data: result, expires: Date.now() + CACHE_TTL_MS });

  return result;
}
