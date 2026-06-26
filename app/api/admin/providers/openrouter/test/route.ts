import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/role-guard";
import { testOpenRouterHealth } from "@/lib/provider-health";

const NO_CACHE = { "Cache-Control": "no-store, no-cache", "Pragma": "no-cache" };

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const result = await testOpenRouterHealth();
  return NextResponse.json(result, {
    status: result.ok ? 200 : result.statusCode && result.statusCode < 500 ? 200 : 503,
    headers: NO_CACHE,
  });
}
