import crypto from "crypto";
import { AbuseSeverity, ModelProvider, Prisma, QueueStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/runtime-config";
import { logAuditEvent } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";

export const PROVIDER_DEFAULTS = [
  { provider: ModelProvider.OPENROUTER, name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", apiKeySettingKey: "OPENROUTER_API_KEY", defaultModel: "qwen/qwen3-coder-30b-a3b-instruct", priority: 10, enabled: true },
  { provider: ModelProvider.OPENAI, name: "OpenAI", baseUrl: "https://api.openai.com/v1", apiKeySettingKey: "OPENAI_API_KEY", defaultModel: "gpt-4.1-mini", priority: 20, enabled: false },
  { provider: ModelProvider.ANTHROPIC, name: "Anthropic", baseUrl: "https://api.anthropic.com/v1", apiKeySettingKey: "ANTHROPIC_API_KEY", defaultModel: "claude-3-5-sonnet-latest", priority: 30, enabled: false },
  { provider: ModelProvider.GOOGLE_GEMINI, name: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", apiKeySettingKey: "GEMINI_API_KEY", defaultModel: "gemini-2.0-flash", priority: 40, enabled: false },
  { provider: ModelProvider.DEEPSEEK, name: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", apiKeySettingKey: "DEEPSEEK_API_KEY", defaultModel: "deepseek-chat", priority: 50, enabled: false },
  { provider: ModelProvider.GROQ, name: "Groq", baseUrl: "https://api.groq.com/openai/v1", apiKeySettingKey: "GROQ_API_KEY", defaultModel: "llama-3.3-70b-versatile", priority: 60, enabled: false },
  { provider: ModelProvider.TOGETHER, name: "Together", baseUrl: "https://api.together.xyz/v1", apiKeySettingKey: "TOGETHER_API_KEY", defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo", priority: 70, enabled: false },
  { provider: ModelProvider.OLLAMA, name: "Ollama", baseUrl: "http://localhost:11434", apiKeySettingKey: null, defaultModel: "qwen3-coder:30b", priority: 80, enabled: false },
  { provider: ModelProvider.LOCAL, name: "Local Model", baseUrl: "http://localhost:11434", apiKeySettingKey: null, defaultModel: "local", priority: 90, enabled: false },
  { provider: ModelProvider.CUSTOM_OPENAI_COMPATIBLE, name: "Custom OpenAI Compatible", baseUrl: "", apiKeySettingKey: "CUSTOM_AI_API_KEY", defaultModel: "custom-model", priority: 100, enabled: false },
] as const;

const rateBucket = new Map<string, { minute: number[]; hour: number[]; day: number[] }>();

function nowWindow(history: number[], ms: number) {
  const now = Date.now();
  return history.filter((item) => item > now - ms);
}

export async function seedAiInfrastructureDefaults() {
  const providers = [];
  for (const item of PROVIDER_DEFAULTS) {
    providers.push(await prisma.aiProviderConfig.upsert({
      where: { provider_defaultModel: { provider: item.provider, defaultModel: item.defaultModel } },
      update: {},
      create: {
        provider: item.provider,
        name: item.name,
        baseUrl: item.baseUrl,
        apiKeySettingKey: item.apiKeySettingKey,
        defaultModel: item.defaultModel,
        priority: item.priority,
        isEnabled: item.enabled,
        fallbackModelsJson: [],
      },
    }));
  }
  const rules = [
    { key: "chat", description: "User chat requests", requestsPerMinute: 40, requestsPerHour: 500, requestsPerDay: 3000 },
    { key: "agent_runs", description: "Workspace and coding agent runs", requestsPerMinute: 12, requestsPerHour: 100, requestsPerDay: 500 },
    { key: "workspace_actions", description: "Workspace create/read/write actions", requestsPerMinute: 80, requestsPerHour: 1200, requestsPerDay: 8000 },
    { key: "preview", description: "Preview verify/run requests", requestsPerMinute: 30, requestsPerHour: 400, requestsPerDay: 2500 },
    { key: "downloads", description: "Project exports", requestsPerMinute: 10, requestsPerHour: 80, requestsPerDay: 300 },
    { key: "api_access", description: "Public or extension API access", requestsPerMinute: 60, requestsPerHour: 1000, requestsPerDay: 10000 },
  ];
  for (const rule of rules) {
    await prisma.rateLimitRule.upsert({ where: { key: rule.key }, update: {}, create: rule });
  }
  return providers;
}

export async function listAiInfrastructure() {
  await seedAiInfrastructureDefaults();
  const [providers, queue, health, rateLimits, abuse, apiKeys] = await Promise.all([
    prisma.aiProviderConfig.findMany({ orderBy: [{ priority: "asc" }, { name: "asc" }] }),
    prisma.aiRequestQueue.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { user: { select: { email: true, name: true } }, providerConfig: true } }),
    prisma.providerHealthEvent.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.rateLimitRule.findMany({ orderBy: { key: "asc" } }),
    prisma.abuseEvent.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { user: { select: { email: true, name: true } } } }),
    prisma.userApiKey.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { user: { select: { email: true, name: true } } } }),
  ]);
  return { providers, queue, health, rateLimits, abuse, apiKeys };
}

export async function resolveProviderOrder(modelOverride?: string) {
  await seedAiInfrastructureDefaults();
  const providers = await prisma.aiProviderConfig.findMany({
    where: { isEnabled: true },
    orderBy: [{ priority: "asc" }, { healthScore: "desc" }],
  });
  return providers.filter((provider) => provider.healthStatus !== "unhealthy" || provider.isFallbackEnabled).map((provider) => ({
    ...provider,
    selectedModel: modelOverride || provider.defaultModel,
  }));
}

export async function getProviderApiKey(settingKey?: string | null) {
  if (!settingKey) return undefined;
  return (await getConfig(settingKey)) || undefined;
}

export async function recordProviderHealth(input: {
  providerConfigId?: string | null;
  provider: ModelProvider;
  model?: string | null;
  ok: boolean;
  latencyMs?: number;
  statusCode?: number;
  errorCode?: string;
  errorMessage?: string;
  requestId?: string | null;
}) {
  const event = await prisma.providerHealthEvent.create({
    data: {
      providerConfigId: input.providerConfigId || null,
      provider: input.provider,
      model: input.model || null,
      status: input.ok ? "healthy" : "failed",
      statusCode: input.statusCode,
      latencyMs: input.latencyMs,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage?.slice(0, 500),
      requestId: input.requestId || null,
    },
  });
  if (input.providerConfigId) {
    const current = await prisma.aiProviderConfig.findUnique({ where: { id: input.providerConfigId } });
    const nextScore = Math.max(0, Math.min(100, (current?.healthScore ?? 100) + (input.ok ? 5 : -25)));
    const healthStatus = nextScore < 35 ? "unhealthy" : input.ok ? "healthy" : "degraded";
    await prisma.aiProviderConfig.update({
      where: { id: input.providerConfigId },
      data: {
        healthScore: nextScore,
        healthStatus,
        lastHealthCheckAt: new Date(),
        lastError: input.ok ? null : input.errorMessage?.slice(0, 500),
      },
    });
  }
  if (!input.ok && ["rate_limit", "insufficient_credits", "provider_error", "timeout"].includes(input.errorCode || "")) {
    const admins = await prisma.user.findMany({ where: { role: { in: ["ADMIN", "OWNER"] } }, select: { id: true } });
    await Promise.all(admins.map((admin) => createNotification({
      userId: admin.id,
      type: "provider_unhealthy",
      variables: { provider: input.provider, model: input.model || "" },
      metadata: { provider: input.provider, model: input.model, errorCode: input.errorCode },
      dedupeWindowMinutes: 30,
    }).catch(() => undefined)));
  }
  return event;
}

export async function enqueueAiRequest(input: { userId: string; providerConfigId?: string | null; taskType: string; planPriority?: number; metadata?: Record<string, unknown> }) {
  const priority = Math.max(1, 100 - (input.planPriority || 1) * 10);
  const pendingAhead = await prisma.aiRequestQueue.count({ where: { status: QueueStatus.QUEUED, priority: { lte: priority } } });
  return prisma.aiRequestQueue.create({
    data: {
      userId: input.userId,
      providerConfigId: input.providerConfigId || null,
      taskType: input.taskType,
      priority,
      etaSeconds: pendingAhead * 8,
      metadataJson: (input.metadata || {}) as Prisma.InputJsonValue,
    },
  });
}

export async function startQueuedRequest(id: string) {
  return prisma.aiRequestQueue.update({ where: { id }, data: { status: QueueStatus.RUNNING, startedAt: new Date() } });
}

export async function finishQueuedRequest(id: string, status: QueueStatus, metadata?: Record<string, unknown>) {
  return prisma.aiRequestQueue.update({
    where: { id },
    data: {
      status,
      completedAt: status === QueueStatus.CANCELED ? undefined : new Date(),
      canceledAt: status === QueueStatus.CANCELED ? new Date() : undefined,
      metadataJson: (metadata || {}) as Prisma.InputJsonValue,
    },
  });
}

export async function checkDynamicRateLimit(userId: string, key: string) {
  await seedAiInfrastructureDefaults();
  const rule = await prisma.rateLimitRule.findUnique({ where: { key } });
  if (!rule || !rule.isEnabled) return { ok: true as const };
  const bucketKey = `${userId}:${key}`;
  const current = rateBucket.get(bucketKey) || { minute: [], hour: [], day: [] };
  current.minute = nowWindow(current.minute, 60_000);
  current.hour = nowWindow(current.hour, 60 * 60_000);
  current.day = nowWindow(current.day, 24 * 60 * 60_000);
  if (current.minute.length >= rule.requestsPerMinute || current.hour.length >= rule.requestsPerHour || current.day.length >= rule.requestsPerDay) {
    await prisma.abuseEvent.create({
      data: {
        userId,
        type: "rate_limit",
        severity: AbuseSeverity.MEDIUM,
        reason: `Rate limit exceeded for ${key}`,
        blockedUntil: new Date(Date.now() + 60_000),
        metadataJson: { key, rule } as Prisma.InputJsonValue,
      },
    }).catch(() => undefined);
    return { ok: false as const, code: "RATE_LIMIT_EXCEEDED", message: "Rate limit exceeded. Please wait before retrying.", retryAfterSeconds: 60 };
  }
  const now = Date.now();
  current.minute.push(now);
  current.hour.push(now);
  current.day.push(now);
  rateBucket.set(bucketKey, current);
  return { ok: true as const };
}

export async function detectAbuse(input: { userId: string; prompt?: string; action: string }) {
  const activeBlock = await prisma.abuseEvent.findFirst({ where: { userId: input.userId, blockedUntil: { gt: new Date() } }, orderBy: { createdAt: "desc" } });
  if (activeBlock) return { ok: false as const, code: "TEMPORARILY_BLOCKED", message: activeBlock.reason, blockedUntil: activeBlock.blockedUntil };
  const prompt = input.prompt || "";
  const repeated = /(.)\1{80,}/.test(prompt) || prompt.length > 80_000;
  const recent = await prisma.abuseEvent.count({ where: { userId: input.userId, createdAt: { gte: new Date(Date.now() - 10 * 60_000) } } });
  if (repeated || recent >= 10) {
    const event = await prisma.abuseEvent.create({
      data: {
        userId: input.userId,
        type: repeated ? "prompt_flooding" : "rapid_retries",
        severity: repeated ? AbuseSeverity.HIGH : AbuseSeverity.MEDIUM,
        reason: repeated ? "Prompt flooding detected." : "Rapid repeated failures or retries detected.",
        blockedUntil: new Date(Date.now() + 10 * 60_000),
        metadataJson: { action: input.action, promptLength: prompt.length } as Prisma.InputJsonValue,
      },
    });
    return { ok: false as const, code: "ABUSE_DETECTED", message: event.reason, blockedUntil: event.blockedUntil };
  }
  return { ok: true as const };
}

export function createUserApiKeySecret() {
  return `mdx_user_${crypto.randomBytes(24).toString("hex")}`;
}

export function hashApiKey(key: string) {
  return crypto.createHash("sha256").update(key).digest("hex");
}

export async function createUserApiKey(input: { userId: string; name: string; scopes: string[]; expiresAt?: Date | null }) {
  const raw = createUserApiKeySecret();
  const saved = await prisma.userApiKey.create({
    data: {
      userId: input.userId,
      name: input.name,
      keyHash: hashApiKey(raw),
      keyPrefix: "mdx_user_",
      keyLast4: raw.slice(-4),
      scopesJson: input.scopes as Prisma.InputJsonValue,
      expiresAt: input.expiresAt || null,
    },
  });
  await logAuditEvent({ userId: input.userId, action: "USER_API_KEY_CREATE", resource: "UserApiKey", resourceId: saved.id, success: true, metadata: { scopes: input.scopes } });
  return { raw, apiKey: saved };
}
