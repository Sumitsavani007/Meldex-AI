import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/role-guard";
import { checkRateLimit } from "@/lib/security";
import { advancedSearch } from "@/lib/search-brain";
import { generateAnswer } from "@/lib/answer-brain";

export async function GET(request: Request) {
  try {
    const { error } = await requireAuth();
    if (error) return error;

    checkRateLimit(request.headers.get("x-forwarded-for") || "local-search", 20);

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim();
    if (!q) {
      return NextResponse.json({ error: "Missing query parameter 'q'" }, { status: 400 });
    }

    const searchResult = await advancedSearch(q);
    const answerResult = await generateAnswer(q, searchResult);

    return NextResponse.json({
      answer: answerResult.answer,
      sources: answerResult.sources,
      confidence: answerResult.confidence,
      searchQueries: answerResult.searchQueries,
      provider: answerResult.provider,
      checkedAt: answerResult.checkedAt,
      cacheHit: answerResult.cacheHit,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { error } = await requireAuth();
    if (error) return error;

    checkRateLimit(request.headers.get("x-forwarded-for") || "local-search", 20);

    const body = (await request.json()) as { query?: string; model?: string };
    const q = body.query?.trim();
    if (!q) {
      return NextResponse.json({ error: "Missing 'query' in request body" }, { status: 400 });
    }

    const searchResult = await advancedSearch(q);
    const answerResult = await generateAnswer(q, searchResult, body.model);

    return NextResponse.json({
      answer: answerResult.answer,
      sources: answerResult.sources,
      confidence: answerResult.confidence,
      searchQueries: answerResult.searchQueries,
      provider: answerResult.provider,
      checkedAt: answerResult.checkedAt,
      cacheHit: answerResult.cacheHit,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
