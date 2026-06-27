import { NextRequest, NextResponse } from "next/server";
import { CreditTransactionType, InvoiceStatus, SubscriptionStatus, UserPlanStatus } from "@prisma/client";
import { requireAdmin } from "@/lib/role-guard";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RangeKey = "today" | "7d" | "30d" | "month" | "custom";
type JsonRecord = Record<string, unknown>;

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function dateRange(search: URLSearchParams) {
  const range = (search.get("range") || "30d") as RangeKey;
  const now = new Date();
  if (range === "today") return { range, start: startOfToday(), end: now };
  if (range === "7d") return { range, start: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), end: now };
  if (range === "month") return { range, start: new Date(now.getFullYear(), now.getMonth(), 1), end: now };
  if (range === "custom") {
    const start = search.get("start") ? new Date(String(search.get("start"))) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const end = search.get("end") ? new Date(String(search.get("end"))) : now;
    return { range, start, end };
  }
  return { range: "30d" as const, start: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), end: now };
}

function moneyFromCents(cents: number) {
  return Math.round(cents || 0);
}

function metadata(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function numberMeta(meta: JsonRecord, key: string) {
  const value = meta[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stringMeta(meta: JsonRecord, key: string, fallback = "unknown") {
  const value = meta[key];
  return typeof value === "string" && value.trim() ? value : fallback;
}

function toCsv(rows: Array<Record<string, unknown>>) {
  const keys = Array.from(rows.reduce((set, row) => {
    Object.keys(row).forEach((key) => set.add(key));
    return set;
  }, new Set<string>()));
  const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  return [keys.join(","), ...rows.map((row) => keys.map((key) => escape(row[key])).join(","))].join("\n");
}

function csvResponse(name: string, rows: Array<Record<string, unknown>>) {
  return new NextResponse(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const { range, start, end } = dateRange(searchParams);
  const exportType = searchParams.get("export");
  const createdAt = { gte: start, lte: end };

  const [
    users,
    plans,
    activeUserPlans,
    subscriptions,
    invoices,
    paymentEvents,
    creditTransactions,
    usageByUser,
    workspaceCount,
    workspaceFiles,
    taskCounts,
    previewCounts,
    failedPreviews,
    workspaceLogs,
    taskEvents,
    modelConfigs,
  ] = await Promise.all([
    prisma.user.findMany({ select: { id: true, email: true, name: true, createdAt: true } }),
    prisma.plan.findMany({ orderBy: [{ sortOrder: "asc" }, { priorityLevel: "asc" }] }),
    prisma.userPlan.findMany({
      where: { status: UserPlanStatus.ACTIVE, startsAt: { lte: end }, OR: [{ endsAt: null }, { endsAt: { gt: start } }] },
      include: { plan: true, user: { select: { id: true, email: true, name: true } } },
    }),
    prisma.subscription.findMany({
      where: { updatedAt: { lte: end } },
      include: { plan: true, user: { select: { id: true, email: true, name: true } } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.invoice.findMany({ where: { createdAt }, include: { plan: true, user: { select: { id: true, email: true, name: true } }, subscription: true }, orderBy: { createdAt: "desc" } }),
    prisma.paymentEvent.findMany({ where: { createdAt }, include: { user: { select: { id: true, email: true, name: true } } }, orderBy: { createdAt: "desc" } }),
    prisma.creditTransaction.findMany({ where: { createdAt }, include: { user: { select: { id: true, email: true, name: true } }, plan: true }, orderBy: { createdAt: "desc" }, take: 5000 }),
    prisma.creditTransaction.groupBy({ by: ["userId"], where: { createdAt, type: CreditTransactionType.USAGE }, _sum: { credits: true }, _count: { _all: true }, orderBy: { _sum: { credits: "desc" } }, take: 20 }),
    prisma.workspaceProject.count({ where: { createdAt } }),
    prisma.workspaceFile.aggregate({ where: { createdAt }, _sum: { sizeBytes: true }, _count: { _all: true } }),
    prisma.workspaceTask.groupBy({ by: ["status"], where: { createdAt }, _count: { _all: true } }),
    prisma.workspacePreview.aggregate({ where: { createdAt }, _count: { _all: true } }),
    prisma.workspacePreview.count({ where: { createdAt, OR: [{ verified: false }, { status: { in: ["FAILED", "ERROR"] } }] } }),
    prisma.workspaceLog.findMany({ where: { createdAt, OR: [{ level: "error" }, { event: { contains: "provider", mode: "insensitive" } }, { message: { contains: "provider", mode: "insensitive" } }] }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.workspaceTaskEvent.findMany({ where: { createdAt, OR: [{ type: { contains: "error", mode: "insensitive" } }, { type: { contains: "provider", mode: "insensitive" } }, { message: { contains: "provider", mode: "insensitive" } }] }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.modelUsageConfig.findMany({ where: { isActive: true } }),
  ]);

  const paidPlanIds = new Set(plans.filter((plan) => plan.priorityLevel > 1 || plan.priceMonthly > 0 || plan.priceYearly > 0).map((plan) => plan.id));
  const latestPlanByUser = new Map<string, typeof activeUserPlans[number]>();
  for (const userPlan of activeUserPlans) {
    const current = latestPlanByUser.get(userPlan.userId);
    if (!current || userPlan.createdAt > current.createdAt) latestPlanByUser.set(userPlan.userId, userPlan);
  }
  const paidUsers = Array.from(latestPlanByUser.values()).filter((userPlan) => paidPlanIds.has(userPlan.planId)).length;
  const freeUsers = Math.max(0, users.length - paidUsers);

  const activeSubscriptions = subscriptions.filter((sub) => sub.status === SubscriptionStatus.ACTIVE || sub.status === SubscriptionStatus.TRIALING || sub.status === SubscriptionStatus.PAST_DUE);
  const trialUsers = subscriptions.filter((sub) => sub.status === SubscriptionStatus.TRIALING).length;
  const churnedUsers = subscriptions.filter((sub) => (sub.status === SubscriptionStatus.CANCELED || sub.status === SubscriptionStatus.EXPIRED || sub.status === SubscriptionStatus.UNPAID) && sub.updatedAt >= start && sub.updatedAt <= end).length;
  const mrrCents = activeSubscriptions.reduce((sum, sub) => sum + (sub.billingCycle === "YEARLY" ? Math.round((sub.plan.priceYearly || 0) / 12) : sub.plan.priceMonthly || 0), 0);
  const arrCents = mrrCents * 12;
  const grossRevenueCents = invoices.reduce((sum, invoice) => sum + (invoice.status === InvoiceStatus.PAID ? invoice.amount : invoice.status === InvoiceStatus.REFUNDED ? -invoice.amount : 0), 0);
  const failedPayments = invoices.filter((invoice) => invoice.status === InvoiceStatus.FAILED).length + paymentEvents.filter((event) => event.status === "FAILED" || /failed/i.test(event.type)).length;
  const refundsCents = invoices.filter((invoice) => invoice.status === InvoiceStatus.REFUNDED).reduce((sum, invoice) => sum + invoice.amount, 0);

  const revenueByPlanMap = new Map<string, { plan: string; users: number; revenueCents: number; mrrCents: number }>();
  for (const plan of plans) revenueByPlanMap.set(plan.id, { plan: plan.name, users: 0, revenueCents: 0, mrrCents: 0 });
  for (const userPlan of latestPlanByUser.values()) {
    const row = revenueByPlanMap.get(userPlan.planId);
    if (row) row.users += 1;
  }
  for (const invoice of invoices) {
    if (!invoice.planId) continue;
    const row = revenueByPlanMap.get(invoice.planId);
    if (row && invoice.status === InvoiceStatus.PAID) row.revenueCents += invoice.amount;
  }
  for (const sub of activeSubscriptions) {
    const row = revenueByPlanMap.get(sub.planId);
    if (row) row.mrrCents += sub.billingCycle === "YEARLY" ? Math.round((sub.plan.priceYearly || 0) / 12) : sub.plan.priceMonthly || 0;
  }

  const modelConfigByKey = new Map(modelConfigs.map((config) => [`${config.provider}:${config.model}`, config]));
  const modelUsage = new Map<string, { provider: string; model: string; credits: number; inputTokens: number; outputTokens: number; reasoningTokens: number; cachedTokens: number; retries: number; autofixes: number; previewRuns: number; memoryReads: number; memoryWrites: number; tasks: number; estimatedCostCents: number; configuredCost: boolean }>();
  let totalCreditsUsed = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalRetries = 0;
  let totalAutofixes = 0;
  let totalPreviewRuns = 0;
  let totalMemoryReads = 0;
  let totalMemoryWrites = 0;
  for (const tx of creditTransactions.filter((item) => item.type === CreditTransactionType.USAGE)) {
    const meta = metadata(tx.metadataJson);
    const provider = stringMeta(meta, "provider", "unknown");
    const model = stringMeta(meta, "model", "unknown");
    const key = `${provider}:${model}`;
    const row = modelUsage.get(key) || { provider, model, credits: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cachedTokens: 0, retries: 0, autofixes: 0, previewRuns: 0, memoryReads: 0, memoryWrites: 0, tasks: 0, estimatedCostCents: 0, configuredCost: false };
    row.credits += tx.credits;
    row.inputTokens += numberMeta(meta, "inputTokens");
    row.outputTokens += numberMeta(meta, "outputTokens");
    row.reasoningTokens += numberMeta(meta, "reasoningTokens");
    row.cachedTokens += numberMeta(meta, "cachedTokens");
    row.retries += numberMeta(meta, "retries");
    row.autofixes += numberMeta(meta, "autofixes");
    row.previewRuns += numberMeta(meta, "previewRuns");
    row.memoryReads += numberMeta(meta, "memoryReads");
    row.memoryWrites += numberMeta(meta, "memoryWrites");
    row.tasks += 1;
    const config = modelConfigByKey.get(key);
    const costRate = config?.estimatedCostPerCreditCents || 0;
    row.estimatedCostCents += costRate * tx.credits;
    row.configuredCost ||= costRate > 0;
    modelUsage.set(key, row);
    totalCreditsUsed += tx.credits;
    totalInputTokens += row.inputTokens;
    totalOutputTokens += row.outputTokens;
    totalRetries += numberMeta(meta, "retries");
    totalAutofixes += numberMeta(meta, "autofixes");
    totalPreviewRuns += numberMeta(meta, "previewRuns");
    totalMemoryReads += numberMeta(meta, "memoryReads");
    totalMemoryWrites += numberMeta(meta, "memoryWrites");
  }

  const taskCount = taskCounts.reduce((sum, row) => sum + row._count._all, 0);
  const failedTaskCount = taskCounts.filter((row) => ["FAILED", "CANCELED"].includes(row.status)).reduce((sum, row) => sum + row._count._all, 0);
  const topUsers = usageByUser.map((row) => {
    const user = users.find((item) => item.id === row.userId);
    return { userId: row.userId, email: user?.email || "Unknown", name: user?.name || null, credits: row._sum.credits || 0, transactions: row._count._all };
  });
  const totalEstimatedCostCents = Array.from(modelUsage.values()).reduce((sum, row) => sum + row.estimatedCostCents, 0);
  const costConfigured = Array.from(modelUsage.values()).some((row) => row.configuredCost);
  const marginPercent = grossRevenueCents > 0 && costConfigured ? Math.round(((grossRevenueCents - totalEstimatedCostCents) / grossRevenueCents) * 1000) / 10 : null;

  const alerts = [
    failedPayments > 0 ? { severity: "high", type: "failed_payments", message: `${failedPayments} failed payment event(s) in range.` } : null,
    failedTaskCount > 0 ? { severity: "medium", type: "failed_tasks", message: `${failedTaskCount} workspace task(s) failed or were canceled.` } : null,
    workspaceLogs.length || taskEvents.length ? { severity: "medium", type: "provider_errors", message: `${workspaceLogs.length + taskEvents.length} provider/error log event(s) found.` } : null,
    topUsers[0]?.credits > Math.max(1000, totalCreditsUsed * 0.5) ? { severity: "medium", type: "high_cost_user", message: `${topUsers[0].email} used ${topUsers[0].credits} credits in range.` } : null,
    failedPreviews > 0 ? { severity: "low", type: "failed_previews", message: `${failedPreviews} preview record(s) are unverified or failed.` } : null,
  ].filter(Boolean);

  const data = {
    range: { key: range, start: start.toISOString(), end: end.toISOString() },
    revenue: {
      mrrCents: moneyFromCents(mrrCents),
      arrCents: moneyFromCents(arrCents),
      grossRevenueCents: moneyFromCents(grossRevenueCents),
      failedPayments,
      refundsCents: moneyFromCents(refundsCents),
      revenueByPlan: Array.from(revenueByPlanMap.values()),
      activeSubscriptions: activeSubscriptions.length,
      trialUsers,
      freeUsers,
      paidUsers,
      churnedUsers,
    },
    usage: {
      totalCreditsUsed,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      averageCreditsPerTask: taskCount ? Math.round(totalCreditsUsed / taskCount) : 0,
      retries: totalRetries,
      autofixes: totalAutofixes,
      previewRuns: totalPreviewRuns || previewCounts._count._all,
      memoryReads: totalMemoryReads,
      memoryWrites: totalMemoryWrites,
      modelUsage: Array.from(modelUsage.values()).sort((a, b) => b.credits - a.credits),
      topUsers,
    },
    modelCost: {
      estimatedProviderCostCents: Math.round(totalEstimatedCostCents),
      costConfigured,
      revenueFromCreditsCents: grossRevenueCents,
      marginPercent,
      highestCostModels: Array.from(modelUsage.values()).sort((a, b) => b.estimatedCostCents - a.estimatedCostCents).slice(0, 10),
      topExpensiveUsers: topUsers.slice(0, 10),
    },
    workspace: {
      workspaceCount,
      aiTaskCount: taskCount,
      failedTaskCount,
      providerErrors: workspaceLogs.length + taskEvents.length,
      previewRuns: previewCounts._count._all,
      failedPreviews,
      fileOperations: workspaceFiles._count._all,
      storageBytes: workspaceFiles._sum.sizeBytes || 0,
      taskStatus: taskCounts.map((row) => ({ status: row.status, count: row._count._all })),
    },
    planPerformance: Array.from(revenueByPlanMap.values()).map((row) => ({
      ...row,
      averageCreditsPerUser: row.users ? Math.round(totalCreditsUsed / row.users) : 0,
      upgradeRate: activeUserPlans.length ? Math.round((row.users / activeUserPlans.length) * 1000) / 10 : 0,
      churnRate: activeSubscriptions.length ? Math.round((churnedUsers / activeSubscriptions.length) * 1000) / 10 : 0,
    })),
    alerts,
    recentPaymentEvents: paymentEvents.slice(0, 20),
    recentProviderErrors: [...workspaceLogs, ...taskEvents].slice(0, 20),
  };

  if (exportType === "revenue") return csvResponse("meldex-revenue", data.revenue.revenueByPlan);
  if (exportType === "usage") return csvResponse("meldex-usage", data.usage.modelUsage);
  if (exportType === "user-usage") return csvResponse("meldex-user-usage", data.usage.topUsers);
  if (exportType === "credit-transactions") {
    return csvResponse("meldex-credit-transactions", creditTransactions.map((tx) => ({ id: tx.id, email: tx.user.email, plan: tx.plan.name, type: tx.type, credits: tx.credits, reason: tx.reason, createdAt: tx.createdAt.toISOString() })));
  }
  if (exportType === "payment-events") {
    return csvResponse("meldex-payment-events", paymentEvents.map((event) => ({ id: event.id, email: event.user?.email || "", provider: event.provider, type: event.type, status: event.status, amount: event.amount, currency: event.currency, createdAt: event.createdAt.toISOString() })));
  }

  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
