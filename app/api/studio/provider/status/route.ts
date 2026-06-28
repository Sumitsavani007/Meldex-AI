import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/role-guard";
import { testOpenRouterHealth } from "@/lib/provider-health";

export async function POST() {
  const { error } = await requireAuth();
  if (error) return error;

  const openRouter = await testOpenRouterHealth().catch((err) => ({
    ok: false,
    message: err instanceof Error ? err.message : "OpenRouter health check failed",
  }));
  const openRouterMessage = "message" in openRouter ? openRouter.message : "Prompt intelligence provider";

  return NextResponse.json({
    providers: [
      { key: "openrouter", name: "OpenRouter", status: openRouter.ok ? "connected" : "failed", message: openRouterMessage || "Prompt intelligence provider" },
      { key: "comfyui", name: "ComfyUI", status: "not_configured", message: "Local video provider not configured" },
      { key: "wan21", name: "Wan 2.1", status: "not_configured", message: "Video model runtime not configured" },
      { key: "flux", name: "FLUX", status: "not_configured", message: "Image model runtime not configured" },
      { key: "sdxl", name: "SDXL", status: "not_configured", message: "Image model runtime not configured" },
      { key: "xtts", name: "XTTS", status: "not_configured", message: "Voice clone runtime not configured" },
      { key: "ffmpeg", name: "FFmpeg", status: "not_configured", message: "Render/export runtime not configured" },
    ],
  }, { headers: { "Cache-Control": "no-store" } });
}
