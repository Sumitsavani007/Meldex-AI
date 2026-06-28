import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/role-guard";
import { listStudioProviderStatuses } from "@/lib/ai-studio-providers";

export async function POST() {
  const { error } = await requireAuth();
  if (error) return error;

  return NextResponse.json({
    providers: await listStudioProviderStatuses(),
  }, { headers: { "Cache-Control": "no-store" } });
}
