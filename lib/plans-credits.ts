import { CreditTransactionType, Prisma, UsageWindowType, UserPlanStatus, type Plan } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/runtime-config";
import type { CompletionUsage } from "@/lib/model-router";

export const DEFAULT_PLAN_SLUGS = ["free", "meldex-plus", "meldex-pro", "meldex-pro-plus"] as const;

export const DEFAULT_ALLOWED_MODELS = [
  "qwen/qwen3-coder-30b-a3b-instruct",
  "qwen/qwen3-coder:free",
];

export const DEFAULT_PLANS = [
  {
    id: "plan_free",
    name: "Free",
    slug: "free",
    description: "Starter access for trying Meldex.",
    priceMonthly: 0,
    priceYearly: 0,
    currency: "USD",
    monthlyCredits: 1000,
    weeklyCredits: 300,
    fiveHourCredits: 50,
    maxContextTokens: 128000,
    maxWorkspaceCount: 3,
    maxStorageMb: 500,
    maxParallelTasks: 1,
    priorityLevel: 1,
    allowedModelsJson: DEFAULT_ALLOWED_MODELS,
    featuresJson: ["Basic workspace", "AI chat", "Offline mode"],
    isActive: true,
    sortOrder: 10,
  },
  {
    id: "plan_plus",
    name: "Meldex Plus",
    slug: "meldex-plus",
    description: "More credits and larger workspaces for active builders.",
    priceMonthly: 1900,
    priceYearly: 19000,
    currency: "USD",
    monthlyCredits: 10000,
    weeklyCredits: 3000,
    fiveHourCredits: 500,
    maxContextTokens: 500000,
    maxWorkspaceCount: 20,
    maxStorageMb: 10000,
    maxParallelTasks: 2,
    priorityLevel: 2,
    allowedModelsJson: DEFAULT_ALLOWED_MODELS,
    featuresJson: ["Priority workspace runs", "Extension tokens", "Memory"],
    isActive: true,
    sortOrder: 20,
  },
  {
    id: "plan_pro",
    name: "Meldex Pro",
    slug: "meldex-pro",
    description: "Professional limits for serious product work.",
    priceMonthly: 4900,
    priceYearly: 49000,
    currency: "USD",
    monthlyCredits: 50000,
    weeklyCredits: 15000,
    fiveHourCredits: 2500,
    maxContextTokens: 1000000,
    maxWorkspaceCount: 100,
    maxStorageMb: 50000,
    maxParallelTasks: 4,
    priorityLevel: 3,
    allowedModelsJson: DEFAULT_ALLOWED_MODELS,
    featuresJson: ["Higher context", "More workspaces", "Priority model access"],
    isActive: true,
    sortOrder: 30,
  },
  {
    id: "plan_pro_plus",
    name: "Meldex Pro+",
    slug: "meldex-pro-plus",
    description: "Highest limits for power users and teams.",
    priceMonthly: 9900,
    priceYearly: 99000,
    currency: "USD",
    monthlyCredits: 200000,
    weeklyCredits: 50000,
    fiveHourCredits: 10000,
    maxContextTokens: 2000000,
    maxWorkspaceCount: 500,
    maxStorageMb: 200000,
    maxParallelTasks: 8,
    priorityLevel: 4,
    allowedModelsJson: DEFAULT_ALLOWED_MODELS,
    featuresJson: ["Maximum credits", "Largest context", "Top priority"],
    isActive: true,
    sortOrder: 40,
  },
];

export type UsageSummary = Awaited<ReturnType<typeof getUserPlanLimits>>;

export type CreditCalculationInput = {
  model?: string;
  provider?: string;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  cachedTokens?: number;
  toolCalls?: number;
  fileReads?: number;
  fileWrites?: number;
  previewRuns?: number;
  memoryReads?: number;
  memoryWrites?: number;
  retries?: number;
  autofixes?: number;
};

function startOfMonth(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

function addMonths(date: Date, months: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1, 0, 0, 0, 0));
}

function startOfWeek(now: Date) {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function fiveHourStart(now: Date) {
  const hour = Math.floor(now.getUTCHours() / 5) * 5;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, 0, 0, 0));
}

function addHours(date: Date, hours: number) {
  const next = new Date(date);
  next.setUTCHours(next.getUTCHours() + hours);
  return next;
}

function windowBounds(type: UsageWindowType, now = new Date()) {
  if (type === UsageWindowType.FIVE_HOUR) {
    const startsAt = fiveHourStart(now);
    const endsAt = addHours(startsAt, 5);
    return { startsAt, endsAt, resetAt: endsAt };
  }
  if (type === UsageWindowType.WEEKLY) {
    const startsAt = startOfWeek(now);
    const endsAt = addDays(startsAt, 7);
    return { startsAt, endsAt, resetAt: endsAt };
  }
  const startsAt = startOfMonth(now);
  const endsAt = addMonths(startsAt, 1);
  return { startsAt, endsAt, resetAt: endsAt };
}

function limitFor(plan: Plan, type: UsageWindowType) {
  if (type === UsageWindowType.FIVE_HOUR) return plan.fiveHourCredits;
  if (type === UsageWindowType.WEEKLY) return plan.weeklyCredits;
  return plan.monthlyCredits;
}

export function estimateCredits(input: { prompt?: string; filesChanged?: number; modelTokens?: number }) {
  if (input.modelTokens && input.modelTokens > 0) return Math.max(1, Math.ceil(input.modelTokens / 1000));
  const promptCredits = Math.ceil((input.prompt || "").length / 120);
  const fileCredits = (input.filesChanged || 0) * 3;
  return Math.max(5, promptCredits + fileCredits + 10);
}

export async function seedDefaultModelUsageConfigs({ overwrite = false } = {}) {
  const data = {
    provider: "openrouter",
    model: "qwen/qwen3-coder-30b-a3b-instruct",
    inputCreditMultiplier: 1,
    outputCreditMultiplier: 2,
    reasoningCreditMultiplier: 3,
    cachedCreditMultiplier: 0.25,
    toolCallCreditCost: 1,
    previewCreditCost: 2,
    fileReadCreditCost: 0.2,
    fileWriteCreditCost: 1,
    memoryReadCreditCost: 0.2,
    memoryWriteCreditCost: 0.5,
    fallbackEstimateCredits: 15,
    retryMultiplier: 1.25,
    autofixMultiplier: 1.5,
    isActive: true,
  };
  return prisma.modelUsageConfig.upsert({
    where: { provider_model: { provider: data.provider, model: data.model } },
    update: overwrite ? data : { isActive: true },
    create: { id: "model_usage_openrouter_qwen3_coder", ...data },
  });
}

export async function listModelUsageConfigs() {
  await seedDefaultModelUsageConfigs();
  return prisma.modelUsageConfig.findMany({ orderBy: [{ provider: "asc" }, { model: "asc" }] });
}

export async function getModelUsageConfig(provider = "openrouter", model?: string) {
  await seedDefaultModelUsageConfigs();
  const targetModel = model || await getConfig("OPENROUTER_MODEL") || "qwen/qwen3-coder-30b-a3b-instruct";
  return (await prisma.modelUsageConfig.findFirst({
    where: { provider, model: targetModel, isActive: true },
  })) || (await prisma.modelUsageConfig.findFirst({
    where: { provider, isActive: true },
    orderBy: { createdAt: "asc" },
  })) || seedDefaultModelUsageConfigs();
}

export async function calculateCredits(input: CreditCalculationInput) {
  const config = await getModelUsageConfig(input.provider || "openrouter", input.model);
  const tokenCredits =
    ((input.inputTokens || 0) / 1000) * config.inputCreditMultiplier +
    ((input.outputTokens || 0) / 1000) * config.outputCreditMultiplier +
    ((input.reasoningTokens || 0) / 1000) * config.reasoningCreditMultiplier +
    ((input.cachedTokens || 0) / 1000) * config.cachedCreditMultiplier;
  const toolCredits =
    (input.toolCalls || 0) * config.toolCallCreditCost +
    (input.previewRuns || 0) * config.previewCreditCost +
    (input.fileReads || 0) * config.fileReadCreditCost +
    (input.fileWrites || 0) * config.fileWriteCreditCost +
    (input.memoryReads || 0) * config.memoryReadCreditCost +
    (input.memoryWrites || 0) * config.memoryWriteCreditCost;
  const retryCredits = (input.retries || 0) * config.retryMultiplier;
  const autofixCredits = (input.autofixes || 0) * config.autofixMultiplier;
  const raw = tokenCredits + toolCredits + retryCredits + autofixCredits;
  return {
    credits: Math.max(1, Math.ceil(raw || config.fallbackEstimateCredits)),
    rawCredits: raw,
    config,
    breakdown: {
      tokenCredits,
      toolCredits,
      retryCredits,
      autofixCredits,
      input,
    },
  };
}

export function usageFromCompletion(usage?: CompletionUsage | null) {
  return {
    inputTokens: usage?.inputTokens || 0,
    outputTokens: usage?.outputTokens || 0,
    reasoningTokens: usage?.reasoningTokens || 0,
    cachedTokens: usage?.cachedTokens || 0,
    estimated: usage?.estimated ?? true,
  };
}

export async function getActiveGenerationModel() {
  return {
    provider: "openrouter",
    model: await getConfig("OPENROUTER_MODEL") || "qwen/qwen3-coder-30b-a3b-instruct",
  };
}

export async function seedDefaultPlans({ overwrite = false } = {}) {
  const plans = [];
  for (const plan of DEFAULT_PLANS) {
    const saved = await prisma.plan.upsert({
      where: { slug: plan.slug },
      update: overwrite ? { ...plan, id: undefined } : { name: plan.name, description: plan.description, updatedAt: new Date() },
      create: plan,
    });
    plans.push(saved);
  }
  return plans;
}

export async function listPlans() {
  await seedDefaultPlans();
  return prisma.plan.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
}

export async function getActiveUserPlan(userId: string) {
  await seedDefaultPlans();
  const now = new Date();
  const assigned = await prisma.userPlan.findFirst({
    where: {
      userId,
      status: UserPlanStatus.ACTIVE,
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      plan: { isActive: true },
    },
    include: { plan: true },
    orderBy: { createdAt: "desc" },
  });
  if (assigned) return { userPlan: assigned, plan: assigned.plan };
  const plan = await prisma.plan.findUnique({ where: { slug: "free" } });
  if (!plan) throw new Error("Default Free plan is not configured");
  const userPlan = await prisma.userPlan.create({
    data: { userId, planId: plan.id, status: UserPlanStatus.ACTIVE, assignedByAdmin: false },
    include: { plan: true },
  });
  return { userPlan, plan: userPlan.plan };
}

export async function ensureUsageWindow(userId: string, plan: Plan, type: UsageWindowType) {
  const bounds = windowBounds(type);
  return prisma.usageWindow.upsert({
    where: {
      userId_windowType_startsAt: {
        userId,
        windowType: type,
        startsAt: bounds.startsAt,
      },
    },
    update: { creditsLimit: limitFor(plan, type), planId: plan.id, endsAt: bounds.endsAt, resetAt: bounds.resetAt },
    create: {
      userId,
      planId: plan.id,
      windowType: type,
      creditsUsed: 0,
      creditsLimit: limitFor(plan, type),
      startsAt: bounds.startsAt,
      endsAt: bounds.endsAt,
      resetAt: bounds.resetAt,
    },
  });
}

export async function getUserPlanLimits(userId: string) {
  const { userPlan, plan } = await getActiveUserPlan(userId);
  const windows = await Promise.all([
    ensureUsageWindow(userId, plan, UsageWindowType.FIVE_HOUR),
    ensureUsageWindow(userId, plan, UsageWindowType.WEEKLY),
    ensureUsageWindow(userId, plan, UsageWindowType.MONTHLY),
  ]);
  const byType = Object.fromEntries(windows.map((window) => [window.windowType, window]));
  return {
    plan,
    userPlan,
    windows: byType as Record<UsageWindowType, (typeof windows)[number]>,
    allowedModels: Array.isArray(plan.allowedModelsJson) ? plan.allowedModelsJson : [],
    features: Array.isArray(plan.featuresJson) ? plan.featuresJson : [],
  };
}

export async function checkUserCreditLimit(userId: string, estimatedCredits: number) {
  const summary = await getUserPlanLimits(userId);
  const checks = [
    summary.windows.FIVE_HOUR,
    summary.windows.WEEKLY,
    summary.windows.MONTHLY,
  ];
  const exceeded = checks.find((window) => window.creditsUsed + estimatedCredits > window.creditsLimit);
  if (!exceeded) return { ok: true as const, summary, estimatedCredits };
  return {
    ok: false as const,
    code: "LIMIT_EXCEEDED",
    message: "You’ve reached your Meldex usage limit. Upgrade to Meldex Plus/Pro to continue.",
    windowType: exceeded.windowType,
    creditsUsed: exceeded.creditsUsed,
    creditsLimit: exceeded.creditsLimit,
    estimatedCredits,
    summary,
  };
}

export async function precheckUserAiRequest(input: { userId: string; estimatedCredits: number; model?: string; provider?: string; estimatedContextTokens?: number }) {
  const summary = await getUserPlanLimits(input.userId);
  const model = input.model || (await getActiveGenerationModel()).model;
  const allowed = summary.allowedModels.map(String);
  if (allowed.length && !allowed.includes(model)) {
    return {
      ok: false as const,
      code: "MODEL_NOT_ALLOWED",
      message: "This model is not available on your current Meldex plan.",
      model,
      summary,
    };
  }
  if ((input.estimatedContextTokens || 0) > summary.plan.maxContextTokens) {
    return {
      ok: false as const,
      code: "CONTEXT_TOO_LARGE",
      message: "This request is larger than your current Meldex context limit.",
      model,
      maxContextTokens: summary.plan.maxContextTokens,
      estimatedContextTokens: input.estimatedContextTokens || 0,
      summary,
    };
  }
  const credit = await checkUserCreditLimit(input.userId, input.estimatedCredits);
  if (!credit.ok) return credit;
  return { ok: true as const, summary, model, estimatedCredits: input.estimatedCredits };
}

export async function recordCreditUsage(userId: string, credits: number, metadata: Record<string, unknown> = {}) {
  const summary = await getUserPlanLimits(userId);
  const windows = Object.values(summary.windows);
  await prisma.$transaction([
    ...windows.map((window) => prisma.usageWindow.update({
      where: { id: window.id },
      data: { creditsUsed: { increment: credits }, creditsLimit: limitFor(summary.plan, window.windowType) },
    })),
    prisma.creditTransaction.create({
      data: {
        userId,
        planId: summary.plan.id,
        type: CreditTransactionType.USAGE,
        credits,
        reason: "AI generation usage",
        metadataJson: metadata as Prisma.InputJsonValue,
      },
    }),
  ]);
  return getUserPlanLimits(userId);
}

export async function recordAiCreditUsage(input: {
  userId: string;
  credits: number;
  provider?: string;
  model?: string;
  metadata?: Record<string, unknown>;
}) {
  const summary = await getUserPlanLimits(input.userId);
  const windows = Object.values(summary.windows);
  await prisma.$transaction([
    ...windows.map((window) => prisma.usageWindow.update({
      where: { id: window.id },
      data: { creditsUsed: { increment: input.credits }, creditsLimit: limitFor(summary.plan, window.windowType) },
    })),
    prisma.creditTransaction.create({
      data: {
        userId: input.userId,
        planId: summary.plan.id,
        type: CreditTransactionType.USAGE,
        credits: input.credits,
        reason: "AI generation usage",
        metadataJson: {
          provider: input.provider,
          model: input.model,
          ...(input.metadata || {}),
        } as Prisma.InputJsonValue,
      },
    }),
  ]);
  return getUserPlanLimits(input.userId);
}

export async function assignUserPlan(input: { userId: string; planId: string; assignedByAdmin?: boolean; endsAt?: Date | null }) {
  const plan = await prisma.plan.findUnique({ where: { id: input.planId } });
  if (!plan) throw new Error("Plan not found");
  await prisma.userPlan.updateMany({ where: { userId: input.userId, status: UserPlanStatus.ACTIVE }, data: { status: UserPlanStatus.CANCELED } });
  return prisma.userPlan.create({
    data: {
      userId: input.userId,
      planId: plan.id,
      status: UserPlanStatus.ACTIVE,
      assignedByAdmin: Boolean(input.assignedByAdmin),
      endsAt: input.endsAt ?? null,
    },
    include: { plan: true },
  });
}

export async function grantExtraCredits(userId: string, credits: number, reason = "Admin credit grant") {
  if (credits <= 0) throw new Error("Credits must be greater than zero");
  const summary = await getUserPlanLimits(userId);
  const windows = Object.values(summary.windows);
  await prisma.$transaction([
    ...windows.map((window) => prisma.usageWindow.update({ where: { id: window.id }, data: { creditsLimit: { increment: credits } } })),
    prisma.creditTransaction.create({
      data: { userId, planId: summary.plan.id, type: CreditTransactionType.GRANT, credits, reason },
    }),
  ]);
  return getUserPlanLimits(userId);
}

export async function resetUserUsage(userId: string, reason = "Admin usage reset") {
  const summary = await getUserPlanLimits(userId);
  await prisma.$transaction([
    prisma.usageWindow.updateMany({ where: { userId }, data: { creditsUsed: 0 } }),
    prisma.creditTransaction.create({
      data: { userId, planId: summary.plan.id, type: CreditTransactionType.RESET, credits: 0, reason },
    }),
  ]);
  return getUserPlanLimits(userId);
}
