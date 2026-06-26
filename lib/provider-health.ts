import { getProviderConfig } from "@/lib/runtime-config";
import { ModelRouterError } from "@/lib/model-router";

export type SafeProviderError = {
  ok: false;
  provider: string;
  model?: string;
  statusCode?: number;
  code: string;
  reason: string;
  retryAfter?: string | null;
  latencyMs?: number;
  requestId?: string | null;
  userMessage: string;
};

export type OpenRouterHealth = {
  ok: boolean;
  provider: "openrouter";
  model: string;
  statusCode?: number;
  code: string;
  reason: string;
  retryAfter?: string | null;
  latencyMs: number;
  requestId?: string | null;
  userMessage: string;
};

function safeText(value: string, max = 360) {
  return value.replace(/sk-or-[A-Za-z0-9_-]+/g, "sk-or-****").slice(0, max);
}

export function modelErrorStatus(code: string, statusCode?: number) {
  if (statusCode) return statusCode === 401 ? 503 : statusCode;
  if (code === "missing_api_key") return 503;
  if (code === "invalid_model") return 400;
  if (code === "rate_limit") return 429;
  if (code === "network_failure") return 503;
  return 502;
}

export function toSafeProviderError(err: unknown, provider = "openrouter"): SafeProviderError {
  if (err instanceof ModelRouterError) {
    const retryAfter = err.retryAfter ?? null;
    return {
      ok: false,
      provider,
      model: err.model,
      statusCode: err.httpStatus,
      code: err.code,
      reason: safeText(err.message),
      retryAfter,
      requestId: err.requestId ?? null,
      userMessage: friendlyProviderMessage(err.code, err.message, retryAfter),
    };
  }

  const message = err instanceof Error ? err.message : "Provider request failed";
  const code = message.toLowerCase().includes("timeout") ? "timeout" : "provider_error";
  return {
    ok: false,
    provider,
    code,
    reason: safeText(message),
    userMessage: friendlyProviderMessage(code, message),
  };
}

export function friendlyProviderMessage(code: string, reason: string, retryAfter?: string | null) {
  if (code === "missing_api_key") return "Coding model unavailable: OpenRouter API key is missing in Master Panel.";
  if (code === "invalid_model") return "Coding model unavailable: selected model is not available or not found.";
  if (code === "rate_limit") return `Coding model unavailable: rate limited.${retryAfter ? ` Try again after ${retryAfter}.` : " Try again shortly."}`;
  if (code === "insufficient_credits") return "Coding model unavailable: OpenRouter credits or balance are insufficient.";
  if (code === "forbidden") return "Coding model unavailable: API key does not have access to this model.";
  if (code === "timeout") return "Coding model unavailable: provider request timed out.";
  if (code === "network_failure") return "Coding model unavailable: server cannot reach the provider.";
  return `Coding model unavailable: ${safeText(reason, 180)}`;
}

export async function testOpenRouterHealth(): Promise<OpenRouterHealth> {
  const start = Date.now();
  const cfg = await getProviderConfig("openrouter") as {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
  };
  const model = cfg.model || "qwen/qwen3-coder:free";
  const baseUrl = (cfg.baseUrl || "https://openrouter.ai/api/v1").replace(/\/$/, "");

  if (!cfg.apiKey) {
    return {
      ok: false,
      provider: "openrouter",
      model,
      statusCode: 503,
      code: "missing_api_key",
      reason: "OPENROUTER_API_KEY is missing",
      latencyMs: Date.now() - start,
      retryAfter: null,
      requestId: null,
      userMessage: friendlyProviderMessage("missing_api_key", "OPENROUTER_API_KEY is missing"),
    };
  }

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
        "HTTP-Referer": process.env.NEXTAUTH_URL ?? "https://meldex.newsyfly.com",
        "X-Title": "Meldex AI Master Health",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Reply with OK only." }],
        temperature: 0,
        max_tokens: 8,
      }),
      signal: AbortSignal.timeout(Math.min(cfg.timeoutMs || 30000, 30000)),
    });

    const latencyMs = Date.now() - start;
    const requestId = res.headers.get("x-request-id") ?? res.headers.get("cf-ray");
    const retryAfter = res.headers.get("retry-after");
    const text = await res.text();
    let parsed: { error?: { message?: string; code?: string } } | null = null;
    try { parsed = JSON.parse(text); } catch {}

    if (!res.ok || parsed?.error) {
      const reason = safeText(parsed?.error?.message || text || `HTTP ${res.status}`);
      const code =
        res.status === 401 ? "missing_api_key" :
        res.status === 403 ? "forbidden" :
        res.status === 404 ? "invalid_model" :
        res.status === 429 ? "rate_limit" :
        res.status === 402 ? "insufficient_credits" :
        parsed?.error?.code || "provider_error";
      return {
        ok: false,
        provider: "openrouter",
        model,
        statusCode: res.status,
        code,
        reason,
        retryAfter,
        latencyMs,
        requestId,
        userMessage: friendlyProviderMessage(code, reason, retryAfter),
      };
    }

    return {
      ok: true,
      provider: "openrouter",
      model,
      statusCode: res.status,
      code: "ok",
      reason: "Simple completion succeeded",
      retryAfter,
      latencyMs,
      requestId,
      userMessage: "Coding model is healthy.",
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const reason = err instanceof Error ? err.message : "Network error";
    const code = reason.toLowerCase().includes("timeout") ? "timeout" : "network_failure";
    return {
      ok: false,
      provider: "openrouter",
      model,
      statusCode: code === "timeout" ? 504 : 503,
      code,
      reason: safeText(reason),
      retryAfter: null,
      latencyMs,
      requestId: null,
      userMessage: friendlyProviderMessage(code, reason),
    };
  }
}
