import { NextResponse } from "next/server";
import { readBenchmarkFailureCount, readBenchmarkSummary } from "@/lib/benchmark-store";
import { requireAdmin } from "@/lib/role-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  return NextResponse.json({
    summary: readBenchmarkSummary(),
    failureDatabaseSize: readBenchmarkFailureCount(),
  });
}
