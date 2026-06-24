/**
 * lib/model-router.ts
 *
 * Unified LLM provider router.  Reads MELDEX_BRAIN_PROVIDER from the server
 * environment and routes chat completion requests to the correct backend.
 *
 * Supported providers
 * -------------------
 *  local_ollama           — Local Ollama server (default)
 *  openrouter             — OpenRouter (OpenAI-compatible)
 *  custom_openai_compatible — Any OpenAI-compatible endpoint
 *
 * Environment variables
 * ---------------------
 *  MELDEX_BRAIN_PROVIDER   local_ollama | openrouter | custom_openai_compatible
 *
 *  --- Ollama ---
 *  OLLAMA_BASE_URL          default: http://localhost:11434
 *  DEFAULT_MODEL            default: qwen3-coder:30b
 *
 *  --- OpenRouter ---
 *  OPENROUTER_API_KEY       required
 *  OPENROUTER_BASE_URL      default: https://openrouter.ai/api/v1
 *  OPENROUTER_MODEL         default: qwen/qwen3-coder:free
 *
 *  --- Custom OpenAI-compatible ---
 *  CUSTOM_AI_BASE_URL       required
 *  CUSTOM_AI_API_KEY        optional
 *  CUSTOM_AI_MODEL          required
 */

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type CompletionOptions = {
  messages: ChatMessage[];
  /** Optional model override.  Falls back to the provider's configured default. */
  model?: string;
  temperature?: number;
  /** Timeout in milliseconds.  Default: 90 000 */
  timeoutMs?: number;
};

export type ProviderType =
  | "local_ollama"
  | "openrouter"
  | "custom_openai_compatible";

// ---------------------------------------------------------------------------
// Provider detection
// ---------------------------------------------------------------------------

export function getActiveProvider(): ProviderType {
  const raw = (process.env.MELDEX_BRAIN_PROVIDER ?? "local_ollama").toLowerCase();
  if (raw === "openrouter") return "openrouter";
  if (raw === "custom_openai_compatible" || raw === "custom") return "custom_openai_compatible";
  return "local_ollama";
}

export function getProviderLabel(): string {
  const p = getActiveProvider();
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
    }),
    signal: AbortSignal.timeout(timeout),
  });

  if (response.status === 401) {
    throw new ModelRouterError("Invalid or missing API key. Check your OPENROUTER_API_KEY / CUSTOM_AI_API_KEY.", "missing_api_key", 401);
  }
  if (response.status === 429) {
    throw new ModelRouterError("Rate limit exceeded for this provider. Try again shortly.", "rate_limit", 429);
  }
  if (response.status === 404) {
    throw new ModelRouterError(`Model "${model}" not found. Check OPENROUTER_MODEL / CUSTOM_AI_MODEL.`, "invalid_model", 404);
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new ModelRouterError(
      `Provider returned ${response.status}. ${detail || ""}`,
      "provider_error",
      response.status
    );
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
  };

  if (data.error?.message) {
    throw new ModelRouterError(data.error.message, "provider_error");
  }

  const content = data.choices?.[0]?.message?.content ?? "";
  if (!content.trim()) throw new ModelRouterError("Provider returned an empty response.", "empty_response");
  return content;
}

async function callOpenRouter(options: CompletionOptions): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new ModelRouterError(
      "OPENROUTER_API_KEY is not set. Add it to .env.local to use the cloud brain.",
      "missing_api_key"
    );
  }
  const baseUrl = process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
  const model = options.model?.trim() || process.env.OPENROUTER_MODEL || "qwen/qwen3-coder:free";

  return callOpenAICompatible(baseUrl, apiKey, model, options, {
    // OpenRouter recommends these headers for attribution
    "HTTP-Referer": process.env.NEXTAUTH_URL ?? "http://localhost:3000",
    "X-Title": "Meldex AI",
  });
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
  const provider = getActiveProvider();
  try {
    if (provider === "openrouter") return await callOpenRouter(options);
    if (provider === "custom_openai_compatible") return await callCustom(options);
    return await callOllama(options);
  } catch (err) {
    if (err instanceof ModelRouterError) throw err;
    // Wrap network / timeout errors
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
