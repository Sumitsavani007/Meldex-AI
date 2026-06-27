"use client";

import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import type { ElementType, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Cloud,
  Code2,
  Copy,
  CreditCard,
  Database,
  DollarSign,
  Download,
  FileText,
  Globe,
  Key,
  Loader2,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Server,
  Settings,
  Shield,
  TestTube2,
  Users,
  XCircle,
  Zap,
} from "lucide-react";

type TabId = "overview" | "analytics" | "ai" | "vault" | "integrations" | "runtime" | "plans" | "billing" | "usage-pricing" | "users" | "audit" | "diagnostics";
type SettingSource = "ENV" | "VAULT" | "MISSING";

interface SettingRow {
  key: string;
  label: string;
  category: string;
  isSecret: boolean;
  requireRestart: boolean;
  source: SettingSource;
  hotReload?: boolean;
  status?: string;
  maskedValue: string | null;
  configured: boolean;
  updatedBy: string | null;
  updatedAt: string | null;
  description?: string | null;
}

interface Overview {
  appUrl?: string;
  environment?: string;
  nodeVersion?: string;
  buildVersion?: string;
  hostname?: string;
  vaultConfigured?: boolean;
  diagnosticsMs?: number;
  checks?: Record<string, { status: string; latencyMs?: number }>;
  system?: { totalMemMb: number; usedMemMb: number; memPercent: number; cpuLoad1: string; cpus: number; uptimeSeconds: number };
  stats?: { users: number; projects: number; conversations: number; messages: number; vaultKeys: number };
  awsMeta?: Record<string, string | undefined>;
}

interface TestResult {
  provider: string;
  status: string;
  latencyMs: number;
  message: string;
  lastCheckedAt: string;
  extra?: Record<string, string | undefined>;
}

interface AuditEntry {
  id: string;
  action: string;
  resource?: string | null;
  userId?: string | null;
  ipAddress?: string | null;
  createdAt: string;
}

interface UserRow {
  id: string;
  email: string;
  name?: string | null;
  role: "USER" | "ADMIN" | "OWNER";
  authProvider?: string;
  createdAt: string;
}

interface PlanRow {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  priceMonthly: number;
  priceYearly: number;
  currency: string;
  monthlyCredits: number;
  weeklyCredits: number;
  fiveHourCredits: number;
  maxContextTokens: number;
  maxWorkspaceCount: number;
  maxStorageMb: number;
  maxParallelTasks: number;
  priorityLevel: number;
  allowedModelsJson?: string[] | null;
  featuresJson?: string[] | null;
  stripePriceIdMonthly?: string | null;
  stripePriceIdYearly?: string | null;
  razorpayPlanIdMonthly?: string | null;
  razorpayPlanIdYearly?: string | null;
  paymentEnabled: boolean;
  trialDays: number;
  yearlyDiscount: number;
  isActive: boolean;
  sortOrder: number;
}

interface UsageWindowRow {
  windowType: "FIVE_HOUR" | "WEEKLY" | "MONTHLY";
  creditsUsed: number;
  creditsLimit: number;
  resetAt: string;
}

interface UserPlanDetail {
  user: { id: string; email: string; name?: string | null };
  plans: PlanRow[];
  usage: {
    plan: PlanRow;
    windows: Record<"FIVE_HOUR" | "WEEKLY" | "MONTHLY", UsageWindowRow>;
  };
  transactions: Array<{ id: string; type: string; credits: number; reason?: string | null; metadataJson?: Record<string, unknown> | null; createdAt: string }>;
}

interface ModelUsageConfigRow {
  id: string;
  provider: string;
  model: string;
  inputCreditMultiplier: number;
  outputCreditMultiplier: number;
  reasoningCreditMultiplier: number;
  cachedCreditMultiplier: number;
  toolCallCreditCost: number;
  previewCreditCost: number;
  fileReadCreditCost: number;
  fileWriteCreditCost: number;
  memoryReadCreditCost: number;
  memoryWriteCreditCost: number;
  fallbackEstimateCredits: number;
  retryMultiplier: number;
  autofixMultiplier: number;
  estimatedCostPerCreditCents: number;
  isActive: boolean;
}

interface UpgradeRequestRow {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELED";
  message?: string | null;
  adminNote?: string | null;
  bonusCredits?: number | null;
  expiresAt?: string | null;
  createdAt: string;
  reviewedAt?: string | null;
  user: { id: string; email: string; name?: string | null };
  currentPlan?: PlanRow | null;
  requestedPlan: PlanRow;
}

interface SubscriptionRow {
  id: string;
  provider: string;
  status: string;
  billingCycle: string;
  providerSubscriptionId?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd: boolean;
  updatedAt: string;
  user: { id: string; email: string; name?: string | null };
  plan: PlanRow;
}

interface InvoiceRow {
  id: string;
  provider: string;
  status: string;
  amount: number;
  currency: string;
  hostedInvoiceUrl?: string | null;
  invoicePdf?: string | null;
  createdAt: string;
  user: { id: string; email: string; name?: string | null };
  plan?: PlanRow | null;
}

interface PaymentEventRow {
  id: string;
  provider: string;
  type: string;
  status: string;
  amount?: number | null;
  currency?: string | null;
  providerEventId?: string | null;
  createdAt: string;
  user?: { id: string; email: string; name?: string | null } | null;
}

interface AnalyticsData {
  range: { key: string; start: string; end: string };
  revenue: {
    mrrCents: number;
    arrCents: number;
    grossRevenueCents: number;
    failedPayments: number;
    refundsCents: number;
    revenueByPlan: Array<{ plan: string; users: number; revenueCents: number; mrrCents: number }>;
    activeSubscriptions: number;
    trialUsers: number;
    freeUsers: number;
    paidUsers: number;
    churnedUsers: number;
  };
  usage: {
    totalCreditsUsed: number;
    inputTokens: number;
    outputTokens: number;
    averageCreditsPerTask: number;
    retries: number;
    autofixes: number;
    previewRuns: number;
    memoryReads: number;
    memoryWrites: number;
    modelUsage: Array<{ provider: string; model: string; credits: number; inputTokens: number; outputTokens: number; retries: number; autofixes: number; previewRuns: number; estimatedCostCents: number; configuredCost: boolean }>;
    topUsers: Array<{ userId: string; email: string; name?: string | null; credits: number; transactions: number }>;
  };
  modelCost: {
    estimatedProviderCostCents: number;
    costConfigured: boolean;
    revenueFromCreditsCents: number;
    marginPercent: number | null;
    highestCostModels: Array<{ provider: string; model: string; credits: number; estimatedCostCents: number; configuredCost: boolean }>;
    topExpensiveUsers: Array<{ email: string; credits: number; transactions: number }>;
  };
  workspace: {
    workspaceCount: number;
    aiTaskCount: number;
    failedTaskCount: number;
    providerErrors: number;
    previewRuns: number;
    failedPreviews: number;
    fileOperations: number;
    storageBytes: number;
    taskStatus: Array<{ status: string; count: number }>;
  };
  planPerformance: Array<{ plan: string; users: number; revenueCents: number; mrrCents: number; averageCreditsPerUser: number; upgradeRate: number; churnRate: number }>;
  alerts: Array<{ severity: string; type: string; message: string }>;
}

type Toast = { id: number; tone: "success" | "error" | "info"; message: string };

const groups: Array<{ category: string; label: string; icon: ElementType }> = [
  { category: "openrouter", label: "OpenRouter", icon: Zap },
  { category: "qwen", label: "Qwen3-Coder", icon: Code2 },
  { category: "search", label: "Search Providers", icon: Search },
  { category: "r2", label: "Cloudflare R2", icon: Cloud },
  { category: "oauth", label: "Auth Providers", icon: Globe },
  { category: "aws", label: "AWS / Deployment", icon: Server },
  { category: "billing", label: "Billing / Payments", icon: CreditCard },
  { category: "runtime", label: "App Runtime", icon: Settings },
  { category: "auth", label: "Boot Auth", icon: Shield },
  { category: "database", label: "Database", icon: Database },
  { category: "security", label: "Security", icon: Shield },
];

const integrations = [
  { id: "openrouter", label: "OpenRouter", icon: Zap },
  { id: "r2", label: "Cloudflare R2", icon: Cloud },
  { id: "google", label: "Google OAuth", icon: Globe },
  { id: "github", label: "GitHub OAuth", icon: Code2 },
  { id: "postgres", label: "PostgreSQL", icon: Database },
  { id: "aws", label: "AWS", icon: Server },
];

const aiKeys = [
  "OPENROUTER_MODEL",
  "OPENROUTER_FALLBACK_MODEL",
  "OPENROUTER_BASE_URL",
  "MELDEX_BRAIN_PROVIDER",
  "QWEN_TEMPERATURE",
  "QWEN_MAX_TOKENS",
  "QWEN_TIMEOUT_MS",
  "QWEN_RETRY_COUNT",
  "QWEN_CONTEXT_SIZE",
  "QWEN_ACTION_MODE",
];

const runtimeKeys = ["APP_PUBLIC_URL", "NEXTAUTH_URL", "AUTH_URL", "AWS_REGION", "AWS_PUBLIC_IP", "AWS_INSTANCE_ID"];

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function getSection(): TabId {
  if (typeof window === "undefined") return "overview";
  const value = new URLSearchParams(window.location.search).get("section") as TabId | null;
  return value && ["overview", "analytics", "ai", "vault", "integrations", "runtime", "plans", "billing", "usage-pricing", "users", "audit", "diagnostics"].includes(value) ? value : "overview";
}

function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "green" | "red" | "amber" | "blue" | "neutral" }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium",
        tone === "green" && "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        tone === "red" && "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300",
        tone === "amber" && "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
        tone === "blue" && "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300",
        tone === "neutral" && "border-slate-200 bg-slate-50 text-slate-600 dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-slate-300"
      )}
    >
      {children}
    </span>
  );
}

function SourceBadge({ source }: { source: SettingSource }) {
  if (source === "VAULT") return <Badge tone="blue">VAULT</Badge>;
  if (source === "ENV") return <Badge tone="green">ENV</Badge>;
  return <Badge tone="red">MISSING</Badge>;
}

function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx("rounded-lg border border-slate-200 bg-white dark:border-white/[0.08] dark:bg-white/[0.03]", className)}>{children}</section>;
}

function SectionTitle({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">{title}</h2>
        {description && <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">{description}</p>}
      </div>
      {action}
    </div>
  );
}

function IconButton({ children, onClick, disabled, title }: { children: ReactNode; onClick?: () => void; disabled?: boolean; title?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-slate-200 dark:hover:bg-white/[0.08]"
    >
      {children}
    </button>
  );
}

function SpinnerText({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Loader2 className="size-3.5 animate-spin" />
      {label}
    </span>
  );
}

function statusTone(status?: string): "green" | "red" | "amber" | "neutral" {
  if (status === "ok" || status === "configured" || status === "active") return "green";
  if (status === "error" || status === "misconfigured" || status === "missing") return "red";
  if (status) return "amber";
  return "neutral";
}

function formatMoney(cents = 0, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format((cents || 0) / 100);
}

function formatBytes(bytes = 0) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function MetricCard({ label, value, icon: Icon, hint }: { label: string; value: ReactNode; icon: ElementType; hint?: string }) {
  return (
    <Panel className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
        <Icon className="size-4 text-slate-400" />
      </div>
      <p className="mt-3 text-2xl font-semibold">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </Panel>
  );
}

function MiniBar({ value, max }: { value: number; max: number }) {
  const width = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return <div className="h-2 rounded-full bg-slate-100 dark:bg-white/[0.08]"><div className="h-2 rounded-full bg-violet-600" style={{ width: `${width}%` }} /></div>;
}

export default function MasterAdminPage() {
  const { data: session, status: sessionStatus } = useSession();
  const role = session?.user?.role;
  const isOwner = role === "OWNER";

  const [tab, setTab] = useState<TabId>("overview");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [analyticsRange, setAnalyticsRange] = useState("30d");
  const [settings, setSettings] = useState<SettingRow[]>([]);
  const [vaultOk, setVaultOk] = useState(false);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [editingPlan, setEditingPlan] = useState<PlanRow | null>(null);
  const [usageConfigs, setUsageConfigs] = useState<ModelUsageConfigRow[]>([]);
  const [editingUsageConfig, setEditingUsageConfig] = useState<ModelUsageConfigRow | null>(null);
  const [upgradeRequests, setUpgradeRequests] = useState<UpgradeRequestRow[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [paymentEvents, setPaymentEvents] = useState<PaymentEventRow[]>([]);
  const [selectedUserPlan, setSelectedUserPlan] = useState<UserPlanDetail | null>(null);
  const [grantCredits, setGrantCredits] = useState("500");
  const [upgradeBonusCredits, setUpgradeBonusCredits] = useState("0");
  const [upgradeNote, setUpgradeNote] = useState("");
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState({ overview: true, analytics: false, settings: true, users: false, audit: false, plans: false, billing: false, usagePricing: false, userPlan: false });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [updatingUser, setUpdatingUser] = useState<string | null>(null);

  const pushToast = useCallback((tone: Toast["tone"], message: string) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, tone, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((toast) => toast.id !== id)), 4500);
  }, []);

  const fetchOverview = useCallback(async () => {
    setLoading((prev) => ({ ...prev, overview: true }));
    try {
      const res = await fetch("/api/admin/master/overview", { cache: "no-store" });
      if (!res.ok) throw new Error("Overview unavailable");
      setOverview(await res.json());
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : "Overview unavailable");
    } finally {
      setLoading((prev) => ({ ...prev, overview: false }));
    }
  }, [pushToast]);

  const fetchSettings = useCallback(async () => {
    setLoading((prev) => ({ ...prev, settings: true }));
    try {
      const res = await fetch("/api/admin/master/settings", { cache: "no-store" });
      if (!res.ok) throw new Error("Settings unavailable");
      const data = await res.json();
      setSettings(data.settings ?? []);
      setVaultOk(Boolean(data.vaultConfigured));
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : "Settings unavailable");
    } finally {
      setLoading((prev) => ({ ...prev, settings: false }));
    }
  }, [pushToast]);

  const fetchAnalytics = useCallback(async () => {
    setLoading((prev) => ({ ...prev, analytics: true }));
    try {
      const res = await fetch(`/api/admin/analytics?range=${encodeURIComponent(analyticsRange)}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Analytics unavailable");
      setAnalytics(await res.json());
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : "Analytics unavailable");
    } finally {
      setLoading((prev) => ({ ...prev, analytics: false }));
    }
  }, [analyticsRange, pushToast]);

  const fetchUsers = useCallback(async () => {
    setLoading((prev) => ({ ...prev, users: true }));
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      if (!res.ok) throw new Error("Users unavailable");
      const data = await res.json();
      setUsers(data.users ?? []);
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : "Users unavailable");
    } finally {
      setLoading((prev) => ({ ...prev, users: false }));
    }
  }, [pushToast]);

  const fetchPlans = useCallback(async () => {
    setLoading((prev) => ({ ...prev, plans: true }));
    try {
      const res = await fetch("/api/admin/plans", { cache: "no-store" });
      if (!res.ok) throw new Error("Plans unavailable");
      const data = await res.json();
      const rows = data.plans ?? [];
      setPlans(rows);
      setEditingPlan((current) => current ?? rows[0] ?? null);
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : "Plans unavailable");
    } finally {
      setLoading((prev) => ({ ...prev, plans: false }));
    }
  }, [pushToast]);

  const fetchUsagePricing = useCallback(async () => {
    setLoading((prev) => ({ ...prev, usagePricing: true }));
    try {
      const res = await fetch("/api/admin/usage-pricing", { cache: "no-store" });
      if (!res.ok) throw new Error("Usage pricing unavailable");
      const data = await res.json();
      const rows = data.configs ?? [];
      setUsageConfigs(rows);
      setEditingUsageConfig((current) => current ?? rows[0] ?? null);
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : "Usage pricing unavailable");
    } finally {
      setLoading((prev) => ({ ...prev, usagePricing: false }));
    }
  }, [pushToast]);

  const fetchUpgradeRequests = useCallback(async () => {
    setLoading((prev) => ({ ...prev, billing: true }));
    try {
      const res = await fetch("/api/admin/upgrade-requests", { cache: "no-store" });
      if (!res.ok) throw new Error("Upgrade requests unavailable");
      const data = await res.json();
      setUpgradeRequests(data.requests ?? []);
      setSubscriptions(data.subscriptions ?? []);
      setInvoices(data.invoices ?? []);
      setPaymentEvents(data.paymentEvents ?? []);
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : "Upgrade requests unavailable");
    } finally {
      setLoading((prev) => ({ ...prev, billing: false }));
    }
  }, [pushToast]);

  const fetchAudit = useCallback(async () => {
    setLoading((prev) => ({ ...prev, audit: true }));
    try {
      const res = await fetch("/api/admin/audit", { cache: "no-store" });
      if (!res.ok) throw new Error("Audit logs unavailable");
      const data = await res.json();
      setAuditLogs(data.logs ?? []);
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : "Audit logs unavailable");
    } finally {
      setLoading((prev) => ({ ...prev, audit: false }));
    }
  }, [pushToast]);

  useEffect(() => {
    const syncSection = () => setTab(getSection());
    syncSection();
    window.addEventListener("popstate", syncSection);
    return () => window.removeEventListener("popstate", syncSection);
  }, []);

  useEffect(() => {
    fetchOverview();
    fetchSettings();
  }, [fetchOverview, fetchSettings]);

  useEffect(() => {
    if (tab === "plans") fetchPlans();
    if (tab === "analytics") fetchAnalytics();
    if (tab === "billing") fetchUpgradeRequests();
    if (tab === "usage-pricing") fetchUsagePricing();
    if (tab === "users") fetchUsers();
    if (tab === "audit") fetchAudit();
  }, [tab, fetchPlans, fetchAnalytics, fetchUpgradeRequests, fetchUsagePricing, fetchUsers, fetchAudit]);

  const settingMap = useMemo(() => new Map(settings.map((setting) => [setting.key, setting])), [settings]);
  const stats = overview?.stats ?? { users: 0, projects: 0, conversations: 0, messages: 0, vaultKeys: 0 };
  const system = overview?.system ?? { totalMemMb: 0, usedMemMb: 0, memPercent: 0, cpuLoad1: "0.00", cpus: 0, uptimeSeconds: 0 };
  const checks = overview?.checks ?? {};
  const activeModel = settingMap.get("OPENROUTER_MODEL")?.maskedValue ?? "qwen/qwen3-coder:free";
  const activeProvider = settingMap.get("MELDEX_BRAIN_PROVIDER")?.maskedValue ?? "openrouter";

  if (sessionStatus === "loading") {
    return <div className="p-6 text-sm text-slate-500 dark:text-slate-400"><SpinnerText label="Loading Master Panel" /></div>;
  }

  if (!role || !["ADMIN", "OWNER"].includes(role)) redirect("/unauthorized");

  async function readError(res: Response) {
    const data = await res.json().catch(() => null);
    return data?.error || data?.message || `Request failed (${res.status})`;
  }

  async function saveSetting(row: SettingRow) {
    const value = edits[row.key]?.trim();
    if (!value) return pushToast("error", "Enter a value before saving.");
    if (row.isSecret && !isOwner) return pushToast("error", "Owner access is required to update secrets.");
    setSaving((prev) => ({ ...prev, [row.key]: true }));
    try {
      const res = await fetch("/api/admin/master/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: row.key, value, category: row.category, isSecret: row.isSecret }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const data = await res.json();
      setEdits((prev) => {
        const next = { ...prev };
        delete next[row.key];
        return next;
      });
      pushToast("success", data.requireRestart ? "Saved. Restart is required." : "Saved.");
      await fetchSettings();
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving((prev) => ({ ...prev, [row.key]: false }));
    }
  }

  async function testConnection(id: string) {
    setTesting((prev) => ({ ...prev, [id]: true }));
    try {
      const res = await fetch("/api/admin/master/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: id }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const data = await res.json();
      setTestResults((prev) => ({ ...prev, [id]: data }));
      pushToast(data.status === "ok" || data.status === "configured" ? "success" : "info", data.message ?? `${id} checked`);
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : "Test failed");
    } finally {
      setTesting((prev) => ({ ...prev, [id]: false }));
    }
  }

  async function reloadConfig() {
    setReloading(true);
    try {
      const res = await fetch("/api/admin/master/reload-config", { method: "POST" });
      if (!res.ok) throw new Error(await readError(res));
      const data = await res.json();
      pushToast(data.openrouter?.ok ? "success" : "info", data.openrouter?.userMessage ?? data.message ?? "Runtime config reloaded.");
      await Promise.all([fetchOverview(), fetchSettings()]);
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : "Reload failed");
    } finally {
      setReloading(false);
    }
  }

  async function syncEnv() {
    if (!isOwner) return pushToast("error", "Owner access is required to sync ENV into vault.");
    setSyncing(true);
    try {
      const res = await fetch("/api/admin/master/sync-env", { method: "POST" });
      if (!res.ok) throw new Error(await readError(res));
      const data = await res.json();
      pushToast("success", `Synced ${data.synced ?? 0} setting(s).`);
      await Promise.all([fetchSettings(), fetchAudit()]);
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function restartApp() {
    if (!isOwner) return pushToast("error", "Owner access is required to restart the app.");
    setRestarting(true);
    try {
      const res = await fetch("/api/admin/master/restart", { method: "POST" });
      if (!res.ok) throw new Error(await readError(res));
      pushToast("success", "Restart initiated.");
      setTimeout(() => {
        setRestarting(false);
        fetchOverview();
      }, 6000);
    } catch (err) {
      setRestarting(false);
      pushToast("error", err instanceof Error ? err.message : "Restart failed");
    }
  }

  async function copyMasked(value?: string | null) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      pushToast("success", "Masked value copied.");
    } catch {
      pushToast("error", "Clipboard permission denied.");
    }
  }

  async function updateRole(userId: string, nextRole: UserRow["role"]) {
    if (!isOwner) return pushToast("error", "Owner access is required to update user roles.");
    setUpdatingUser(userId);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: userId, role: nextRole }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const data = await res.json();
      setUsers((prev) => prev.map((user) => (user.id === userId ? data.user : user)));
      pushToast("success", "User role updated.");
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : "Role update failed");
    } finally {
      setUpdatingUser(null);
    }
  }

  async function savePlan() {
    if (!editingPlan) return;
    setSaving((prev) => ({ ...prev, plan: true }));
    try {
      const res = await fetch("/api/admin/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingPlan),
      });
      if (!res.ok) throw new Error(await readError(res));
      const data = await res.json();
      setPlans((prev) => prev.map((plan) => (plan.id === data.plan.id ? data.plan : plan)).concat(plans.some((plan) => plan.id === data.plan.id) ? [] : [data.plan]));
      setEditingPlan(data.plan);
      pushToast("success", "Plan saved. Limits apply immediately.");
      await fetchPlans();
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : "Plan save failed");
    } finally {
      setSaving((prev) => ({ ...prev, plan: false }));
    }
  }

  async function resetPlans() {
    setSaving((prev) => ({ ...prev, resetPlans: true }));
    try {
      const res = await fetch("/api/admin/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetDefaults: true }),
      });
      if (!res.ok) throw new Error(await readError(res));
      pushToast("success", "Default plans restored.");
      setEditingPlan(null);
      await fetchPlans();
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : "Reset failed");
    } finally {
      setSaving((prev) => ({ ...prev, resetPlans: false }));
    }
  }

  async function saveUsagePricing() {
    if (!editingUsageConfig) return;
    setSaving((prev) => ({ ...prev, usagePricing: true }));
    try {
      const res = await fetch("/api/admin/usage-pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingUsageConfig),
      });
      if (!res.ok) throw new Error(await readError(res));
      const data = await res.json();
      setEditingUsageConfig(data.config);
      pushToast("success", "Usage pricing saved. Next task uses the new costs.");
      await fetchUsagePricing();
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : "Usage pricing save failed");
    } finally {
      setSaving((prev) => ({ ...prev, usagePricing: false }));
    }
  }

  async function resetUsagePricing() {
    setSaving((prev) => ({ ...prev, resetUsagePricing: true }));
    try {
      const res = await fetch("/api/admin/usage-pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetDefaults: true }),
      });
      if (!res.ok) throw new Error(await readError(res));
      pushToast("success", "Default usage pricing restored.");
      setEditingUsageConfig(null);
      await fetchUsagePricing();
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : "Usage pricing reset failed");
    } finally {
      setSaving((prev) => ({ ...prev, resetUsagePricing: false }));
    }
  }

  async function loadUserPlan(userId: string) {
    setLoading((prev) => ({ ...prev, userPlan: true }));
    try {
      const res = await fetch(`/api/admin/users/${userId}/plan`, { cache: "no-store" });
      if (!res.ok) throw new Error(await readError(res));
      setSelectedUserPlan(await res.json());
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : "User plan unavailable");
    } finally {
      setLoading((prev) => ({ ...prev, userPlan: false }));
    }
  }

  async function updateUserPlan(action: Record<string, unknown>) {
    if (!selectedUserPlan) return;
    setSaving((prev) => ({ ...prev, userPlan: true }));
    try {
      const res = await fetch(`/api/admin/users/${selectedUserPlan.user.id}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action),
      });
      if (!res.ok) throw new Error(await readError(res));
      pushToast("success", "User plan updated.");
      await loadUserPlan(selectedUserPlan.user.id);
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : "User plan update failed");
    } finally {
      setSaving((prev) => ({ ...prev, userPlan: false }));
    }
  }

  async function reviewUpgradeRequest(requestId: string, action: "approve" | "reject", planId?: string) {
    setSaving((prev) => ({ ...prev, [`upgrade-${requestId}`]: true }));
    try {
      const res = await fetch("/api/admin/upgrade-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          requestId,
          planId,
          adminNote: upgradeNote || undefined,
          bonusCredits: action === "approve" ? Number(upgradeBonusCredits || 0) : undefined,
        }),
      });
      if (!res.ok) throw new Error(await readError(res));
      pushToast("success", action === "approve" ? "Upgrade approved and plan assigned." : "Upgrade rejected.");
      setUpgradeNote("");
      setUpgradeBonusCredits("0");
      await fetchUpgradeRequests();
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : "Upgrade review failed");
    } finally {
      setSaving((prev) => ({ ...prev, [`upgrade-${requestId}`]: false }));
    }
  }

  async function cancelSubscription(subscriptionId: string) {
    setSaving((prev) => ({ ...prev, [`subscription-${subscriptionId}`]: true }));
    try {
      const res = await fetch("/api/admin/upgrade-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancelSubscription", subscriptionId, adminNote: upgradeNote || undefined }),
      });
      if (!res.ok) throw new Error(await readError(res));
      pushToast("success", "Subscription marked cancelled.");
      await fetchUpgradeRequests();
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : "Subscription cancel failed");
    } finally {
      setSaving((prev) => ({ ...prev, [`subscription-${subscriptionId}`]: false }));
    }
  }

  function renderSettingRows(rows: SettingRow[]) {
    if (loading.settings) return <div className="p-6 text-sm text-slate-500 dark:text-slate-400"><SpinnerText label="Loading settings" /></div>;
    if (!rows.length) return <div className="p-6 text-sm text-slate-500 dark:text-slate-400">No settings in this section.</div>;

    return rows.map((row) => {
      const cannotSaveSecret = row.isSecret && !isOwner;
      const disabled = saving[row.key] || !edits[row.key]?.trim() || cannotSaveSecret || (row.isSecret && !vaultOk);
      return (
        <div key={row.key} className="grid gap-4 border-t border-slate-200 px-4 py-4 first:border-t-0 dark:border-white/[0.08] lg:grid-cols-[1fr_360px]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <code className="text-xs text-slate-900 dark:text-slate-100">{row.key}</code>
              <SourceBadge source={row.source} />
              {row.hotReload && !row.requireRestart && <Badge tone="green">hot reload</Badge>}
              {row.requireRestart && <Badge tone="amber">restart</Badge>}
              {row.isSecret && <Badge>secret</Badge>}
            </div>
            <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{row.label}</p>
            {row.description && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{row.description}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-mono">{row.maskedValue || "not configured"}</span>
              {row.maskedValue && (
                <button onClick={() => copyMasked(row.maskedValue)} className="inline-flex items-center gap-1 hover:text-slate-950 dark:hover:text-white">
                  <Copy className="size-3" />
                  Copy masked
                </button>
              )}
              {row.updatedAt && <span>Updated {new Date(row.updatedAt).toLocaleString()}</span>}
            </div>
          </div>
          <div className="flex items-start gap-2">
            <input
              type={row.isSecret ? "password" : "text"}
              value={edits[row.key] ?? ""}
              onChange={(event) => setEdits((prev) => ({ ...prev, [row.key]: event.target.value }))}
              disabled={cannotSaveSecret}
              placeholder={cannotSaveSecret ? "Owner only" : row.configured ? "Replace value" : "Enter value"}
              className="h-9 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[0.1] dark:bg-black/20 dark:text-white dark:focus:border-white/30"
            />
            <IconButton onClick={() => saveSetting(row)} disabled={disabled}>
              {saving[row.key] ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
              Save
            </IconButton>
          </div>
        </div>
      );
    });
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="fixed right-4 top-20 z-50 space-y-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cx(
              "flex w-[340px] items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-xl",
              toast.tone === "success" && "border-emerald-500/20 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-100",
              toast.tone === "error" && "border-red-500/20 bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-100",
              toast.tone === "info" && "border-sky-500/20 bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-100"
            )}
          >
            {toast.tone === "success" ? <CheckCircle2 className="mt-0.5 size-4" /> : toast.tone === "error" ? <XCircle className="mt-0.5 size-4" /> : <AlertTriangle className="mt-0.5 size-4" />}
            <span>{toast.message}</span>
          </div>
        ))}
      </div>

      {tab === "overview" && (
        <>
          <SectionTitle
            title="Overview"
            description="System health, active provider, model, database, storage, auth, and server state."
            action={<IconButton onClick={fetchOverview}><RefreshCw className={cx("size-4", loading.overview && "animate-spin")} />Refresh</IconButton>}
          />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Users", value: stats.users, icon: Users },
              { label: "Projects", value: stats.projects, icon: Database },
              { label: "Conversations", value: stats.conversations, icon: FileText },
              { label: "Vault Keys", value: stats.vaultKeys, icon: Key },
            ].map(({ label, value, icon: Icon }) => (
              <Panel key={label} className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
                  <Icon className="size-4 text-slate-400" />
                </div>
                <p className="mt-3 text-2xl font-semibold">{value.toLocaleString()}</p>
              </Panel>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Panel className="p-5 lg:col-span-2">
              <h3 className="text-sm font-semibold">Service Health</h3>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {Object.entries(checks).map(([name, check]) => (
                  <div key={name} className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-white/[0.08] dark:bg-black/20">
                    <span className="text-sm text-slate-700 dark:text-slate-300">{name.replace(/([A-Z])/g, " $1")}</span>
                    <Badge tone={statusTone(check.status)}>{check.latencyMs !== undefined ? `${check.latencyMs}ms` : check.status}</Badge>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel className="p-5">
              <h3 className="text-sm font-semibold">Runtime Snapshot</h3>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-4"><dt className="text-slate-500">Provider</dt><dd>{activeProvider}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-slate-500">Model</dt><dd className="truncate">{activeModel}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-slate-500">Node</dt><dd>{overview?.nodeVersion ?? "-"}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-slate-500">Memory</dt><dd>{system.memPercent}%</dd></div>
              </dl>
            </Panel>
          </div>
        </>
      )}

      {tab === "analytics" && (
        <>
          <SectionTitle
            title="SaaS Analytics"
            description="Revenue, subscriptions, credit usage, model cost estimates, workspace activity, alerts, and exports from live DB data."
            action={
              <div className="flex flex-wrap gap-2">
                <select value={analyticsRange} onChange={(event) => setAnalyticsRange(event.target.value)} className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-white/[0.1] dark:bg-black/20">
                  <option value="today">Today</option>
                  <option value="7d">7 days</option>
                  <option value="30d">30 days</option>
                  <option value="month">This month</option>
                </select>
                <IconButton onClick={fetchAnalytics}><RefreshCw className={cx("size-4", loading.analytics && "animate-spin")} />Refresh</IconButton>
              </div>
            }
          />
          {!analytics ? (
            <Panel className="p-8 text-sm text-slate-500">{loading.analytics ? <SpinnerText label="Loading analytics" /> : "Analytics data is not loaded yet."}</Panel>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <MetricCard label="MRR" value={formatMoney(analytics.revenue.mrrCents)} icon={DollarSign} hint="Active subscriptions" />
                <MetricCard label="ARR" value={formatMoney(analytics.revenue.arrCents)} icon={BarChart3} hint="MRR x 12" />
                <MetricCard label="Gross Revenue" value={formatMoney(analytics.revenue.grossRevenueCents)} icon={CreditCard} hint={`${analytics.revenue.failedPayments} failed payment(s)`} />
                <MetricCard label="Paid Users" value={analytics.revenue.paidUsers.toLocaleString()} icon={Users} hint={`${analytics.revenue.freeUsers} free · ${analytics.revenue.trialUsers} trial`} />
                <MetricCard label="Credits Used" value={analytics.usage.totalCreditsUsed.toLocaleString()} icon={Zap} hint={`${analytics.usage.averageCreditsPerTask} avg / task`} />
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
                <Panel className="overflow-hidden">
                  <div className="border-b border-slate-200 px-4 py-3 dark:border-white/[0.08]">
                    <h3 className="text-sm font-semibold">Revenue By Plan</h3>
                    <p className="text-xs text-slate-500">MRR, paid invoices, and current assigned users by plan.</p>
                  </div>
                  <div className="divide-y divide-slate-200 dark:divide-white/[0.08]">
                    {analytics.revenue.revenueByPlan.map((row) => (
                      <div key={row.plan} className="grid gap-3 px-4 py-3 sm:grid-cols-[1fr_140px_140px_100px] sm:items-center">
                        <div>
                          <p className="text-sm font-medium">{row.plan}</p>
                          <MiniBar value={row.mrrCents} max={Math.max(...analytics.revenue.revenueByPlan.map((item) => item.mrrCents), 1)} />
                        </div>
                        <span className="text-sm text-slate-600 dark:text-slate-300">{formatMoney(row.mrrCents)} MRR</span>
                        <span className="text-sm text-slate-600 dark:text-slate-300">{formatMoney(row.revenueCents)} paid</span>
                        <span className="text-sm text-slate-500">{row.users} user(s)</span>
                      </div>
                    ))}
                  </div>
                </Panel>

                <Panel className="p-4">
                  <h3 className="text-sm font-semibold">Model Cost Estimate</h3>
                  <div className="mt-4 grid gap-3 text-sm">
                    <div className="flex justify-between gap-3 rounded-md bg-slate-50 px-3 py-2 dark:bg-white/[0.04]"><span>Provider cost</span><span>{analytics.modelCost.costConfigured ? formatMoney(analytics.modelCost.estimatedProviderCostCents) : "Not configured"}</span></div>
                    <div className="flex justify-between gap-3 rounded-md bg-slate-50 px-3 py-2 dark:bg-white/[0.04]"><span>Credit revenue</span><span>{formatMoney(analytics.modelCost.revenueFromCreditsCents)}</span></div>
                    <div className="flex justify-between gap-3 rounded-md bg-slate-50 px-3 py-2 dark:bg-white/[0.04]"><span>Margin</span><span>{analytics.modelCost.marginPercent === null ? "Not configured" : `${analytics.modelCost.marginPercent}%`}</span></div>
                  </div>
                  {!analytics.modelCost.costConfigured && <p className="mt-3 text-xs text-amber-600 dark:text-amber-300">Set estimated cost per credit in Master → Usage Pricing to enable cost and margin estimates.</p>}
                </Panel>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <Panel className="overflow-hidden">
                  <div className="border-b border-slate-200 px-4 py-3 dark:border-white/[0.08]">
                    <h3 className="text-sm font-semibold">AI Usage By Model</h3>
                    <p className="text-xs text-slate-500">Credits, tokens, retries, autofix, and preview usage.</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-white/[0.08]">
                        <tr><th className="px-4 py-3">Model</th><th className="px-4 py-3">Credits</th><th className="px-4 py-3">Tokens</th><th className="px-4 py-3">Retries</th><th className="px-4 py-3">Cost</th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-white/[0.08]">
                        {analytics.usage.modelUsage.map((row) => (
                          <tr key={`${row.provider}:${row.model}`}>
                            <td className="max-w-[260px] truncate px-4 py-3 font-mono text-xs">{row.provider}:{row.model}</td>
                            <td className="px-4 py-3">{row.credits.toLocaleString()}</td>
                            <td className="px-4 py-3">{(row.inputTokens + row.outputTokens).toLocaleString()}</td>
                            <td className="px-4 py-3">{row.retries} / {row.autofixes}</td>
                            <td className="px-4 py-3">{row.configuredCost ? formatMoney(row.estimatedCostCents) : "-"}</td>
                          </tr>
                        ))}
                        {!analytics.usage.modelUsage.length && <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">No AI usage in this range.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </Panel>

                <Panel className="overflow-hidden">
                  <div className="border-b border-slate-200 px-4 py-3 dark:border-white/[0.08]">
                    <h3 className="text-sm font-semibold">Top Users By Usage</h3>
                    <p className="text-xs text-slate-500">Highest credit users in the selected range.</p>
                  </div>
                  <div className="divide-y divide-slate-200 dark:divide-white/[0.08]">
                    {analytics.usage.topUsers.map((user) => (
                      <div key={user.userId} className="grid gap-3 px-4 py-3 sm:grid-cols-[1fr_120px_100px] sm:items-center">
                        <span className="truncate text-sm font-medium">{user.email}</span>
                        <span className="text-sm text-slate-600 dark:text-slate-300">{user.credits.toLocaleString()} credits</span>
                        <span className="text-xs text-slate-500">{user.transactions} tx</span>
                      </div>
                    ))}
                    {!analytics.usage.topUsers.length && <div className="px-4 py-10 text-center text-sm text-slate-500">No usage users in this range.</div>}
                  </div>
                </Panel>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="Workspaces" value={analytics.workspace.workspaceCount.toLocaleString()} icon={Database} hint={`${analytics.workspace.fileOperations} file record(s)`} />
                <MetricCard label="AI Tasks" value={analytics.workspace.aiTaskCount.toLocaleString()} icon={Activity} hint={`${analytics.workspace.failedTaskCount} failed/canceled`} />
                <MetricCard label="Preview Runs" value={analytics.workspace.previewRuns.toLocaleString()} icon={BarChart3} hint={`${analytics.workspace.failedPreviews} failed/unverified`} />
                <MetricCard label="Storage" value={formatBytes(analytics.workspace.storageBytes)} icon={Server} hint="Workspace file records" />
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <Panel className="overflow-hidden">
                  <div className="border-b border-slate-200 px-4 py-3 dark:border-white/[0.08]"><h3 className="text-sm font-semibold">Plan Performance</h3></div>
                  <div className="divide-y divide-slate-200 dark:divide-white/[0.08]">
                    {analytics.planPerformance.map((plan) => (
                      <div key={plan.plan} className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[1fr_100px_100px_100px]">
                        <span className="font-medium">{plan.plan}</span>
                        <span>{plan.users} users</span>
                        <span>{plan.upgradeRate}% share</span>
                        <span>{plan.churnRate}% churn</span>
                      </div>
                    ))}
                  </div>
                </Panel>
                <Panel className="overflow-hidden">
                  <div className="border-b border-slate-200 px-4 py-3 dark:border-white/[0.08]"><h3 className="text-sm font-semibold">Admin Alerts</h3></div>
                  <div className="divide-y divide-slate-200 dark:divide-white/[0.08]">
                    {analytics.alerts.map((alert) => (
                      <div key={`${alert.type}:${alert.message}`} className="flex gap-3 px-4 py-3 text-sm">
                        <AlertTriangle className={cx("mt-0.5 size-4", alert.severity === "high" ? "text-red-500" : alert.severity === "medium" ? "text-amber-500" : "text-sky-500")} />
                        <div><p className="font-medium">{alert.type.replace(/_/g, " ")}</p><p className="text-slate-500">{alert.message}</p></div>
                      </div>
                    ))}
                    {!analytics.alerts.length && <div className="px-4 py-10 text-center text-sm text-slate-500">No alerts for this range.</div>}
                  </div>
                </Panel>
              </div>

              <Panel className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">Exports</h3>
                    <p className="text-xs text-slate-500">CSV exports use the selected date range.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      ["Revenue", "revenue"],
                      ["Usage", "usage"],
                      ["User Usage", "user-usage"],
                      ["Credit Transactions", "credit-transactions"],
                      ["Payment Events", "payment-events"],
                    ].map(([label, key]) => <a key={key} href={`/api/admin/analytics?range=${analyticsRange}&export=${key}`} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm dark:border-white/[0.1]"><Download className="size-4" />{label}</a>)}
                  </div>
                </div>
              </Panel>
            </div>
          )}
        </>
      )}

      {tab === "ai" && (
        <>
          <SectionTitle title="AI Models" description="Qwen3-Coder is the active coding brain. Runtime-editable model settings use vault first." action={<IconButton onClick={() => testConnection("openrouter")}><TestTube2 className="size-4" />Test model</IconButton>} />
          <Panel>{renderSettingRows(settings.filter((row) => aiKeys.includes(row.key)))}</Panel>
        </>
      )}

      {tab === "vault" && (
        <>
          <SectionTitle title="Credentials Vault" description="Secrets are masked in the browser. Raw secret reveal is disabled; replace values instead." />
          {!vaultOk && <Panel className="border-amber-500/20 bg-amber-50 p-4 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">SETTINGS_ENCRYPTION_KEY is required before saving secrets.</Panel>}
          <div className="space-y-4">
            {groups.map((group) => {
              const rows = settings.filter((setting) => setting.category === group.category);
              if (!rows.length) return null;
              return (
                <Panel key={group.category} className="overflow-hidden">
                  <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-white/[0.08]">
                    <div className="flex items-center gap-2">
                      <group.icon className="size-4 text-slate-400" />
                      <h3 className="text-sm font-semibold">{group.label}</h3>
                    </div>
                    <span className="text-xs text-slate-500">{rows.filter((row) => row.configured).length}/{rows.length} configured</span>
                  </div>
                  {renderSettingRows(rows)}
                </Panel>
              );
            })}
          </div>
        </>
      )}

      {tab === "integrations" && (
        <>
          <SectionTitle title="Integrations" description="Run safe connection tests and see provider-specific diagnostics." action={<IconButton onClick={() => integrations.forEach((item) => testConnection(item.id))}><TestTube2 className="size-4" />Test all</IconButton>} />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {integrations.map((item) => {
              const result = testResults[item.id];
              return (
                <Panel key={item.id} className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span className="grid size-9 place-items-center rounded-md border border-slate-200 bg-slate-50 dark:border-white/[0.08] dark:bg-white/[0.04]"><item.icon className="size-4" /></span>
                      <div>
                        <p className="text-sm font-semibold">{item.label}</p>
                        <p className="text-xs text-slate-500">{result?.lastCheckedAt ? new Date(result.lastCheckedAt).toLocaleTimeString() : "Not tested"}</p>
                      </div>
                    </div>
                    <Badge tone={statusTone(result?.status)}>{result?.status ?? "idle"}</Badge>
                  </div>
                  {result && <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs dark:border-white/[0.08] dark:bg-black/20"><p>{result.message}</p><p className="mt-1 text-slate-500">{result.latencyMs}ms</p></div>}
                  <div className="mt-4">
                    <IconButton onClick={() => testConnection(item.id)} disabled={testing[item.id]}>
                      {testing[item.id] ? <SpinnerText label="Testing" /> : <><TestTube2 className="size-4" />Test connection</>}
                    </IconButton>
                  </div>
                </Panel>
              );
            })}
          </div>
        </>
      )}

      {tab === "runtime" && (
        <>
          <SectionTitle title="Runtime" description="Reload hot config, sync environment values into vault, and restart only when needed." />
          <div className="grid gap-4 lg:grid-cols-3">
            <Panel className="p-4"><h3 className="text-sm font-semibold">Reload Config</h3><p className="mt-2 text-sm text-slate-500">Clears runtime cache and retests the active model.</p><div className="mt-4"><IconButton onClick={reloadConfig} disabled={reloading}>{reloading ? <SpinnerText label="Reloading" /> : <><RefreshCw className="size-4" />Reload config</>}</IconButton></div></Panel>
            <Panel className="p-4"><h3 className="text-sm font-semibold">Sync ENV to Vault</h3><p className="mt-2 text-sm text-slate-500">Imports runtime-editable environment values.</p><div className="mt-4"><IconButton onClick={syncEnv} disabled={!isOwner || !vaultOk || syncing}>{syncing ? <SpinnerText label="Syncing" /> : <><Database className="size-4" />Sync ENV</>}</IconButton></div></Panel>
            <Panel className="p-4"><h3 className="text-sm font-semibold">Restart App</h3><p className="mt-2 text-sm text-slate-500">Use for boot-critical settings or OAuth provider registration changes.</p><div className="mt-4"><IconButton onClick={restartApp} disabled={!isOwner || restarting}>{restarting ? <SpinnerText label="Restarting" /> : <><RotateCcw className="size-4" />Restart</>}</IconButton></div></Panel>
          </div>
          <Panel>{renderSettingRows(settings.filter((row) => runtimeKeys.includes(row.key)))}</Panel>
        </>
      )}

      {tab === "plans" && (
        <>
          <SectionTitle
            title="Plans & Credits"
            description="Create, edit, disable, and reset SaaS plan limits. Changes are read from the database and apply without redeploy."
            action={<div className="flex gap-2"><IconButton onClick={fetchPlans}><RefreshCw className={cx("size-4", loading.plans && "animate-spin")} />Refresh</IconButton><IconButton onClick={resetPlans} disabled={saving.resetPlans}>{saving.resetPlans ? <SpinnerText label="Resetting" /> : <><RotateCcw className="size-4" />Reset defaults</>}</IconButton></div>}
          />
          <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
            <Panel className="overflow-hidden">
              <div className="border-b border-slate-200 px-4 py-3 dark:border-white/[0.08]">
                <button
                  onClick={() => setEditingPlan({
                    id: "",
                    name: "Custom Plan",
                    slug: `custom-${Date.now()}`,
                    description: "",
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
                    allowedModelsJson: ["qwen/qwen3-coder-30b-a3b-instruct", "qwen/qwen3-coder:free"],
                    featuresJson: [],
                    stripePriceIdMonthly: "",
                    stripePriceIdYearly: "",
                    razorpayPlanIdMonthly: "",
                    razorpayPlanIdYearly: "",
                    paymentEnabled: false,
                    trialDays: 0,
                    yearlyDiscount: 0,
                    isActive: true,
                    sortOrder: 99,
                  })}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50 dark:border-white/[0.1] dark:hover:bg-white/[0.04]"
                >
                  Create plan
                </button>
              </div>
              <div className="divide-y divide-slate-200 dark:divide-white/[0.08]">
                {plans.map((plan) => (
                  <button key={plan.id} onClick={() => setEditingPlan(plan)} className={cx("flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-white/[0.04]", editingPlan?.id === plan.id && "bg-violet-50 dark:bg-violet-500/10")}>
                    <span>
                      <span className="block text-sm font-semibold">{plan.name}</span>
                      <span className="block text-xs text-slate-500">{plan.monthlyCredits.toLocaleString()} monthly credits</span>
                    </span>
                    <Badge tone={plan.isActive ? "green" : "neutral"}>{plan.isActive ? "Active" : "Disabled"}</Badge>
                  </button>
                ))}
                {!plans.length && <div className="p-5 text-sm text-slate-500">{loading.plans ? "Loading plans..." : "No plans yet."}</div>}
              </div>
            </Panel>

            <Panel className="p-5">
              {editingPlan ? (
                <div className="space-y-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-semibold">{editingPlan.id ? "Edit Plan" : "Create Plan"}</h3>
                      <p className="mt-1 text-sm text-slate-500">All limits are dynamic and enforced before AI generation.</p>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={editingPlan.isActive} onChange={(event) => setEditingPlan({ ...editingPlan, isActive: event.target.checked })} />
                      Active
                    </label>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    {[
                      ["Name", "name", "text"],
                      ["Slug", "slug", "text"],
                      ["Currency", "currency", "text"],
                    ].map(([label, key, type]) => (
                      <label key={key} className="grid gap-1 text-sm">
                        <span className="font-medium">{label}</span>
                        <input type={type} value={String(editingPlan[key as keyof PlanRow] ?? "")} onChange={(event) => setEditingPlan({ ...editingPlan, [key]: event.target.value })} className="h-10 rounded-md border border-slate-200 bg-white px-3 outline-none dark:border-white/[0.1] dark:bg-black/20" />
                      </label>
                    ))}
                    <label className="grid gap-1 text-sm md:col-span-2">
                      <span className="font-medium">Description</span>
                      <textarea value={editingPlan.description || ""} onChange={(event) => setEditingPlan({ ...editingPlan, description: event.target.value })} className="min-h-20 rounded-md border border-slate-200 bg-white px-3 py-2 outline-none dark:border-white/[0.1] dark:bg-black/20" />
                    </label>
                    {[
                      ["Monthly Price", "priceMonthly"],
                      ["Yearly Price", "priceYearly"],
                      ["Trial Days", "trialDays"],
                      ["Yearly Discount %", "yearlyDiscount"],
                      ["Monthly Credits", "monthlyCredits"],
                      ["Weekly Credits", "weeklyCredits"],
                      ["5-hour Credits", "fiveHourCredits"],
                      ["Max Context Tokens", "maxContextTokens"],
                      ["Storage Limit MB", "maxStorageMb"],
                      ["Workspace Limit", "maxWorkspaceCount"],
                      ["Parallel Task Limit", "maxParallelTasks"],
                      ["Priority Level", "priorityLevel"],
                      ["Sort Order", "sortOrder"],
                    ].map(([label, key]) => (
                      <label key={key} className="grid gap-1 text-sm">
                        <span className="font-medium">{label}</span>
                        <input type="number" min={0} value={Number(editingPlan[key as keyof PlanRow] ?? 0)} onChange={(event) => setEditingPlan({ ...editingPlan, [key]: Number(event.target.value) })} className="h-10 rounded-md border border-slate-200 bg-white px-3 outline-none dark:border-white/[0.1] dark:bg-black/20" />
                      </label>
                    ))}
                    <label className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-white/[0.1]">
                      <input type="checkbox" checked={Boolean(editingPlan.paymentEnabled)} onChange={(event) => setEditingPlan({ ...editingPlan, paymentEnabled: event.target.checked })} />
                      <span className="font-medium">Payment enabled</span>
                    </label>
                    {[
                      ["Stripe Monthly Price ID", "stripePriceIdMonthly"],
                      ["Stripe Yearly Price ID", "stripePriceIdYearly"],
                      ["Razorpay Monthly Plan ID", "razorpayPlanIdMonthly"],
                      ["Razorpay Yearly Plan ID", "razorpayPlanIdYearly"],
                    ].map(([label, key]) => (
                      <label key={key} className="grid gap-1 text-sm">
                        <span className="font-medium">{label}</span>
                        <input value={String(editingPlan[key as keyof PlanRow] ?? "")} onChange={(event) => setEditingPlan({ ...editingPlan, [key]: event.target.value })} className="h-10 rounded-md border border-slate-200 bg-white px-3 font-mono text-xs outline-none dark:border-white/[0.1] dark:bg-black/20" />
                      </label>
                    ))}
                    <label className="grid gap-1 text-sm">
                      <span className="font-medium">Allowed Models</span>
                      <textarea value={(editingPlan.allowedModelsJson || []).join("\n")} onChange={(event) => setEditingPlan({ ...editingPlan, allowedModelsJson: event.target.value.split(/\n|,/).map((item) => item.trim()).filter(Boolean) })} className="min-h-24 rounded-md border border-slate-200 bg-white px-3 py-2 font-mono text-xs outline-none dark:border-white/[0.1] dark:bg-black/20" />
                    </label>
                    <label className="grid gap-1 text-sm">
                      <span className="font-medium">Features</span>
                      <textarea value={(editingPlan.featuresJson || []).join("\n")} onChange={(event) => setEditingPlan({ ...editingPlan, featuresJson: event.target.value.split(/\n|,/).map((item) => item.trim()).filter(Boolean) })} className="min-h-24 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs outline-none dark:border-white/[0.1] dark:bg-black/20" />
                    </label>
                  </div>
                  <div className="flex justify-end">
                    <IconButton onClick={savePlan} disabled={saving.plan}>{saving.plan ? <SpinnerText label="Saving" /> : <><Save className="size-4" />Save plan</>}</IconButton>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-sm text-slate-500">Select a plan to edit.</div>
              )}
            </Panel>
          </div>
        </>
      )}

      {tab === "usage-pricing" && (
        <>
          <SectionTitle
            title="Usage Pricing"
            description="Edit model/token/tool credit costs. Changes are database-backed and apply to the next AI task without redeploy."
            action={<div className="flex gap-2"><IconButton onClick={fetchUsagePricing}><RefreshCw className={cx("size-4", loading.usagePricing && "animate-spin")} />Refresh</IconButton><IconButton onClick={resetUsagePricing} disabled={saving.resetUsagePricing}>{saving.resetUsagePricing ? <SpinnerText label="Resetting" /> : <><RotateCcw className="size-4" />Reset defaults</>}</IconButton></div>}
          />
          <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
            <Panel className="overflow-hidden">
              <div className="border-b border-slate-200 px-4 py-3 dark:border-white/[0.08]">
                <button
                  onClick={() => setEditingUsageConfig({
                    id: "",
                    provider: "openrouter",
                    model: "custom/model",
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
                  })}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50 dark:border-white/[0.1] dark:hover:bg-white/[0.04]"
                >
                  Create pricing config
                </button>
              </div>
              <div className="divide-y divide-slate-200 dark:divide-white/[0.08]">
                {usageConfigs.map((config) => (
                  <button key={config.id} onClick={() => setEditingUsageConfig(config)} className={cx("flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-white/[0.04]", editingUsageConfig?.id === config.id && "bg-violet-50 dark:bg-violet-500/10")}>
                    <span>
                      <span className="block text-sm font-semibold">{config.provider}</span>
                      <span className="block truncate text-xs text-slate-500">{config.model}</span>
                    </span>
                    <Badge tone={config.isActive ? "green" : "neutral"}>{config.isActive ? "Active" : "Off"}</Badge>
                  </button>
                ))}
                {!usageConfigs.length && <div className="p-5 text-sm text-slate-500">{loading.usagePricing ? "Loading pricing..." : "No usage pricing configs yet."}</div>}
              </div>
            </Panel>
            <Panel className="p-5">
              {editingUsageConfig ? (
                <div className="space-y-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-semibold">Model Usage Config</h3>
                      <p className="mt-1 text-sm text-slate-500">Token multipliers and fixed costs used by the real credit calculator.</p>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={editingUsageConfig.isActive} onChange={(event) => setEditingUsageConfig({ ...editingUsageConfig, isActive: event.target.checked })} />
                      Active
                    </label>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    {[
                      ["Provider", "provider", "text"],
                      ["Model", "model", "text"],
                    ].map(([label, key, type]) => (
                      <label key={key} className="grid gap-1 text-sm">
                        <span className="font-medium">{label}</span>
                        <input type={type} value={String(editingUsageConfig[key as keyof ModelUsageConfigRow] ?? "")} onChange={(event) => setEditingUsageConfig({ ...editingUsageConfig, [key]: event.target.value })} className="h-10 rounded-md border border-slate-200 bg-white px-3 outline-none dark:border-white/[0.1] dark:bg-black/20" />
                      </label>
                    ))}
                    {[
                      ["Input token multiplier", "inputCreditMultiplier"],
                      ["Output token multiplier", "outputCreditMultiplier"],
                      ["Reasoning token multiplier", "reasoningCreditMultiplier"],
                      ["Cached token multiplier", "cachedCreditMultiplier"],
                      ["Tool call cost", "toolCallCreditCost"],
                      ["Preview run cost", "previewCreditCost"],
                      ["File read cost", "fileReadCreditCost"],
                      ["File write cost", "fileWriteCreditCost"],
                      ["Memory read cost", "memoryReadCreditCost"],
                      ["Memory write cost", "memoryWriteCreditCost"],
                      ["Fallback estimate credits", "fallbackEstimateCredits"],
                      ["Retry multiplier", "retryMultiplier"],
                      ["Autofix multiplier", "autofixMultiplier"],
                      ["Estimated cost / credit (cents)", "estimatedCostPerCreditCents"],
                    ].map(([label, key]) => (
                      <label key={key} className="grid gap-1 text-sm">
                        <span className="font-medium">{label}</span>
                        <input type="number" step="0.01" min={0} value={Number(editingUsageConfig[key as keyof ModelUsageConfigRow] ?? 0)} onChange={(event) => setEditingUsageConfig({ ...editingUsageConfig, [key]: Number(event.target.value) })} className="h-10 rounded-md border border-slate-200 bg-white px-3 outline-none dark:border-white/[0.1] dark:bg-black/20" />
                      </label>
                    ))}
                  </div>
                  <div className="flex justify-end">
                    <IconButton onClick={saveUsagePricing} disabled={saving.usagePricing}>{saving.usagePricing ? <SpinnerText label="Saving" /> : <><Save className="size-4" />Save pricing</>}</IconButton>
                  </div>
                </div>
              ) : <div className="p-8 text-center text-sm text-slate-500">Select usage pricing to edit.</div>}
            </Panel>
          </div>
        </>
      )}

      {tab === "billing" && (
        <>
          <SectionTitle
            title="Billing"
            description="Payment provider settings, subscriptions, invoices, webhooks, manual upgrades, and admin overrides."
            action={<IconButton onClick={fetchUpgradeRequests}><RefreshCw className={cx("size-4", loading.billing && "animate-spin")} />Refresh</IconButton>}
          />
          <Panel className="overflow-hidden">
            <div className="border-b border-slate-200 px-4 py-3 dark:border-white/[0.08]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">Upgrade Requests</h3>
                  <p className="text-xs text-slate-500">Manual admin upgrade remains available even when Stripe or Razorpay is enabled.</p>
                </div>
                <div className="flex gap-2">
                  <input value={upgradeBonusCredits} onChange={(event) => setUpgradeBonusCredits(event.target.value)} type="number" min={0} className="h-9 w-32 rounded-md border border-slate-200 bg-white px-3 text-xs dark:border-white/[0.1] dark:bg-black/20" placeholder="Bonus credits" />
                  <input value={upgradeNote} onChange={(event) => setUpgradeNote(event.target.value)} className="h-9 w-64 rounded-md border border-slate-200 bg-white px-3 text-xs dark:border-white/[0.1] dark:bg-black/20" placeholder="Admin note" />
                </div>
              </div>
            </div>
            <div className="divide-y divide-slate-200 dark:divide-white/[0.08]">
              {upgradeRequests.map((request) => (
                <div key={request.id} className="grid gap-4 px-4 py-4 lg:grid-cols-[1fr_auto]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={request.status === "PENDING" ? "amber" : request.status === "APPROVED" ? "green" : "red"}>{request.status}</Badge>
                      <span className="text-sm font-semibold">{request.user.email}</span>
                      <span className="text-xs text-slate-500">{request.currentPlan?.name || "No plan"} → {request.requestedPlan.name}</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{request.message || "Manual upgrade requested."}</p>
                    {request.adminNote && <p className="mt-1 text-xs text-slate-500">Admin note: {request.adminNote}</p>}
                    <div className="mt-2 text-xs text-slate-400">Requested {new Date(request.createdAt).toLocaleString()}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {request.status === "PENDING" ? (
                      <>
                        <IconButton onClick={() => reviewUpgradeRequest(request.id, "approve", request.requestedPlan.id)} disabled={saving[`upgrade-${request.id}`]}><CheckCircle2 className="size-4" />Approve</IconButton>
                        <IconButton onClick={() => reviewUpgradeRequest(request.id, "reject")} disabled={saving[`upgrade-${request.id}`]}><XCircle className="size-4" />Reject</IconButton>
                      </>
                    ) : (
                      <span className="text-xs text-slate-500">{request.reviewedAt ? `Reviewed ${new Date(request.reviewedAt).toLocaleString()}` : "Reviewed"}</span>
                    )}
                  </div>
                </div>
              ))}
              {!upgradeRequests.length && <div className="px-4 py-10 text-center text-sm text-slate-500">{loading.billing ? "Loading upgrade requests..." : "No upgrade requests yet."}</div>}
            </div>
          </Panel>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <Panel className="overflow-hidden">
              <div className="border-b border-slate-200 px-4 py-3 dark:border-white/[0.08]">
                <h3 className="text-sm font-semibold">Subscriptions</h3>
                <p className="text-xs text-slate-500">Latest Stripe, Razorpay, and manual subscription state.</p>
              </div>
              <div className="divide-y divide-slate-200 dark:divide-white/[0.08]">
                {subscriptions.map((subscription) => (
                  <div key={subscription.id} className="grid gap-3 px-4 py-4 lg:grid-cols-[1fr_auto]">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={subscription.status === "ACTIVE" || subscription.status === "TRIALING" ? "green" : subscription.status === "PAST_DUE" ? "amber" : "neutral"}>{subscription.status}</Badge>
                        <span className="text-sm font-semibold">{subscription.user.email}</span>
                        <span className="text-xs text-slate-500">{subscription.plan.name} · {subscription.provider} · {subscription.billingCycle}</span>
                      </div>
                      <p className="mt-2 truncate font-mono text-xs text-slate-500">{subscription.providerSubscriptionId || subscription.id}</p>
                      <p className="mt-1 text-xs text-slate-400">Renews {subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toLocaleString() : "not set"} {subscription.cancelAtPeriodEnd ? "· cancels at period end" : ""}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <IconButton disabled title="Provider sync will use provider customer portal/API in the next billing hardening pass."><RefreshCw className="size-4" />Sync</IconButton>
                      {subscription.status !== "CANCELED" ? (
                        <IconButton onClick={() => cancelSubscription(subscription.id)} disabled={saving[`subscription-${subscription.id}`]}><XCircle className="size-4" />Cancel</IconButton>
                      ) : (
                        <span className="text-xs text-slate-500">Cancelled</span>
                      )}
                    </div>
                  </div>
                ))}
                {!subscriptions.length && <div className="px-4 py-10 text-center text-sm text-slate-500">{loading.billing ? "Loading subscriptions..." : "No subscriptions yet."}</div>}
              </div>
            </Panel>

            <Panel className="overflow-hidden">
              <div className="border-b border-slate-200 px-4 py-3 dark:border-white/[0.08]">
                <h3 className="text-sm font-semibold">Invoices</h3>
                <p className="text-xs text-slate-500">Recent provider invoices and hosted invoice links.</p>
              </div>
              <div className="divide-y divide-slate-200 dark:divide-white/[0.08]">
                {invoices.map((invoice) => (
                  <div key={invoice.id} className="grid gap-3 px-4 py-4 lg:grid-cols-[1fr_auto]">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={invoice.status === "PAID" ? "green" : invoice.status === "OPEN" ? "amber" : "neutral"}>{invoice.status}</Badge>
                        <span className="text-sm font-semibold">{invoice.user.email}</span>
                        <span className="text-xs text-slate-500">{formatMoney(invoice.amount, invoice.currency)} · {invoice.provider}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">{invoice.plan?.name || "No plan"} · {new Date(invoice.createdAt).toLocaleString()}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {invoice.hostedInvoiceUrl ? <a className="inline-flex h-9 items-center rounded-md border border-slate-200 px-3 text-sm dark:border-white/[0.1]" href={invoice.hostedInvoiceUrl} target="_blank" rel="noreferrer">Open</a> : <IconButton disabled>No link</IconButton>}
                    </div>
                  </div>
                ))}
                {!invoices.length && <div className="px-4 py-10 text-center text-sm text-slate-500">{loading.billing ? "Loading invoices..." : "No invoices yet."}</div>}
              </div>
            </Panel>
          </div>

          <Panel className="mt-4 overflow-hidden">
            <div className="border-b border-slate-200 px-4 py-3 dark:border-white/[0.08]">
              <h3 className="text-sm font-semibold">Payment Events</h3>
              <p className="text-xs text-slate-500">Webhook and admin billing actions. Raw secrets are never shown.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-white/[0.08]">
                  <tr><th className="px-4 py-3">Event</th><th className="px-4 py-3">User</th><th className="px-4 py-3">Provider</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Time</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-white/[0.08]">
                  {paymentEvents.map((event) => (
                    <tr key={event.id}>
                      <td className="px-4 py-3 font-mono text-xs">{event.type}</td>
                      <td className="px-4 py-3">{event.user?.email || "System"}</td>
                      <td className="px-4 py-3">{event.provider}</td>
                      <td className="px-4 py-3">{event.amount ? formatMoney(event.amount, event.currency || "USD") : "-"}</td>
                      <td className="px-4 py-3"><Badge tone={event.status === "PROCESSED" ? "green" : event.status === "FAILED" ? "red" : "neutral"}>{event.status}</Badge></td>
                      <td className="px-4 py-3 text-xs text-slate-500">{new Date(event.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!paymentEvents.length && <div className="px-4 py-10 text-center text-sm text-slate-500">{loading.billing ? "Loading payment events..." : "No payment events yet."}</div>}
            </div>
          </Panel>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {[
              ["Provider settings", "Configure Stripe, Razorpay, or Manual from Billing / Payments settings."],
              ["Manual fallback", "Admins can still assign plans and grant credits without payment provider checkout."],
              ["Plan enforcement", "Active subscriptions use DB plan limits; expired users fall back through plan assignment rules."],
            ].map(([title, copy]) => <Panel key={title} className="p-4"><CreditCard className="mb-3 size-4 text-violet-600" /><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-sm text-slate-500">{copy}</p></Panel>)}
          </div>
        </>
      )}

      {tab === "users" && (
        <>
          <SectionTitle title="Users" description="View users, update roles, assign plans, grant credits, and reset usage. Role changes are owner-only." action={<IconButton onClick={fetchUsers}><RefreshCw className={cx("size-4", loading.users && "animate-spin")} />Refresh</IconButton>} />
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          <Panel className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-white/[0.08]">
                  <tr><th className="px-4 py-3">Email</th><th className="px-4 py-3">Name</th><th className="px-4 py-3">Provider</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Plan</th><th className="px-4 py-3">Joined</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-white/[0.08]">
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td className="px-4 py-3 font-mono text-xs">{user.email}</td>
                      <td className="px-4 py-3">{user.name || "-"}</td>
                      <td className="px-4 py-3 text-slate-500">{user.authProvider || "-"}</td>
                      <td className="px-4 py-3"><select value={user.role} disabled={!isOwner || updatingUser === user.id} onChange={(event) => updateRole(user.id, event.target.value as UserRow["role"])} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs dark:border-white/[0.1] dark:bg-black/20"><option value="USER">USER</option><option value="ADMIN">ADMIN</option><option value="OWNER">OWNER</option></select></td>
                      <td className="px-4 py-3"><button onClick={() => loadUserPlan(user.id)} className="rounded-md border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50 dark:border-white/[0.1] dark:hover:bg-white/[0.04]">Manage</button></td>
                      <td className="px-4 py-3 text-slate-500">{new Date(user.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                  {!users.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">{loading.users ? "Loading users..." : "No users found."}</td></tr>}
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel className="p-4">
            <h3 className="text-sm font-semibold">User Plan</h3>
            {!selectedUserPlan ? (
              <p className="mt-3 text-sm text-slate-500">Select Manage on a user to assign plans or adjust usage.</p>
            ) : (
              <div className="mt-4 space-y-4">
                <div>
                  <p className="text-sm font-semibold">{selectedUserPlan.user.email}</p>
                  <p className="text-xs text-slate-500">Current: {selectedUserPlan.usage.plan.name}</p>
                </div>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Assign Plan</span>
                  <select value={selectedUserPlan.usage.plan.id} onChange={(event) => updateUserPlan({ action: "assign", planId: event.target.value })} disabled={saving.userPlan} className="h-10 rounded-md border border-slate-200 bg-white px-3 dark:border-white/[0.1] dark:bg-black/20">
                    {selectedUserPlan.plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
                  </select>
                </label>
                <div className="grid gap-2 text-xs">
                  {(["FIVE_HOUR", "WEEKLY", "MONTHLY"] as const).map((type) => {
                    const window = selectedUserPlan.usage.windows[type];
                    const pct = window.creditsLimit ? Math.min(100, Math.round((window.creditsUsed / window.creditsLimit) * 100)) : 0;
                    return <div key={type} className="rounded-md border border-slate-200 p-3 dark:border-white/[0.1]"><div className="flex justify-between"><span>{type.replace("_", " ")}</span><span>{window.creditsUsed.toLocaleString()} / {window.creditsLimit.toLocaleString()}</span></div><div className="mt-2 h-2 rounded-full bg-slate-100 dark:bg-white/10"><div className="h-2 rounded-full bg-violet-600" style={{ width: `${pct}%` }} /></div><p className="mt-1 text-slate-500">Resets {new Date(window.resetAt).toLocaleString()}</p></div>;
                  })}
                </div>
                <div className="flex gap-2">
                  <input value={grantCredits} onChange={(event) => setGrantCredits(event.target.value)} type="number" min={1} className="h-9 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-white/[0.1] dark:bg-black/20" />
                  <IconButton onClick={() => updateUserPlan({ action: "grant", credits: Number(grantCredits), reason: "Master panel grant" })} disabled={saving.userPlan}>Grant</IconButton>
                </div>
                <IconButton onClick={() => updateUserPlan({ action: "reset", reason: "Master panel reset" })} disabled={saving.userPlan}><RotateCcw className="size-4" />Reset usage</IconButton>
                <div className="space-y-2 pt-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recent usage</p>
                  {(selectedUserPlan.transactions || []).slice(0, 8).map((tx) => {
                    const meta = tx.metadataJson || {};
                    const spike = tx.type === "USAGE" && tx.credits > Math.max(100, selectedUserPlan.usage.plan.fiveHourCredits * 0.5);
                    return <div key={tx.id} className="rounded-md border border-slate-200 p-2 text-xs dark:border-white/[0.1]"><div className="flex justify-between gap-3"><span>{tx.type}{spike ? " · spike" : ""}</span><span className={spike ? "text-amber-600" : ""}>{tx.credits}</span></div><div className="mt-1 truncate text-slate-500">{String(meta.model || tx.reason || "-")}</div><div className="mt-1 text-slate-400">{new Date(tx.createdAt).toLocaleString()}</div></div>;
                  })}
                  {!selectedUserPlan.transactions?.length && <p className="text-xs text-slate-500">No usage transactions yet.</p>}
                </div>
              </div>
            )}
          </Panel>
          </div>
        </>
      )}

      {tab === "audit" && (
        <>
          <SectionTitle title="Audit Logs" description="Config changes, secret updates, role updates, and admin actions." action={<IconButton onClick={fetchAudit}><RefreshCw className={cx("size-4", loading.audit && "animate-spin")} />Refresh</IconButton>} />
          <Panel className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-white/[0.08]"><tr><th className="px-4 py-3">Action</th><th className="px-4 py-3">Resource</th><th className="px-4 py-3">Actor</th><th className="px-4 py-3">IP</th><th className="px-4 py-3">Time</th></tr></thead>
                <tbody className="divide-y divide-slate-200 dark:divide-white/[0.08]">
                  {auditLogs.map((log) => <tr key={log.id}><td className="px-4 py-3"><Badge tone="blue">{log.action}</Badge></td><td className="px-4 py-3 font-mono text-xs text-slate-500">{log.resource || "-"}</td><td className="px-4 py-3 text-slate-500">{log.userId || "-"}</td><td className="px-4 py-3 font-mono text-xs text-slate-500">{log.ipAddress || "-"}</td><td className="px-4 py-3 text-slate-500">{new Date(log.createdAt).toLocaleString()}</td></tr>)}
                  {!auditLogs.length && <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">{loading.audit ? "Loading audit logs..." : "No audit logs found."}</td></tr>}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}

      {tab === "diagnostics" && (
        <>
          <SectionTitle title="Diagnostics" description="API health, auth health, provider health, storage health, and deployment metadata." action={<IconButton onClick={fetchOverview}><RefreshCw className={cx("size-4", loading.overview && "animate-spin")} />Refresh</IconButton>} />
          <div className="grid gap-4 md:grid-cols-2">
            {Object.entries(checks).map(([name, check]) => <Panel key={name} className="p-4"><div className="flex items-center justify-between"><p className="text-sm font-medium capitalize">{name.replace(/([A-Z])/g, " $1")}</p><Badge tone={statusTone(check.status)}>{check.status}</Badge></div>{check.latencyMs !== undefined && <p className="mt-2 text-xs text-slate-500">{check.latencyMs}ms response time</p>}</Panel>)}
            {overview?.awsMeta && Object.entries(overview.awsMeta).filter(([, value]) => value).map(([key, value]) => <Panel key={key} className="p-4"><p className="text-xs uppercase tracking-wide text-slate-500">{key}</p><p className="mt-2 break-all font-mono text-sm">{value}</p></Panel>)}
          </div>
        </>
      )}
    </div>
  );
}
