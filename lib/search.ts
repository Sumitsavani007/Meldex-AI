/**
 * lib/search.ts
 *
 * Live web search abstraction.
 *
 * Priority:
 *  1. Serper (Google)   — requires SERPER_API_KEY   (serper.dev, free tier 2.5k/mo)
 *  2. Brave Search      — requires BRAVE_API_KEY    (brave.com/search/api, free tier 2k/mo)
 *  3. DuckDuckGo        — no API key needed, limited to factual/instant answers
 *
 * Add SERPER_API_KEY to .env.local for best results on news/current events.
 */

export interface SearchResult {
  answer: string | null;
  sources: Array<{ title: string; url: string; snippet?: string }>;
  searchQuery: string;
  provider: string;
  timestamp: string;
}

export async function webSearch(query: string): Promise<SearchResult> {
  const timestamp = new Date().toISOString();

  const serperKey = process.env.SERPER_API_KEY;
  if (serperKey) {
    return searchWithSerper(query, serperKey, timestamp);
  }

  const braveKey = process.env.BRAVE_API_KEY;
  if (braveKey) {
    return searchWithBrave(query, braveKey, timestamp);
  }

  return searchWithDDG(query, timestamp);
}

// ─────────────────────────────── Serper ──────────────────────────────────────

async function searchWithSerper(
  query: string,
  apiKey: string,
  timestamp: string
): Promise<SearchResult> {
  const response = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, num: 5, gl: "in", hl: "en" }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) throw new Error(`Serper error: ${response.status}`);

  const data = (await response.json()) as {
    answerBox?: { answer?: string; snippet?: string; title?: string };
    organic?: Array<{ title: string; link: string; snippet?: string }>;
    knowledgeGraph?: { description?: string };
  };

  const ab = data.answerBox;
  const kg = data.knowledgeGraph;
  const organic = data.organic ?? [];

  const answer =
    ab?.answer ??
    ab?.snippet ??
    kg?.description ??
    organic[0]?.snippet ??
    null;

  const sources = organic.slice(0, 4).map((r) => ({
    title: r.title,
    url: r.link,
    snippet: r.snippet,
  }));

  return { answer, sources, searchQuery: query, provider: "Google (via Serper)", timestamp };
}

// ─────────────────────────────── Brave ───────────────────────────────────────

async function searchWithBrave(
  query: string,
  apiKey: string,
  timestamp: string
): Promise<SearchResult> {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`;
  const response = await fetch(url, {
    headers: { "Accept": "application/json", "X-Subscription-Token": apiKey },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) throw new Error(`Brave error: ${response.status}`);

  const data = (await response.json()) as {
    web?: { results?: Array<{ title: string; url: string; description?: string }> };
  };

  const results = data.web?.results ?? [];
  const answer = results[0]?.description ?? null;
  const sources = results.slice(0, 4).map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.description,
  }));

  return { answer, sources, searchQuery: query, provider: "Brave Search", timestamp };
}

// ─────────────────────────────── DuckDuckGo ──────────────────────────────────

async function searchWithDDG(
  query: string,
  timestamp: string
): Promise<SearchResult> {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;

  const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error(`DuckDuckGo error: ${response.status}`);

  const data = (await response.json()) as {
    AbstractText?: string;
    AbstractURL?: string;
    AbstractSource?: string;
    Answer?: string;
    RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
  };

  const answer = data.AbstractText || data.Answer || null;
  const sources: SearchResult["sources"] = [];

  if (data.AbstractURL) {
    sources.push({
      title: data.AbstractSource ?? "Wikipedia",
      url: data.AbstractURL,
    });
  }

  (data.RelatedTopics ?? []).slice(0, 3).forEach((t) => {
    if (t.Text && t.FirstURL) {
      sources.push({ title: t.Text.slice(0, 70), url: t.FirstURL });
    }
  });

  return { answer, sources, searchQuery: query, provider: "DuckDuckGo", timestamp };
}

/** Build a markdown-formatted context block to inject into LLM system prompt */
export function buildSearchContext(result: SearchResult): string {
  const lines: string[] = [];
  if (result.answer) {
    lines.push(`Search answer: ${result.answer}`);
  }
  if (result.sources.length > 0) {
    lines.push(
      "Sources:\n" +
        result.sources
          .map((s, i) => `${i + 1}. [${s.title}](${s.url})${s.snippet ? " — " + s.snippet : ""}`)
          .join("\n")
    );
  }
  lines.push(`Search timestamp: ${result.timestamp}`);
  return lines.join("\n\n");
}
