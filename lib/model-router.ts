/**
 * lib/model-router.ts
 *
 * Unified LLM provider router. Reads runtime-editable settings via
 * getConfig() so admin vault changes apply immediately without restart.
 *
 * Priority for OPENROUTER_MODEL / MELDEX_BRAIN_PROVIDER:
 *   vault (DB) → process.env → default
 */

import { getConfig } from "@/lib/runtime-config";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type CompletionOptions = {
  messages: ChatMessage[];
  /** Optional model override. Falls back to the provider's configured default. */
  model?: string;
  temperature?: number;
  /** Max tokens to generate. Default: 4096 */
  maxTokens?: number;
  /** Timeout in milliseconds. Default: 90 000 */
  timeoutMs?: number;
};

export type ProviderType =
  | "local_ollama"
  | "openrouter"
  | "custom_openai_compatible";

// ---------------------------------------------------------------------------
// Provider detection — uses runtime config so vault changes apply live
// ---------------------------------------------------------------------------

export async function getActiveProvider(): Promise<ProviderType> {
  const raw = ((await getConfig("MELDEX_BRAIN_PROVIDER")) ?? "local_ollama").toLowerCase();
  if (raw === "openrouter") return "openrouter";
  if (raw === "custom_openai_compatible" || raw === "custom") return "custom_openai_compatible";
  return "local_ollama";
}

export async function getProviderLabel(): Promise<string> {
  const p = await getActiveProvider();
  if (p === "openrouter") return "Cloud Test Brain (OpenRouter)";
  if (p === "custom_openai_compatible") return "Custom API";
  return "Local Brain (Ollama)";
}

// ---------------------------------------------------------------------------
// Ollama
// ---------------------------------------------------------------------------

async function callOllama(options: CompletionOptions): Promise<string> {
  const baseUrl = (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434").replace(/\/$/, "");
  const model = options.model?.trim() || process.env.DEFAULT_MODEL || "qwen3-coder:30b";
  const timeout = options.timeoutMs ?? 90_000;

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages: options.messages, stream: false }),
    signal: AbortSignal.timeout(timeout),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new ModelRouterError(
      `Ollama returned ${response.status}. ${detail || "Check that Ollama is running and the model is pulled."}`,
      "provider_error",
      response.status
    );
  }

  const data = (await response.json()) as {
    message?: { content?: string };
    response?: string;
  };
  const content = data.message?.content ?? data.response ?? "";
  if (!content.trim()) throw new ModelRouterError("Ollama returned an empty response.", "empty_response");
  return content;
}

// ---------------------------------------------------------------------------
// OpenAI-compatible (OpenRouter + custom)
// ---------------------------------------------------------------------------

async function callOpenAICompatible(
  baseUrl: string,
  apiKey: string | undefined,
  model: string,
  options: CompletionOptions,
  extraHeaders?: Record<string, string>
): Promise<string> {
  const timeout = options.timeoutMs ?? 90_000;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    ...extraHeaders,
  };

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096,
    }),
    signal: AbortSignal.timeout(timeout),
  });

  if (response.status === 401) {
    throw new ModelRouterError("Invalid or missing API key.", "missing_api_key", 401);
  }
  if (response.status === 429 || response.status === 402) {
    throw new ModelRouterError("Rate limit exceeded.", "rate_limit", response.status);
  }
  if (response.status === 404) {
    throw new ModelRouterError(`Model "${model}" not found.`, "invalid_model", 404);
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    // Check for rate-limit in response body (OpenRouter sometimes returns 200 with error)
    if (detail.includes("rate_limit") || detail.includes("free-models-per-day") || detail.includes("provider rate limit")) {
      throw new ModelRouterError("Rate limit exceeded.", "rate_limit", response.status);
    }
    throw new ModelRouterError(
      `Provider returned ${response.status}.`,
      "provider_error",
      response.status
    );
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string; code?: string };
  };

  // OpenRouter can return 200 with an error object
  if (data.error?.message) {
    const errMsg = data.error.message;
    const isRateLimit = errMsg.includes("rate_limit") || errMsg.includes("free-models-per-day") ||
      errMsg.includes("provider rate limit") || data.error.code === "429";
    if (isRateLimit) {
      throw new ModelRouterError("Rate limit exceeded.", "rate_limit");
    }
    throw new ModelRouterError(errMsg, "provider_error");
  }

  const content = data.choices?.[0]?.message?.content ?? "";
  if (!content.trim()) throw new ModelRouterError("Provider returned an empty response.", "empty_response");
  return content;
}

// ---------------------------------------------------------------------------
// OpenRouter — reads model from runtime config (vault > env > default)
// ---------------------------------------------------------------------------

async function callOpenRouter(options: CompletionOptions): Promise<string> {
  const apiKey = await getConfig("OPENROUTER_API_KEY");
  if (!apiKey) {
    throw new ModelRouterError(
      "OPENROUTER_API_KEY is not configured. Add it in Master Admin → Credentials.",
      "missing_api_key"
    );
  }

  const baseUrl = (await getConfig("OPENROUTER_BASE_URL")) ?? "https://openrouter.ai/api/v1";
  const primaryModel = options.model?.trim() ||
    (await getConfig("OPENROUTER_MODEL")) ||
    "qwen/qwen3-coder:free";

  // Fallback model — configurable via Master Admin
  const configuredFallback = await getConfig("OPENROUTER_FALLBACK_MODEL");
  const fallbackModels = [
    ...(configuredFallback ? [configuredFallback] : []),
    "liquid/lfm-2.5-1.2b-instruct:free",
    "meta-llama/llama-3.3-70b-instruct:free",
  ].filter((m, i, arr) => arr.indexOf(m) === i); // deduplicate

  const extraHeaders = {
    "HTTP-Referer": process.env.NEXTAUTH_URL ?? "https://meldex.newsyfly.com",
    "X-Title": "Meldex AI",
  };

  // Try primary model
  try {
    return await callOpenAICompatible(baseUrl, apiKey, primaryModel, options, extraHeaders);
  } catch (err) {
    if (!(err instanceof ModelRouterError) || err.code !== "rate_limit") throw err;

    // Primary hit rate limit — try fallbacks
    for (const fallbackModel of fallbackModels) {
      try {
        const result = await callOpenAICompatible(baseUrl, apiKey, fallbackModel, options, extraHeaders);
        // Prepend a note that fallback was used
        return `> ⚠️ Free model (${primaryModel}) is temporarily rate limited. Using fallback: ${fallbackModel}\n\n${result}`;
      } catch {
        // try next fallback
      }
    }

    // All fallbacks exhausted
    throw new ModelRouterError(
      `Free model (${primaryModel}) is temporarily rate limited and all fallback models are also unavailable. Please try again in a few minutes.`,
      "rate_limit"
    );
  }
}

async function callCustom(options: CompletionOptions): Promise<string> {
  const baseUrl = process.env.CUSTOM_AI_BASE_URL;
  const model = options.model?.trim() || process.env.CUSTOM_AI_MODEL;
  if (!baseUrl) throw new ModelRouterError("CUSTOM_AI_BASE_URL is not set.", "missing_api_key");
  if (!model) throw new ModelRouterError("CUSTOM_AI_MODEL is not set.", "invalid_model");
  return callOpenAICompatible(baseUrl, process.env.CUSTOM_AI_API_KEY, model, options);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export class ModelRouterError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "missing_api_key"
      | "invalid_model"
      | "provider_error"
      | "rate_limit"
      | "network_failure"
      | "empty_response",
    public readonly httpStatus?: number
  ) {
    super(message);
    this.name = "ModelRouterError";
  }
}

/**
 * Generate a chat completion using the active provider.
 * Throws `ModelRouterError` for all provider-level failures.
 */
export async function generateChatCompletion(options: CompletionOptions): Promise<string> {
  const provider = await getActiveProvider();
  try {
    if (provider === "openrouter") return await callOpenRouter(options);
    if (provider === "custom_openai_compatible") return await callCustom(options);
    return await callOllama(options);
  } catch (err) {
    if (err instanceof ModelRouterError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("fetch") || msg.includes("ECONNREFUSED") || msg.includes("TimeoutError")) {
      throw new ModelRouterError(
        `Network failure reaching ${provider} provider. ${msg}`,
        "network_failure"
      );
    }
    throw new ModelRouterError(msg, "provider_error");
  }
}
