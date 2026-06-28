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
import { ModelProvider, QueueStatus } from "@prisma/client";
import { enqueueAiRequest, finishQueuedRequest, getProviderApiKey, recordProviderHealth, resolveProviderOrder, startQueuedRequest } from "@/lib/ai-infrastructure";
import { logAuditEvent } from "@/lib/audit";

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
  userId?: string;
  taskType?: string;
};

export type CompletionUsage = {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedTokens: number;
  totalTokens: number;
  estimated: boolean;
};

export type CompletionResult = {
  content: string;
  provider: ProviderType;
  model: string;
  usage: CompletionUsage;
};

export type ProviderType =
  | "local_ollama"
  | "openrouter"
  | "openai"
  | "anthropic"
  | "google_gemini"
  | "deepseek"
  | "groq"
  | "together"
  | "local"
  | "custom_openai_compatible";

// ---------------------------------------------------------------------------
// Provider detection — uses runtime config so vault changes apply live
// ---------------------------------------------------------------------------

export async function getActiveProvider(): Promise<ProviderType> {
  const raw = ((await getConfig("MELDEX_BRAIN_PROVIDER")) ?? "local_ollama").toLowerCase();
  if (raw === "openrouter") return "openrouter";
  if (raw === "openai") return "openai";
  if (raw === "anthropic") return "anthropic";
  if (raw === "google_gemini" || raw === "gemini") return "google_gemini";
  if (raw === "deepseek") return "deepseek";
  if (raw === "groq") return "groq";
  if (raw === "together") return "together";
  if (raw === "local") return "local";
  if (raw === "custom_openai_compatible" || raw === "custom") return "custom_openai_compatible";
  return "local_ollama";
}

export async function getProviderLabel(): Promise<string> {
  const p = await getActiveProvider();
  if (p === "openrouter") return "Cloud Test Brain (OpenRouter)";
  if (p === "openai") return "OpenAI";
  if (p === "anthropic") return "Anthropic";
  if (p === "google_gemini") return "Google Gemini";
  if (p === "deepseek") return "DeepSeek";
  if (p === "groq") return "Groq";
  if (p === "together") return "Together";
  if (p === "custom_openai_compatible") return "Custom API";
  return "Local Brain (Ollama)";
}

// ---------------------------------------------------------------------------
// Ollama
// ---------------------------------------------------------------------------

function estimateTokensFromMessages(messages: ChatMessage[], output = "") {
  const input = messages.reduce((sum, message) => sum + Math.ceil(message.content.length / 4), 0);
  return {
    inputTokens: input,
    outputTokens: Math.ceil(output.length / 4),
    reasoningTokens: 0,
    cachedTokens: 0,
    totalTokens: input + Math.ceil(output.length / 4),
    estimated: true,
  };
}

async function callOllama(options: CompletionOptions): Promise<CompletionResult> {
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
  return { content, provider: "local_ollama", model, usage: estimateTokensFromMessages(options.messages, content) };
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
): Promise<CompletionResult> {
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

  const requestId = response.headers.get("x-request-id") ?? response.headers.get("cf-ray");
  const retryAfter = response.headers.get("retry-after");
  if (response.status === 401) {
    throw new ModelRouterError("Invalid or missing API key.", "missing_api_key", 401, model, requestId, retryAfter);
  }
  if (response.status === 403) {
    throw new ModelRouterError(`No access to model "${model}".`, "forbidden", 403, model, requestId, retryAfter);
  }
  if (response.status === 429) {
    throw new ModelRouterError("Rate limit exceeded.", "rate_limit", 429, model, requestId, retryAfter);
  }
  if (response.status === 402) {
    const detail = await response.text().catch(() => "");
    let reason = detail || "Insufficient OpenRouter credits or balance.";
    try {
      const parsed = JSON.parse(detail) as { error?: { message?: string } };
      reason = parsed.error?.message || reason;
    } catch {}
    throw new ModelRouterError(reason, "insufficient_credits", 402, model, requestId, retryAfter);
  }
  if (response.status === 404) {
    throw new ModelRouterError(`Model "${model}" not found.`, "invalid_model", 404, model, requestId, retryAfter);
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    // Check for rate-limit in response body (OpenRouter sometimes returns 200 with error)
    if (detail.includes("rate_limit") || detail.includes("free-models-per-day") || detail.includes("provider rate limit")) {
      throw new ModelRouterError("Rate limit exceeded.", "rate_limit", response.status, model, requestId, retryAfter);
    }
    throw new ModelRouterError(
      `Provider returned ${response.status}.`,
      "provider_error",
      response.status,
      model,
      requestId,
      retryAfter
    );
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string; code?: string };
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
      prompt_tokens_details?: { cached_tokens?: number };
      completion_tokens_details?: { reasoning_tokens?: number };
    };
  };

  // OpenRouter can return 200 with an error object
  if (data.error?.message) {
    const errMsg = data.error.message;
    const isRateLimit = errMsg.includes("rate_limit") || errMsg.includes("free-models-per-day") ||
      errMsg.includes("provider rate limit") || data.error.code === "429";
    if (isRateLimit) {
      throw new ModelRouterError("Rate limit exceeded.", "rate_limit", undefined, model, requestId, retryAfter);
    }
    throw new ModelRouterError(errMsg, "provider_error", undefined, model, requestId, retryAfter);
  }

  const content = data.choices?.[0]?.message?.content ?? "";
  if (!content.trim()) throw new ModelRouterError("Provider returned an empty response.", "empty_response", undefined, model, requestId, retryAfter);
  const usage = data.usage ? {
    inputTokens: Number(data.usage.prompt_tokens || 0),
    outputTokens: Number(data.usage.completion_tokens || 0),
    reasoningTokens: Number(data.usage.completion_tokens_details?.reasoning_tokens || 0),
    cachedTokens: Number(data.usage.prompt_tokens_details?.cached_tokens || 0),
    totalTokens: Number(data.usage.total_tokens || (data.usage.prompt_tokens || 0) + (data.usage.completion_tokens || 0)),
    estimated: false,
  } : estimateTokensFromMessages(options.messages, content);
  return { content, provider: "openrouter", model, usage };
}

async function callAnthropicNative(
  baseUrl: string,
  apiKey: string,
  model: string,
  options: CompletionOptions
): Promise<CompletionResult> {
  const timeout = options.timeoutMs ?? 90_000;
  const system = options.messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n");
  const messages = options.messages
    .filter((message) => message.role !== "system")
    .map((message) => ({ role: message.role === "assistant" ? "assistant" : "user", content: message.content }));

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      system: system || undefined,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096,
    }),
    signal: AbortSignal.timeout(timeout),
  });

  const requestId = response.headers.get("request-id") ?? response.headers.get("x-request-id");
  const retryAfter = response.headers.get("retry-after");
  if (response.status === 401) throw new ModelRouterError("Invalid or missing Anthropic API key.", "missing_api_key", 401, model, requestId, retryAfter);
  if (response.status === 403) throw new ModelRouterError(`No access to model "${model}".`, "forbidden", 403, model, requestId, retryAfter);
  if (response.status === 429) throw new ModelRouterError("Rate limit exceeded.", "rate_limit", 429, model, requestId, retryAfter);
  if (response.status === 404) throw new ModelRouterError(`Model "${model}" not found.`, "invalid_model", 404, model, requestId, retryAfter);
  if (!response.ok) throw new ModelRouterError(`Anthropic returned ${response.status}.`, "provider_error", response.status, model, requestId, retryAfter);

  const data = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number };
    error?: { message?: string };
  };
  if (data.error?.message) throw new ModelRouterError(data.error.message, "provider_error", undefined, model, requestId, retryAfter);
  const content = data.content?.map((part) => part.text || "").join("").trim() || "";
  if (!content) throw new ModelRouterError("Anthropic returned an empty response.", "empty_response", undefined, model, requestId, retryAfter);
  const usage = data.usage ? {
    inputTokens: Number(data.usage.input_tokens || 0),
    outputTokens: Number(data.usage.output_tokens || 0),
    reasoningTokens: 0,
    cachedTokens: Number(data.usage.cache_read_input_tokens || 0),
    totalTokens: Number(data.usage.input_tokens || 0) + Number(data.usage.output_tokens || 0),
    estimated: false,
  } : estimateTokensFromMessages(options.messages, content);
  return { content, provider: "anthropic", model, usage };
}

function affordableMaxTokens(reason: string, requested?: number) {
  const match = reason.match(/can only afford\s+(\d+)/i);
  if (!match) return null;
  const affordable = Number(match[1]);
  if (!Number.isFinite(affordable) || affordable < 64) return null;
  const next = Math.max(64, affordable - 16);
  if (requested && next >= requested) return null;
  return next;
}

// ---------------------------------------------------------------------------
// OpenRouter — reads model from runtime config (vault > env > default)
// ---------------------------------------------------------------------------

async function callOpenRouter(options: CompletionOptions): Promise<CompletionResult> {
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
    if (err instanceof ModelRouterError && err.code === "insufficient_credits") {
      for (const fallbackModel of fallbackModels) {
        try {
          const result = await callOpenAICompatible(baseUrl, apiKey, fallbackModel, options, extraHeaders);
          return { ...result, content: `> Primary model (${primaryModel}) exceeded the current credit token budget. Using fallback: ${fallbackModel}\n\n${result.content}` };
        } catch {
          // try next fallback before attempting a smaller primary response
        }
      }

      const reducedMaxTokens = affordableMaxTokens(err.message, options.maxTokens);
      if (reducedMaxTokens) {
        return callOpenAICompatible(
          baseUrl,
          apiKey,
          primaryModel,
          { ...options, maxTokens: reducedMaxTokens },
          extraHeaders
        );
      }
    }
    if (!(err instanceof ModelRouterError) || err.code !== "rate_limit") throw err;

    // Primary hit rate limit — try fallbacks
    for (const fallbackModel of fallbackModels) {
      try {
        const result = await callOpenAICompatible(baseUrl, apiKey, fallbackModel, options, extraHeaders);
        // Prepend a note that fallback was used
        return { ...result, content: `> ⚠️ Free model (${primaryModel}) is temporarily rate limited. Using fallback: ${fallbackModel}\n\n${result.content}` };
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

async function callCustom(options: CompletionOptions): Promise<CompletionResult> {
  const baseUrl = process.env.CUSTOM_AI_BASE_URL;
  const model = options.model?.trim() || process.env.CUSTOM_AI_MODEL;
  if (!baseUrl) throw new ModelRouterError("CUSTOM_AI_BASE_URL is not set.", "missing_api_key");
  if (!model) throw new ModelRouterError("CUSTOM_AI_MODEL is not set.", "invalid_model");
  const result = await callOpenAICompatible(baseUrl, process.env.CUSTOM_AI_API_KEY, model, options);
  return { ...result, provider: "custom_openai_compatible", model };
}

function providerTypeFromDb(provider: ModelProvider): ProviderType {
  if (provider === ModelProvider.OPENROUTER) return "openrouter";
  if (provider === ModelProvider.OPENAI) return "openai";
  if (provider === ModelProvider.ANTHROPIC) return "anthropic";
  if (provider === ModelProvider.GOOGLE_GEMINI) return "google_gemini";
  if (provider === ModelProvider.DEEPSEEK) return "deepseek";
  if (provider === ModelProvider.GROQ) return "groq";
  if (provider === ModelProvider.TOGETHER) return "together";
  if (provider === ModelProvider.CUSTOM_OPENAI_COMPATIBLE) return "custom_openai_compatible";
  if (provider === ModelProvider.LOCAL) return "local";
  return "local_ollama";
}

async function callConfiguredProvider(config: Awaited<ReturnType<typeof resolveProviderOrder>>[number], options: CompletionOptions): Promise<CompletionResult> {
  const provider = providerTypeFromDb(config.provider);
  const model = config.selectedModel || config.defaultModel;
  const timeoutMs = options.timeoutMs ?? config.timeoutMs;
  if (config.provider === ModelProvider.OLLAMA || config.provider === ModelProvider.LOCAL) {
    return callOllama({ ...options, model, timeoutMs });
  }
  const apiKey = await getProviderApiKey(config.apiKeySettingKey);
  if (!apiKey && config.provider !== ModelProvider.CUSTOM_OPENAI_COMPATIBLE) {
    throw new ModelRouterError(`${config.name} API key is not configured.`, "missing_api_key", 503, model);
  }
  if (!config.baseUrl) throw new ModelRouterError(`${config.name} base URL is not configured.`, "missing_api_key", 503, model);
  if (config.provider === ModelProvider.ANTHROPIC) {
    if (!apiKey) throw new ModelRouterError(`${config.name} API key is not configured.`, "missing_api_key", 503, model);
    return callAnthropicNative(config.baseUrl, apiKey, model, { ...options, timeoutMs });
  }
  const extraHeaders = config.provider === ModelProvider.OPENROUTER ? {
    "HTTP-Referer": process.env.NEXTAUTH_URL ?? "https://meldex.newsyfly.com",
    "X-Title": "Meldex AI",
  } : undefined;
  let result: CompletionResult;
  try {
    result = await callOpenAICompatible(config.baseUrl, apiKey, model, { ...options, timeoutMs }, extraHeaders);
  } catch (err) {
    if (err instanceof ModelRouterError && err.code === "insufficient_credits") {
      const reducedMaxTokens = affordableMaxTokens(err.message, options.maxTokens);
      if (reducedMaxTokens) {
        result = await callOpenAICompatible(config.baseUrl, apiKey, model, { ...options, timeoutMs, maxTokens: reducedMaxTokens }, extraHeaders);
      } else {
        throw err;
      }
    } else {
      throw err;
    }
  }
  return { ...result, provider, model };
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
      | "forbidden"
      | "insufficient_credits"
      | "provider_error"
      | "rate_limit"
      | "network_failure"
      | "empty_response",
    public readonly httpStatus?: number,
    public readonly model?: string,
    public readonly requestId?: string | null,
    public readonly retryAfter?: string | null
  ) {
    super(message);
    this.name = "ModelRouterError";
  }
}

function safeProviderErrorSummary(err: ModelRouterError) {
  const detail = err.message
    .replace(/sk-or-v1-[A-Za-z0-9_-]+/g, "sk-or-v1-****")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer ****")
    .slice(0, 500);
  return `${err.code}${err.httpStatus ? ` ${err.httpStatus}` : ""}${err.model ? ` ${err.model}` : ""}: ${detail}`;
}

/**
 * Generate a chat completion using the active provider.
 * Throws `ModelRouterError` for all provider-level failures.
 */
export async function generateChatCompletionWithUsage(options: CompletionOptions): Promise<CompletionResult> {
  const queue = options.userId ? await enqueueAiRequest({ userId: options.userId, taskType: options.taskType || "chat_completion", metadata: { model: options.model } }) : null;
  if (queue) await startQueuedRequest(queue.id);
  const providers = await resolveProviderOrder(options.model);
  const errors: string[] = [];
  for (const providerConfig of providers) {
    const started = Date.now();
    try {
      const result = await callConfiguredProvider(providerConfig, options);
      await recordProviderHealth({
        providerConfigId: providerConfig.id,
        provider: providerConfig.provider,
        model: result.model,
        ok: true,
        latencyMs: Date.now() - started,
      }).catch(() => undefined);
      if (queue) await finishQueuedRequest(queue.id, QueueStatus.SUCCEEDED, { provider: result.provider, model: result.model }).catch(() => undefined);
      if (options.userId) await logAuditEvent({ userId: options.userId, action: "AI_REQUEST", resource: result.provider, success: true, metadata: { model: result.model, usage: result.usage } }).catch(() => undefined);
      return result;
    } catch (err) {
      const routerError = err instanceof ModelRouterError ? err : new ModelRouterError(err instanceof Error ? err.message : String(err), "provider_error");
      errors.push(`${providerConfig.name}: ${safeProviderErrorSummary(routerError)}`);
      await recordProviderHealth({
        providerConfigId: providerConfig.id,
        provider: providerConfig.provider,
        model: providerConfig.selectedModel || providerConfig.defaultModel,
        ok: false,
        latencyMs: Date.now() - started,
        statusCode: routerError.httpStatus,
        errorCode: routerError.code,
        errorMessage: routerError.message,
        requestId: routerError.requestId,
      }).catch(() => undefined);
      if (!providerConfig.isFallbackEnabled) break;
    }
  }
  const provider = await getActiveProvider();
  try {
    if (!providers.length) {
      if (provider === "openrouter") return await callOpenRouter(options);
      if (provider === "custom_openai_compatible") return await callCustom(options);
      return await callOllama(options);
    }
    const allInsufficientCredits = errors.length > 0 && errors.every((item) => item.includes("insufficient_credits"));
    throw new ModelRouterError(
      `All configured providers failed: ${errors.join(" → ") || "no provider available"}`,
      allInsufficientCredits ? "insufficient_credits" : "provider_error",
      allInsufficientCredits ? 402 : 502
    );
  } catch (err) {
    if (queue) await finishQueuedRequest(queue.id, QueueStatus.FAILED, { errors }).catch(() => undefined);
    if (err instanceof ModelRouterError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("fetch") || msg.includes("ECONNREFUSED") || msg.includes("TimeoutError")) {
      throw new ModelRouterError(`Network failure reaching ${provider} provider. ${msg}`, "network_failure");
    }
    throw new ModelRouterError(msg, "provider_error");
  }
}

export async function generateChatCompletion(options: CompletionOptions): Promise<string> {
  const result = await generateChatCompletionWithUsage(options);
  return result.content;
}
