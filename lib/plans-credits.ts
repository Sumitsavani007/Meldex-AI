import { CreditTransactionType, Prisma, UsageWindowType, UserPlanStatus, type Plan } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/runtime-config";
import type { CompletionUsage } from "@/lib/model-router";
import { createNotification } from "@/lib/notifications";

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
    maxWorkspaceCount: 25,
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

export type StudioCreditEstimateInput = {
  kind: "image" | "video" | "audio" | "voice";
  provider?: string;
  model?: string;
  width?: number;
  height?: number;
  imageCount?: number;
  referenceImages?: number;
  advancedSettings?: number;
  durationSec?: number;
  fps?: number;
  aspectRatio?: string;
  upscaling?: boolean;
  audio?: boolean;
};

export type PlanLimitType =
  | "five_hour_credits"
  | "weekly_credits"
  | "monthly_credits"
  | "model"
  | "context"
  | "workspace_count"
  | "storage"
  | "parallel_tasks";

export const FEATURE_FLAGS = [
  { key: "workspace", name: "Workspace", category: "workspace", description: "Open and use Meldex workspaces.", minimumPriority: 1 },
  { key: "ide", name: "IDE", category: "workspace", description: "Open the native Meldex IDE.", minimumPriority: 2 },
  { key: "vscode_extension", name: "VS Code Extension", category: "extension", description: "Use Meldex from the VS Code extension.", minimumPriority: 2 },
  { key: "chat", name: "Chat", category: "ai", description: "Use Meldex chat.", minimumPriority: 1 },
  { key: "agent_runs", name: "Agent Runs", category: "ai", description: "Run the AI coding agent.", minimumPriority: 1 },
  { key: "pro_models", name: "Pro Models", category: "ai", description: "Use premium/pro model selections.", minimumPriority: 3 },
  { key: "memory", name: "Context Memory", category: "ai", description: "Read, write, and edit workspace memory.", minimumPriority: 2 },
  { key: "preview_runtime", name: "Preview Runtime", category: "workspace", description: "Start, verify, and refresh previews.", minimumPriority: 1 },
  { key: "download_project", name: "Download Project", category: "workspace", description: "Export a workspace as a ZIP.", minimumPriority: 2 },
  { key: "deploy", name: "Deploy", category: "deployment", description: "Deploy generated projects.", minimumPriority: 3 },
  { key: "parallel_tasks", name: "Parallel Tasks", category: "limits", description: "Run parallel AI tasks.", minimumPriority: 2 },
  { key: "storage", name: "Storage", category: "limits", description: "Use plan storage allocation.", minimumPriority: 1 },
  { key: "api_access", name: "API Access", category: "api", description: "Use API and token access.", minimumPriority: 2 },
  { key: "benchmark", name: "Benchmark", category: "api", description: "Run Meldex benchmarks.", minimumPriority: 3 },
  { key: "team_features", name: "Team Features", category: "team", description: "Use team collaboration features.", minimumPriority: 4 },
] as const;

export type FeatureKey = typeof FEATURE_FLAGS[number]["key"];

export type PlanLimitError = {
  ok: false;
  code: "PLAN_LIMIT_EXCEEDED";
  limitType: PlanLimitType;
  message: string;
  currentUsage: number;
  limit: number;
  resetAt?: Date | string | null;
  recommendedPlan?: { id: string; name: string; slug: string } | null;
  legacyCode?: string;
};

export type FeatureAccessResult =
  | { ok: true; featureKey: FeatureKey; enabled: true; source: "override" | "plan" | "default"; plan: Plan; limitInt?: number | null }
  | { ok: false; code: "FEATURE_NOT_ALLOWED"; featureKey: FeatureKey; message: string; currentUsage: 0; limit: 0; recommendedPlan?: { id: string; name: string; slug: string } | null; plan: Plan };

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
    estimatedCostPerCreditCents: 0,
    isActive: true,
  };
  return prisma.modelUsageConfig.upsert({
    where: { provider_model: { provider: data.provider, model: data.model } },
    update: overwrite ? data : { isActive: true },
    create: { id: "model_usage_openrouter_qwen3_coder", ...data },
  });
}

export async function seedDefaultStudioUsageConfigs({ overwrite = false } = {}) {
  const configs = [
    {
      id: "model_usage_comfy_cloud_flux_schnell",
      provider: "comfy_cloud",
      model: "FLUX.1 Schnell",
      inputCreditMultiplier: 1,
      outputCreditMultiplier: 2,
      reasoningCreditMultiplier: 0,
      cachedCreditMultiplier: 0,
      toolCallCreditCost: 3,
      previewCreditCost: 1,
      fileReadCreditCost: 2,
      fileWriteCreditCost: 0,
      memoryReadCreditCost: 1,
      memoryWriteCreditCost: 0,
      fallbackEstimateCredits: 12,
      retryMultiplier: 1,
      autofixMultiplier: 1,
      estimatedCostPerCreditCents: 0,
      isActive: true,
    },
    {
      id: "model_usage_comfy_cloud_wan2",
      provider: "comfy_cloud",
      model: "Wan 2.x",
      inputCreditMultiplier: 1,
      outputCreditMultiplier: 4,
      reasoningCreditMultiplier: 0,
      cachedCreditMultiplier: 0,
      toolCallCreditCost: 4,
      previewCreditCost: 5,
      fileReadCreditCost: 3,
      fileWriteCreditCost: 0,
      memoryReadCreditCost: 2,
      memoryWriteCreditCost: 0,
      fallbackEstimateCredits: 48,
      retryMultiplier: 1,
      autofixMultiplier: 1,
      estimatedCostPerCreditCents: 0,
      isActive: true,
    },
  ];
  return Promise.all(configs.map((config) => prisma.modelUsageConfig.upsert({
    where: { provider_model: { provider: config.provider, model: config.model } },
    update: overwrite ? config : { isActive: true },
    create: config,
  })));
}

export async function seedDefaultFeatureFlags() {
  const plans = await listPlans();
  const flags = [];
  for (const feature of FEATURE_FLAGS) {
    const flag = await prisma.featureFlag.upsert({
      where: { key: feature.key },
      update: { name: feature.name, description: feature.description, category: feature.category, isActive: true },
      create: {
        key: feature.key,
        name: feature.name,
        description: feature.description,
        category: feature.category,
        isActive: true,
        defaultEnabled: feature.minimumPriority <= 1,
      },
    });
    flags.push(flag);
    for (const plan of plans) {
      await prisma.planFeature.upsert({
        where: { planId_featureId: { planId: plan.id, featureId: flag.id } },
        update: {},
        create: {
          planId: plan.id,
          featureId: flag.id,
          enabled: plan.priorityLevel >= feature.minimumPriority,
          limitInt:
            feature.key === "parallel_tasks" ? plan.maxParallelTasks :
            feature.key === "storage" ? plan.maxStorageMb :
            feature.key === "workspace" ? plan.maxWorkspaceCount :
            feature.key === "pro_models" ? plan.maxContextTokens :
            null,
        },
      });
    }
  }
  return flags;
}

export async function listPlanFeatures() {
  await seedDefaultFeatureFlags();
  return prisma.featureFlag.findMany({
    include: { planFeatures: { include: { plan: true } } },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
}

export async function listModelUsageConfigs() {
  await seedDefaultModelUsageConfigs();
  await seedDefaultStudioUsageConfigs();
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

function megapixels(width = 1024, height = 1024) {
  return Math.max(0.25, (width * height) / 1_000_000);
}

export async function calculateStudioCredits(input: StudioCreditEstimateInput) {
  await seedDefaultStudioUsageConfigs();
  const model = input.model || (input.kind === "video" ? "Wan 2.x" : "FLUX.1 Schnell");
  const provider = input.provider || "comfy_cloud";
  const config = await getModelUsageConfig(provider, model);
  const count = Math.max(1, input.imageCount || 1);
  const resolutionUnits = megapixels(input.width, input.height);
  const resolutionCredits = Math.ceil(resolutionUnits * config.outputCreditMultiplier * count);
  const referenceCredits = Math.ceil((input.referenceImages || 0) * config.fileReadCreditCost);
  const advancedCredits = Math.ceil((input.advancedSettings || 0) * config.memoryReadCreditCost);
  const durationCredits = input.kind === "video" ? Math.ceil((input.durationSec || 5) * config.previewCreditCost) : 0;
  const fpsCredits = input.kind === "video" ? Math.ceil(((input.fps || 24) / 24) * config.toolCallCreditCost) : 0;
  const upscaleCredits = input.upscaling ? Math.ceil(config.autofixMultiplier * config.fallbackEstimateCredits) : 0;
  const audioCredits = input.audio ? Math.ceil(config.retryMultiplier * config.toolCallCreditCost) : 0;
  const raw = (config.fallbackEstimateCredits * count) + resolutionCredits + referenceCredits + advancedCredits + durationCredits + fpsCredits + upscaleCredits + audioCredits;
  const queueSeconds = Math.max(10, Math.ceil((input.kind === "video" ? (input.durationSec || 5) * 18 : 25) / Math.max(1, config.retryMultiplier)));
  const processingSeconds = input.kind === "video" ? Math.max(60, (input.durationSec || 5) * 24) : 35;
  return {
    credits: Math.max(1, Math.ceil(raw)),
    provider,
    model,
    queueSeconds,
    processingSeconds,
    config,
    breakdown: {
      baseCredits: config.fallbackEstimateCredits * count,
      resolutionCredits,
      referenceCredits,
      advancedCredits,
      durationCredits,
      fpsCredits,
      upscaleCredits,
      audioCredits,
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

export async function getUserCreditBalance(userId: string) {
  const summary = await getUserPlanLimits(userId);
  const monthly = summary.windows.MONTHLY;
  const monthlyRemaining = Math.max(0, monthly.creditsLimit - monthly.creditsUsed);
  const transactions = await prisma.creditTransaction.findMany({
    where: { userId },
    select: { type: true, credits: true, metadataJson: true },
  });
  let purchasedIn = 0;
  let purchasedUsed = 0;
  for (const tx of transactions) {
    const meta = (tx.metadataJson || {}) as Record<string, unknown>;
    const bucket = String(meta.creditBucket || meta.bucket || "");
    if ((tx.type === CreditTransactionType.GRANT || tx.type === CreditTransactionType.ADMIN_ADJUSTMENT || tx.type === CreditTransactionType.REFUND) && ["purchased", "bonus", "payg"].includes(bucket)) {
      purchasedIn += tx.credits;
    }
    if (tx.type === CreditTransactionType.USAGE) {
      purchasedUsed += Number(meta.purchasedCreditsUsed || 0);
    }
  }
  const purchasedCredits = Math.max(0, purchasedIn - purchasedUsed);
  return {
    ...summary,
    balance: {
      monthlyCredits: monthly.creditsLimit,
      usedCredits: monthly.creditsUsed,
      monthlyRemaining,
      purchasedCredits,
      totalRemaining: monthlyRemaining + purchasedCredits,
      estimatedRemainingGenerations: 0,
    },
  };
}

export async function precheckStudioCreditRequest(input: { userId: string; estimate: Awaited<ReturnType<typeof calculateStudioCredits>> }) {
  const summary = await getUserCreditBalance(input.userId);
  if (summary.balance.totalRemaining >= input.estimate.credits) {
    return { ok: true as const, summary, estimate: input.estimate };
  }
  return planLimitError({
    summary,
    limitType: "monthly_credits",
    message: "Not enough credits.",
    currentUsage: input.estimate.credits,
    limit: summary.balance.totalRemaining,
    resetAt: summary.windows.MONTHLY.resetAt,
    legacyCode: "INSUFFICIENT_CREDITS",
  });
}

async function recommendPlan(currentPriority: number, limitType: PlanLimitType, needed?: number) {
  const plans = await listPlans();
  return plans.find((plan) => {
    if (!plan.isActive || plan.priorityLevel <= currentPriority) return false;
    if (limitType === "workspace_count") return plan.maxWorkspaceCount >= (needed || 0);
    if (limitType === "storage") return plan.maxStorageMb >= (needed || 0);
    if (limitType === "parallel_tasks") return plan.maxParallelTasks >= (needed || 0);
    if (limitType === "context") return plan.maxContextTokens >= (needed || 0);
    return true;
  }) || plans.find((plan) => plan.isActive && plan.priorityLevel > currentPriority) || null;
}

async function recommendPlanForFeature(currentPriority: number, featureKey: FeatureKey) {
  const plans = await listPlans();
  const feature = await prisma.featureFlag.findUnique({ where: { key: featureKey } });
  if (!feature) return plans.find((plan) => plan.isActive && plan.priorityLevel > currentPriority) || null;
  const matches = await prisma.planFeature.findMany({
    where: { featureId: feature.id, enabled: true, plan: { isActive: true, priorityLevel: { gt: currentPriority } } },
    include: { plan: true },
  });
  return matches.sort((a, b) => a.plan.priorityLevel - b.plan.priorityLevel)[0]?.plan || plans.find((plan) => plan.isActive && plan.priorityLevel > currentPriority) || null;
}

export async function canUseFeature(userId: string, featureKey: FeatureKey): Promise<FeatureAccessResult> {
  await seedDefaultFeatureFlags();
  const summary = await getUserPlanLimits(userId);
  const feature = await prisma.featureFlag.findUnique({
    where: { key: featureKey },
    include: {
      planFeatures: { where: { planId: summary.plan.id } },
      userOverrides: {
        where: {
          userId,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        take: 1,
      },
    },
  });
  if (!feature || !feature.isActive) {
    return {
      ok: false,
      code: "FEATURE_NOT_ALLOWED",
      featureKey,
      message: "This feature is not available right now.",
      currentUsage: 0,
      limit: 0,
      recommendedPlan: null,
      plan: summary.plan,
    };
  }
  const override = feature.userOverrides[0];
  if (override) {
    if (override.enabled) return { ok: true, featureKey, enabled: true, source: "override", plan: summary.plan, limitInt: null };
    return {
      ok: false,
      code: "FEATURE_NOT_ALLOWED",
      featureKey,
      message: `${feature.name} is disabled for your account.`,
      currentUsage: 0,
      limit: 0,
      recommendedPlan: await recommendPlanForFeature(summary.plan.priorityLevel, featureKey),
      plan: summary.plan,
    };
  }
  const planFeature = feature.planFeatures[0];
  const enabled = planFeature ? planFeature.enabled : feature.defaultEnabled;
  if (enabled) return { ok: true, featureKey, enabled: true, source: planFeature ? "plan" : "default", plan: summary.plan, limitInt: planFeature?.limitInt ?? null };
  return {
    ok: false,
    code: "FEATURE_NOT_ALLOWED",
    featureKey,
    message: `${feature.name} is not included in your current Meldex plan.`,
    currentUsage: 0,
    limit: 0,
    recommendedPlan: await recommendPlanForFeature(summary.plan.priorityLevel, featureKey),
    plan: summary.plan,
  };
}

export function featureBlockedResponse(result: Extract<FeatureAccessResult, { ok: false }>) {
  return {
    error: result.message,
    code: result.code,
    limitType: "feature",
    featureKey: result.featureKey,
    currentUsage: result.currentUsage,
    limit: result.limit,
    recommendedPlan: result.recommendedPlan,
  };
}

async function planLimitError(input: {
  summary: UsageSummary;
  limitType: PlanLimitType;
  message: string;
  currentUsage: number;
  limit: number;
  resetAt?: Date | string | null;
  needed?: number;
  legacyCode?: string;
}): Promise<PlanLimitError> {
  const recommended = await recommendPlan(input.summary.plan.priorityLevel, input.limitType, input.needed);
  return {
    ok: false,
    code: "PLAN_LIMIT_EXCEEDED",
    limitType: input.limitType,
    message: input.message,
    currentUsage: input.currentUsage,
    limit: input.limit,
    resetAt: input.resetAt,
    recommendedPlan: recommended ? { id: recommended.id, name: recommended.name, slug: recommended.slug } : null,
    legacyCode: input.legacyCode,
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
  const limitType = exceeded.windowType === UsageWindowType.FIVE_HOUR ? "five_hour_credits" : exceeded.windowType === UsageWindowType.WEEKLY ? "weekly_credits" : "monthly_credits";
  return planLimitError({
    summary,
    limitType,
    message: exceeded.windowType === UsageWindowType.FIVE_HOUR ? "You’ve reached your 5-hour limit." : "You’ve reached your Meldex credit limit.",
    currentUsage: exceeded.creditsUsed + estimatedCredits,
    limit: exceeded.creditsLimit,
    resetAt: exceeded.resetAt,
    legacyCode: "LIMIT_EXCEEDED",
  });
}

export async function precheckUserAiRequest(input: { userId: string; estimatedCredits: number; model?: string; provider?: string; estimatedContextTokens?: number }) {
  const summary = await getUserPlanLimits(input.userId);
  const model = input.model || (await getActiveGenerationModel()).model;
  if (!DEFAULT_ALLOWED_MODELS.includes(model)) {
    const proModelGate = await canUseFeature(input.userId, "pro_models");
    if (!proModelGate.ok) {
      return planLimitError({
        summary,
        limitType: "model",
        message: "Pro model access is not included in your current Meldex plan.",
        currentUsage: 1,
        limit: 0,
        legacyCode: "MODEL_NOT_ALLOWED",
      });
    }
  }
  const allowed = summary.allowedModels.map(String);
  if (allowed.length && !allowed.includes(model)) {
    return planLimitError({
      summary,
      limitType: "model",
      message: "This model is not available on your current Meldex plan.",
      currentUsage: 1,
      limit: 0,
      legacyCode: "MODEL_NOT_ALLOWED",
    });
  }
  if ((input.estimatedContextTokens || 0) > summary.plan.maxContextTokens) {
    return planLimitError({
      summary,
      limitType: "context",
      message: "This request is larger than your current Meldex context limit.",
      currentUsage: input.estimatedContextTokens || 0,
      limit: summary.plan.maxContextTokens,
      needed: input.estimatedContextTokens || 0,
      legacyCode: "CONTEXT_TOO_LARGE",
    });
  }
  const credit = await checkUserCreditLimit(input.userId, input.estimatedCredits);
  if (!credit.ok) return credit;
  return { ok: true as const, summary, model, estimatedCredits: input.estimatedCredits };
}

export async function checkWorkspaceCreateLimit(userId: string) {
  const feature = await canUseFeature(userId, "workspace");
  if (!feature.ok) return feature;
  const summary = await getUserPlanLimits(userId);
  const currentUsage = await prisma.workspaceProject.count({ where: { userId, deletedAt: null } });
  const limit = typeof feature.limitInt === "number" ? feature.limitInt : summary.plan.maxWorkspaceCount;
  if (currentUsage < limit) return { ok: true as const, summary, currentUsage };
  return planLimitError({
    summary,
    limitType: "workspace_count",
    message: "You’ve reached your workspace limit.",
    currentUsage,
    limit,
    needed: currentUsage + 1,
  });
}

export async function checkParallelTaskLimit(userId: string) {
  const feature = await canUseFeature(userId, "parallel_tasks");
  if (!feature.ok) return feature;
  const summary = await getUserPlanLimits(userId);
  const currentUsage = await prisma.workspaceTask.count({ where: { userId, status: { in: ["QUEUED", "RUNNING"] } } });
  const limit = typeof feature.limitInt === "number" ? feature.limitInt : summary.plan.maxParallelTasks;
  if (currentUsage < limit) return { ok: true as const, summary, currentUsage };
  return planLimitError({
    summary,
    limitType: "parallel_tasks",
    message: "You’ve reached your parallel task limit.",
    currentUsage,
    limit,
    needed: currentUsage + 1,
  });
}

export async function checkStorageLimit(userId: string, additionalBytes = 0) {
  const feature = await canUseFeature(userId, "storage");
  if (!feature.ok) return feature;
  const summary = await getUserPlanLimits(userId);
  const aggregate = await prisma.workspaceFile.aggregate({
    where: { userId, deletedAt: null },
    _sum: { sizeBytes: true },
  });
  const currentBytes = (aggregate._sum.sizeBytes || 0) + additionalBytes;
  const currentMb = Math.ceil(currentBytes / 1024 / 1024);
  const limit = typeof feature.limitInt === "number" ? feature.limitInt : summary.plan.maxStorageMb;
  if (currentMb <= limit) return { ok: true as const, summary, currentUsage: currentMb };
  return planLimitError({
    summary,
    limitType: "storage",
    message: "You’ve reached your workspace storage limit.",
    currentUsage: currentMb,
    limit,
    needed: currentMb,
  });
}

export async function createUserNotification(input: {
  userId: string;
  type: string;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  const legacy = await prisma.userNotification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      metadata: (input.metadata || {}) as Prisma.InputJsonValue,
    },
  });
  await createNotification({
    userId: input.userId,
    type: normalizeNotificationType(input.type),
    title: input.title,
    message: input.message,
    metadata: input.metadata,
    dedupeWindowMinutes: 30,
  }).catch(() => undefined);
  return legacy;
}

function normalizeNotificationType(type: string) {
  if (type === "credits_granted") return "admin_credit_grant";
  if (type === "usage_reset") return "admin_credit_grant";
  if (type === "plan_limit_reached") return "credits_exhausted";
  if (type === "upgrade_requested") return "plan_changed";
  return type;
}

async function notifyUsageThresholds(userId: string, windows: Array<{ windowType: UsageWindowType; creditsUsed: number; creditsLimit: number; resetAt: Date | null }>) {
  for (const window of windows) {
    if (!window.creditsLimit) continue;
    const ratio = window.creditsUsed / window.creditsLimit;
    const windowLabel = window.windowType === UsageWindowType.FIVE_HOUR ? "5-hour" : window.windowType === UsageWindowType.WEEKLY ? "weekly" : "monthly";
    if (ratio >= 1) {
      const type = window.windowType === UsageWindowType.FIVE_HOUR ? "five_hour_limit_reached" : window.windowType === UsageWindowType.WEEKLY ? "weekly_limit_reached" : "monthly_limit_reached";
      await createNotification({
        userId,
        type,
        actionUrl: "/settings/usage",
        variables: { window: windowLabel, percentUsed: 100, resetAt: window.resetAt?.toISOString() || "" },
        metadata: { windowType: window.windowType, creditsUsed: window.creditsUsed, creditsLimit: window.creditsLimit, resetAt: window.resetAt },
        dedupeWindowMinutes: 60,
      }).catch(() => undefined);
    } else if (ratio >= 0.8) {
      await createNotification({
        userId,
        type: "credits_low",
        actionUrl: "/settings/usage",
        variables: { window: windowLabel, percentUsed: Math.round(ratio * 100), resetAt: window.resetAt?.toISOString() || "" },
        metadata: { windowType: window.windowType, creditsUsed: window.creditsUsed, creditsLimit: window.creditsLimit, resetAt: window.resetAt },
        dedupeWindowMinutes: 60,
      }).catch(() => undefined);
    }
  }
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
  const updated = await prisma.usageWindow.findMany({ where: { userId, id: { in: windows.map((window) => window.id) } } });
  await notifyUsageThresholds(userId, updated);
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
  const updated = await prisma.usageWindow.findMany({ where: { userId: input.userId, id: { in: windows.map((window) => window.id) } } });
  await notifyUsageThresholds(input.userId, updated);
  return getUserPlanLimits(input.userId);
}

export async function recordStudioCreditUsage(input: {
  userId: string;
  credits: number;
  provider: string;
  model: string;
  generationId?: string | null;
  projectId?: string | null;
  mediaType: "image" | "video" | "audio" | "voice";
  prompt?: string;
  metadata?: Record<string, unknown>;
}) {
  const summary = await getUserCreditBalance(input.userId);
  const monthlyCreditsUsed = Math.min(summary.balance.monthlyRemaining, input.credits);
  const purchasedCreditsUsed = Math.max(0, input.credits - monthlyCreditsUsed);
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
        reason: `AI Studio ${input.mediaType} generation`,
        metadataJson: {
          provider: input.provider,
          model: input.model,
          generationId: input.generationId,
          projectId: input.projectId,
          mediaType: input.mediaType,
          prompt: input.prompt,
          monthlyCreditsUsed,
          purchasedCreditsUsed,
          ...(input.metadata || {}),
        } as Prisma.InputJsonValue,
      },
    }),
  ]);
  const updated = await prisma.usageWindow.findMany({ where: { userId: input.userId, id: { in: windows.map((window) => window.id) } } });
  await notifyUsageThresholds(input.userId, updated);
  return getUserCreditBalance(input.userId);
}

export async function refundStudioCredits(input: {
  userId: string;
  credits: number;
  provider?: string;
  model?: string;
  generationId?: string | null;
  projectId?: string | null;
  reason?: string;
}) {
  if (input.credits <= 0) return getUserCreditBalance(input.userId);
  const summary = await getUserPlanLimits(input.userId);
  const windows = Object.values(summary.windows);
  await prisma.$transaction([
    ...windows.map((window) => prisma.usageWindow.update({
      where: { id: window.id },
      data: { creditsUsed: { decrement: Math.min(window.creditsUsed, input.credits) } },
    })),
    prisma.creditTransaction.create({
      data: {
        userId: input.userId,
        planId: summary.plan.id,
        type: CreditTransactionType.REFUND,
        credits: input.credits,
        reason: input.reason || "AI Studio generation refund",
        metadataJson: {
          provider: input.provider,
          model: input.model,
          generationId: input.generationId,
          projectId: input.projectId,
          creditBucket: "purchased",
        } as Prisma.InputJsonValue,
      },
    }),
  ]);
  return getUserCreditBalance(input.userId);
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
