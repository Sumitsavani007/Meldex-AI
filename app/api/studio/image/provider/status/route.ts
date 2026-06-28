import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/role-guard";
import { getImageProviderStatuses } from "@/lib/ai-studio-image-provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const { error } = await requireAuth();
  if (error) return error;
  const providers = await getImageProviderStatuses();
  return NextResponse.json({ providers }, { headers: { "Cache-Control": "no-store" } });
}
