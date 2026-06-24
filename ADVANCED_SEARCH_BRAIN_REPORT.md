# Advanced Search Brain — Implementation Report

**Meldex AI · Session 8 · Advanced Search Brain**

---

## Overview

This report documents the design, architecture, and implementation of the **Advanced Search Brain** — a multi-stage pipeline that replaces Meldex's previous single-step "DuckDuckGo + LLM guess" approach with a rigorous search → verify → rank → extract → answer chain.

---

## Problem Statement

Previous behaviour:
```
User asks: "Gujarat no CM kon che?"
Meldex: "As of my knowledge cutoff in July 2024, the CM of Gujarat is..."
```

Issues:
- Stale data (training memory, not live search)
- Vague hedging language
- No source attribution
- No confidence signal
- Single DuckDuckGo call with no ranking

---

## Architecture

```
User Query
    │
    ▼
[Intent Router] ──── live_search intent?
    │                        │
    │                        ▼
    │              [Search Brain] lib/search-brain.ts
    │              ├── Query Rewriter (Gujarati corrections)
    │              ├── Multi-provider search (Serper → Brave → DDG)
    │              ├── Source Tier Ranker (gov=1, wiki/bbc=2, rest=3)
    │              ├── SSRF-safe parallel page fetcher (5s timeout)
    │              ├── HTML text extractor (strips nav/footer/scripts)
    │              └── 10-min in-memory cache
    │                        │
    │                        ▼
    │              [Answer Brain] lib/answer-brain.ts
    │              ├── Confidence Calculator
    │              ├── Language Detector (Gujarati/Hindi/English)
    │              ├── Grounded LLM prompt with injected context
    │              └── Structured answer generation
    │
    ▼
Chat UI / API Response
├── Direct answer (markdown)
├── Confidence badge (high/medium/low/unverified)
├── Source cards with tier indicators
├── "Checked at" timestamp
└── Collapsible "Search queries used" panel
```

---

## Files Created / Modified

### New Files

| File | Purpose |
|------|---------|
| `lib/search-brain.ts` | Core search orchestration — query rewriting, fetching, ranking, caching |
| `lib/answer-brain.ts` | Grounded answer generation — confidence scoring, language detection, LLM prompting |

### Modified Files

| File | Change |
|------|--------|
| `app/api/search/route.ts` | Now calls `advancedSearch()` + `generateAnswer()` instead of `webSearch()` |
| `app/api/chat/route.ts` | `live_search` intent now uses Answer Brain pipeline; removed unused `SEARCH_SYSTEM_PROMPT` |
| `app/chat/page.tsx` | Added `ConfidenceBadge`, `SearchQueriesPanel`, extended `Message` type with `confidence`, `checkedAt`, `searchQueries` |
| `lib/intent-router.ts` | Expanded `LIVE_SEARCH_KEYWORDS` with Gujarati romanized + Unicode triggers |

---

## `lib/search-brain.ts` — Detail

### SSRF Protection
Blocks all private IP ranges before any HTTP fetch:
- `localhost`, `127.x.x.x`
- `10.x.x.x`, `192.168.x.x`, `172.16-31.x.x`
- `169.254.x.x` (link-local), `100.64.x.x` (CGNAT)
- IPv6 loopback (`::1`), link-local (`fe80::`), ULA (`fc00::`)
- Only `http:` and `https:` protocols allowed

### Source Tier System

| Tier | Description | Examples |
|------|-------------|---------|
| 1 (Official) | Government / central authority | `.gov.in`, `.nic.in`, `pmindia.gov.in`, `eci.gov.in`, `rbi.org.in` |
| 2 (Reputed) | Major news / encyclopedia | `wikipedia.org`, `bbc.com`, `ndtv.com`, `thehindu.com`, `divyabhaskar.com` |
| 3 (General) | All other sources | Everything else |

### Query Rewriter
Gujarati romanized → English corrections (for better search results):

| Input pattern | Corrected to |
|--------------|-------------|
| `gujrat`, `gujarat` | `Gujarat` |
| `atayre`, `atyare`, `haal`, `hal ma` | `current` |
| `kon che`, `kone chhe` | `who is` |
| `mukhyamantri` | `Chief Minister` |
| `pm kon`, `cm kon` | `Prime Minister/Chief Minister who is` |
| `samachar` | `news` |
| `bhav` | `price` |
| `havaman` | `weather` |
| `chuntani` | `election` |

Also adds variants:
- `official site` for CM/PM/minister queries
- `today 2026` for news/latest queries

### Caching
- In-memory `Map<string, {data, expires}>`
- 10-minute TTL
- Key = lowercased + trimmed query
- `cacheHit: true` returned on cache hits

### Content Fetching
- Top 4 sources fetched in parallel via `Promise.allSettled`
- `AbortSignal.timeout(5_000)` — 5s per page
- `User-Agent: Mozilla/5.0 (compatible; MeldexBot/1.0)`
- Strips: `<script>`, `<style>`, `<nav>`, `<footer>`, `<header>`, `<aside>`, `<menu>`, HTML comments
- Max 2500 chars per page (avoids LLM context overflow)

---

## `lib/answer-brain.ts` — Detail

### Confidence Algorithm

```
tier1_count >= 1 AND has_content → "high"
tier1_count >= 1                 → "medium"
tier2_count >= 2 AND has_content → "medium"
tier2_count >= 1                 → "low"
no reliable source               → "unverified"
```

### Language Detection
Detects: Gujarati Unicode (`\u0A80-\u0AFF`), Devanagari (`\u0900-\u097F`), Gujarati romanized keywords, Hindi romanized keywords. Falls back to English.

### LLM Rules (injected as system prompt)
1. Answer ONLY from provided search results — do NOT use training memory
2. If clear answer found, state it directly and confidently
3. Respond in user's language (Gujarati/Hindi/English)
4. Never say "as of my knowledge cutoff" — use source and timestamp
5. If sources conflict, attribute each: "According to [source]..."
6. If unverifiable: "I could not verify this from current sources"
7. Direct answer in first sentence
8. For government facts (CM/PM), ONLY trust Tier 1 sources

### Answer Format
```
**[Direct Answer in 1-2 sentences]**

[2-3 sentences of supporting detail if needed]

*Sources checked at HH:MM · provider*
```

---

## API Response Format

### `GET /api/search?q=...` and `POST /api/search`

```json
{
  "answer": "**Bhupendra Patel** is the current Chief Minister of Gujarat...\n\n*Sources checked at 14:32 · DuckDuckGo*",
  "sources": [
    { "title": "...", "url": "https://...", "snippet": "...", "tier": 1, "content": "..." },
    { "title": "...", "url": "https://...", "snippet": "...", "tier": 2 }
  ],
  "confidence": "high",
  "searchQueries": ["who is Chief Minister of Gujarat", "who is Chief Minister of Gujarat official site", "who is Chief Minister of Gujarat 2025 2026"],
  "provider": "DuckDuckGo",
  "checkedAt": "2026-01-15T09:32:00.000Z",
  "cacheHit": false
}
```

### Chat `/api/chat` (live_search intent)

Same `answer`, `confidence`, `sources`, `checkedAt`, `searchQueries` fields plus:
- `intent: "live_search"`
- `searchProvider: "DuckDuckGo"`

---

## Chat UI Changes

### New Components

**`ConfidenceBadge`** — color-coded pill:
- `high` → mint green
- `medium` → amber
- `low` → orange
- `unverified` → red

**`SearchQueriesPanel`** — collapsible section:
- Toggle shows/hides the list of queries used
- Mono font, minimal design

### Message Display
Below each search answer:
```
[High confidence] [Checked at 14:32]
[Source Card 1] [Source Card 2] [Source Card 3]
▶ 3 search queries used
```

---

## Intent Router Additions

New Gujarati triggers added to `LIVE_SEARCH_KEYWORDS`:

```
"atyare", "haal", "haalma", "atayre"        // "currently/now"
"kon che", "kone chhe", "kone che"          // "who is"
"samachar", "khabaro", "bhav", "havaman"    // "news/prices/weather"
"chuntani", "mukhyamantri"                  // "election/CM"
"no cm", "no pm", "na mukhyamantri"         // possessive CM/PM
"અત્યારે", "હાલ", "કોણ", "સમાચાર", "ભાવ"  // Gujarati Unicode
```

---

## Before vs After

| Aspect | Before | After |
|--------|--------|-------|
| Data freshness | Training memory (stale) | Live search (real-time) |
| Source quality | Any DDG result | Tier 1→2→3 ranked |
| Answer language | Always English | Matches user language |
| Confidence signal | None | High/Medium/Low/Unverified |
| Hedging language | "As of July 2024..." | Direct answer with timestamp |
| Source attribution | None | Source cards with tier badges |
| Page content | Snippet only | Full fetched + extracted text |
| SSRF protection | None | Comprehensive block list |
| Caching | None | 10-min in-memory cache |
| Query optimization | Raw query | Rewritten + variants |

---

## Build Status

```
✓ Compiled successfully
✓ 0 TypeScript errors
✓ 40 routes
✓ /api/search — Advanced Search Brain
✓ /api/chat — Answer Brain for live_search intent
```

---

*Generated: Meldex AI Advanced Search Brain — Session 8*
