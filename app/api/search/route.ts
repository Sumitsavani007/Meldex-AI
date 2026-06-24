import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/role-guard";
import { checkRateLimit } from "@/lib/security";
import { webSearch } from "@/lib/search";

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

    const result = await webSearch(q);
    return NextResponse.json(result);
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

    const body = (await request.json()) as { query?: string };
    const q = body.query?.trim();
    if (!q) {
      return NextResponse.json({ error: "Missing 'query' in request body" }, { status: 400 });
    }

    const result = await webSearch(q);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
