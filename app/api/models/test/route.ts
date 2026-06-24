import { NextResponse } from "next/server";
import {
  generateChatCompletion,
  getActiveProvider,
  getProviderLabel,
  ModelRouterError,
} from "@/lib/model-router";

/**
 * GET /api/models/test
 *
 * Tests the currently configured brain provider by sending a minimal
 * chat completion.  Returns provider info and latency.
 *
 * No auth required — used by settings UI and health dashboards.
 * The route does NOT expose API keys or internal env vars.
 */
export async function GET() {
  const provider = getActiveProvider();
  const providerLabel = getProviderLabel();
  const start = Date.now();

  try {
    // Minimal probe — just enough to verify the provider is reachable
    const probe = await generateChatCompletion({
      messages: [{ role: "user", content: 'Reply with exactly the word "pong".' }],
      timeoutMs: 15_000,
    });

    const latencyMs = Date.now() - start;
    return NextResponse.json({
      status: "ok",
      provider,
      providerLabel,
      latencyMs,
      probeResponse: probe.slice(0, 80), // truncate for safety
    });
  } catch (err) {
    const latencyMs = Date.now() - start;
    if (err instanceof ModelRouterError) {
      return NextResponse.json(
        { status: "error", provider, providerLabel, latencyMs, error: err.message, code: err.code },
        { status: err.code === "missing_api_key" ? 401 : 503 }
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { status: "error", provider, providerLabel, latencyMs, error: message },
      { status: 503 }
    );
  }
}
