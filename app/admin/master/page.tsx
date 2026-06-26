"use client";

import { useSession, signOut } from "next-auth/react";
import { redirect } from "next/navigation";
import type { ElementType, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ChevronRight,
  Cloud,
  Code2,
  Copy,
  Database,
  FileText,
  Globe,
  Key,
  Loader2,
  Lock,
  LogOut,
  Monitor,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Server,
  Settings,
  Shield,
  TestTube2,
  Users,
  Zap,
} from "lucide-react";

type TabId = "overview" | "ai" | "vault" | "integrations" | "runtime" | "users" | "audit" | "diagnostics";

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
  metadata?: Record<string, unknown> | null;
}

interface UserRow {
  id: string;
  email: string;
  name?: string | null;
  role: "USER" | "ADMIN" | "OWNER";
  authProvider?: string;
  createdAt: string;
  updatedAt?: string;
}

type Toast = { id: number; tone: "success" | "error" | "info"; message: string };

const tabs: { id: TabId; label: string; icon: ElementType }[] = [
  { id: "overview", label: "Overview", icon: Activity },
  { id: "ai", label: "AI Models", icon: Code2 },
  { id: "vault", label: "Credentials Vault", icon: Key },
  { id: "integrations", label: "Integrations", icon: Zap },
  { id: "runtime", label: "Runtime", icon: Settings },
  { id: "users", label: "Users", icon: Users },
  { id: "audit", label: "Audit Logs", icon: FileText },
  { id: "diagnostics", label: "Diagnostics", icon: Monitor },
];

const groups = [
  { category: "openrouter", label: "OpenRouter", icon: Zap },
  { category: "qwen", label: "Qwen3-Coder", icon: Code2 },
  { category: "search", label: "Search Providers", icon: Search },
  { category: "r2", label: "Cloudflare R2", icon: Cloud },
  { category: "oauth", label: "Auth Providers", icon: Globe },
  { category: "aws", label: "AWS / Deployment", icon: Server },
  { category: "runtime", label: "App Runtime", icon: Settings },
  { category: "auth", label: "Boot Auth", icon: Lock },
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

const runtimeKeys = [
  "APP_PUBLIC_URL",
  "NEXTAUTH_URL",
  "AUTH_URL",
  "AWS_REGION",
  "AWS_PUBLIC_IP",
  "AWS_INSTANCE_ID",
];

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "green" | "red" | "amber" | "blue" | "neutral" }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium",
        tone === "green" && "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
        tone === "red" && "border-red-500/20 bg-red-500/10 text-red-300",
        tone === "amber" && "border-amber-500/20 bg-amber-500/10 text-amber-300",
        tone === "blue" && "border-sky-500/20 bg-sky-500/10 text-sky-300",
        tone === "neutral" && "border-white/10 bg-white/[0.04] text-slate-300"
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

function StatusDot({ status }: { status?: string }) {
  const healthy = status === "ok" || status === "configured" || status === "active";
  const bad = status === "error" || status === "misconfigured" || status === "missing";
  return <span className={cx("size-2 rounded-full", healthy && "bg-emerald-400", bad && "bg-red-400", !healthy && !bad && "bg-amber-400")} />;
}

function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-lg border border-white/[0.08] bg-white/[0.025]", className)}>{children}</div>;
}

function SectionTitle({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {description && <p className="mt-1 text-sm text-slate-400">{description}</p>}
      </div>
      {action}
    </div>
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

function fmtUptime(seconds = 0) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function MasterAdminPage() {
  const { data: session, status: sessionStatus } = useSession();
  const role = session?.user?.role;
  const isOwner = role === "OWNER";

  const [tab, setTab] = useState<TabId>("overview");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [settings, setSettings] = useState<SettingRow[]>([]);
  const [vaultOk, setVaultOk] = useState(false);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState({ overview: true, settings: true, users: false, audit: false });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmRestart, setConfirmRestart] = useState(false);
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
    fetchOverview();
    fetchSettings();
  }, [fetchOverview, fetchSettings]);

  useEffect(() => {
    const section = new URLSearchParams(window.location.search).get("section") as TabId | null;
    if (section && tabs.some((item) => item.id === section)) {
      setTab(section);
    }
  }, []);

  useEffect(() => {
    if (tab === "users") fetchUsers();
    if (tab === "audit") fetchAudit();
  }, [tab, fetchUsers, fetchAudit]);

  const settingMap = useMemo(() => new Map(settings.map((setting) => [setting.key, setting])), [settings]);
  const stats = overview?.stats ?? { users: 0, projects: 0, conversations: 0, messages: 0, vaultKeys: 0 };
  const system = overview?.system ?? { totalMemMb: 0, usedMemMb: 0, memPercent: 0, cpuLoad1: "0.00", cpus: 0, uptimeSeconds: 0 };
  const checks = overview?.checks ?? {};
  const activeModel = settingMap.get("OPENROUTER_MODEL")?.maskedValue ?? "qwen/qwen3-coder:free";
  const activeProvider = settingMap.get("MELDEX_BRAIN_PROVIDER")?.maskedValue ?? "openrouter";
  const statCards = [
    { label: "Users", value: stats.users, icon: Users },
    { label: "Projects", value: stats.projects, icon: Database },
    { label: "Conversations", value: stats.conversations, icon: FileText },
    { label: "Vault Keys", value: stats.vaultKeys, icon: Key },
  ];

  if (sessionStatus === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b0f17] text-slate-400">
        <SpinnerText label="Loading Master Panel" />
      </div>
    );
  }

  if (!role || !["ADMIN", "OWNER"].includes(role)) redirect("/unauthorized");

  async function readError(res: Response) {
    const data = await res.json().catch(() => null);
    return data?.error || data?.message || `Request failed (${res.status})`;
  }

  async function saveSetting(row: SettingRow) {
    const value = edits[row.key]?.trim();
    if (!value) {
      pushToast("error", "Enter a value before saving.");
      return;
    }
    if (row.isSecret && !isOwner) {
      pushToast("error", "Owner access is required to update secrets.");
      return;
    }
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
      pushToast("success", data.requireRestart ? "Saved. Restart is required for this setting." : "Saved and ready.");
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

  async function testAll() {
    await Promise.all(integrations.map((item) => testConnection(item.id)));
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
    if (!isOwner) {
      pushToast("error", "Owner access is required to sync ENV into vault.");
      return;
    }
    setSyncing(true);
    try {
      const res = await fetch("/api/admin/master/sync-env", { method: "POST" });
      if (!res.ok) throw new Error(await readError(res));
      const data = await res.json();
      pushToast("success", `Synced ${data.synced ?? 0} setting(s) into vault.`);
      await Promise.all([fetchSettings(), fetchAudit()]);
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function restartApp() {
    if (!isOwner) {
      pushToast("error", "Owner access is required to restart the app.");
      return;
    }
    setRestarting(true);
    try {
      const res = await fetch("/api/admin/master/restart", { method: "POST" });
      if (!res.ok) throw new Error(await readError(res));
      pushToast("success", "Restart initiated. Refresh in a few seconds.");
      setConfirmRestart(false);
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
    if (!isOwner) {
      pushToast("error", "Owner access is required to update user roles.");
      return;
    }
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

  function renderSettingRows(rows: SettingRow[]) {
    if (!rows.length) {
      return <div className="px-4 py-8 text-center text-sm text-slate-500">No settings in this section.</div>;
    }

    return rows.map((row) => {
      const cannotSaveSecret = row.isSecret && !isOwner;
      const disabled = saving[row.key] || !edits[row.key]?.trim() || cannotSaveSecret || (row.isSecret && !vaultOk);
      return (
        <div key={row.key} className="grid gap-3 border-t border-white/[0.06] px-4 py-4 first:border-t-0 lg:grid-cols-[1fr_360px]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <code className="text-xs text-slate-100">{row.key}</code>
              <SourceBadge source={row.source} />
              {row.hotReload && !row.requireRestart && <Badge tone="green">hot reload</Badge>}
              {row.requireRestart && <Badge tone="amber">restart</Badge>}
              {row.isSecret && <Badge tone="neutral">secret</Badge>}
            </div>
            <p className="mt-1 text-sm text-slate-300">{row.label}</p>
            {row.description && <p className="mt-1 text-xs text-slate-500">{row.description}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="font-mono">{row.maskedValue || "not configured"}</span>
              {row.maskedValue && (
                <button onClick={() => copyMasked(row.maskedValue)} className="inline-flex items-center gap-1 text-slate-400 hover:text-white">
                  <Copy className="size-3" />
                  Copy masked
                </button>
              )}
              {row.updatedAt && <span>Updated {new Date(row.updatedAt).toLocaleString()}</span>}
              {row.updatedBy && <span>by {row.updatedBy}</span>}
            </div>
          </div>
          <div className="flex items-start gap-2">
            <input
              type={row.isSecret ? "password" : "text"}
              value={edits[row.key] ?? ""}
              onChange={(event) => setEdits((prev) => ({ ...prev, [row.key]: event.target.value }))}
              disabled={cannotSaveSecret}
              placeholder={cannotSaveSecret ? "Owner only" : row.configured ? "Replace value" : "Enter value"}
              className="h-9 min-w-0 flex-1 rounded-md border border-white/[0.1] bg-black/25 px-3 text-sm text-white placeholder:text-slate-600 outline-none transition focus:border-sky-400/50 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <button
              onClick={() => saveSetting(row)}
              disabled={disabled}
              title={cannotSaveSecret ? "Owner access required" : undefined}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-white/[0.1] bg-white/[0.05] px-3 text-xs font-medium text-slate-100 transition hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving[row.key] ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
              Save
            </button>
          </div>
        </div>
      );
    });
  }

  return (
    <div className="min-h-screen bg-[#0b0f17] text-white">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-40 bg-gradient-to-b from-white/[0.04] to-transparent" />

      <div className="fixed right-4 top-4 z-50 space-y-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cx(
              "flex w-[340px] items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-2xl backdrop-blur",
              toast.tone === "success" && "border-emerald-500/20 bg-emerald-950/80 text-emerald-100",
              toast.tone === "error" && "border-red-500/20 bg-red-950/80 text-red-100",
              toast.tone === "info" && "border-sky-500/20 bg-sky-950/80 text-sky-100"
            )}
          >
            <StatusDot status={toast.tone === "success" ? "ok" : toast.tone === "error" ? "error" : "info"} />
            <span>{toast.message}</span>
          </div>
        ))}
      </div>

      {confirmRestart && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/70 px-4">
          <Panel className="w-full max-w-md p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="grid size-10 place-items-center rounded-lg bg-red-500/10 text-red-300">
                <RotateCcw className="size-5" />
              </span>
              <div>
                <h3 className="font-semibold text-white">Restart Meldex AI?</h3>
                <p className="mt-1 text-sm text-slate-400">The app may be unavailable briefly while PM2 restarts the production process.</p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setConfirmRestart(false)} className="rounded-md border border-white/[0.1] px-3 py-2 text-sm text-slate-300 hover:bg-white/[0.05]">
                Cancel
              </button>
              <button onClick={restartApp} disabled={restarting} className="rounded-md border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-200 hover:bg-red-500/15 disabled:opacity-50">
                {restarting ? <SpinnerText label="Restarting" /> : "Restart app"}
              </button>
            </div>
          </Panel>
        </div>
      )}

      <header className="sticky top-0 z-20 border-b border-white/[0.08] bg-[#0b0f17]/90 backdrop-blur">
        <div className="flex h-16 items-center justify-between px-5">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-lg border border-white/[0.1] bg-white/[0.04] text-sky-300">
              <Shield className="size-4" />
            </span>
            <div>
              <p className="text-sm font-semibold">Master Panel</p>
              <p className="text-xs text-slate-500">{overview?.appUrl ?? "Meldex AI Runtime Control"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={isOwner ? "amber" : "blue"}>{role}</Badge>
            <button onClick={() => signOut({ callbackUrl: "/master/login" })} className="inline-flex items-center gap-2 rounded-md border border-white/[0.1] px-3 py-2 text-xs text-slate-300 hover:bg-white/[0.05]">
              <LogOut className="size-3.5" />
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="grid min-h-[calc(100vh-64px)] grid-cols-1 lg:grid-cols-[240px_1fr]">
        <aside className="border-r border-white/[0.08] px-3 py-4">
          <nav className="space-y-1">
            {tabs.map((item) => (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={cx(
                  "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition",
                  tab === item.id ? "bg-white/[0.08] text-white" : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
                )}
              >
                <item.icon className="size-4" />
                {item.label}
                {tab === item.id && <ChevronRight className="ml-auto size-3.5 text-slate-500" />}
              </button>
            ))}
          </nav>
        </aside>

        <main className="relative px-4 py-6 sm:px-6">
          <div className="mx-auto max-w-7xl space-y-6">
            {tab === "overview" && (
              <>
                <SectionTitle
                  title="Overview"
                  description="System health, active provider, model, database, storage, auth, and server state."
                  action={
                    <button onClick={fetchOverview} className="inline-flex items-center gap-2 rounded-md border border-white/[0.1] px-3 py-2 text-sm text-slate-200 hover:bg-white/[0.05]">
                      <RefreshCw className={cx("size-4", loading.overview && "animate-spin")} />
                      Refresh
                    </button>
                  }
                />
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {statCards.map(({ label, value, icon: Icon }) => (
                    <Panel key={label} className="p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
                        <Icon className="size-4 text-slate-500" />
                      </div>
                      <p className="mt-3 text-2xl font-semibold text-white">{value.toLocaleString()}</p>
                    </Panel>
                  ))}
                </div>
                <div className="grid gap-4 lg:grid-cols-3">
                  <Panel className="p-5 lg:col-span-2">
                    <h3 className="text-sm font-semibold text-white">Service Health</h3>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      {Object.entries(checks).map(([name, check]) => (
                        <div key={name} className="flex items-center justify-between rounded-md border border-white/[0.06] bg-black/20 px-3 py-2">
                          <span className="flex items-center gap-2 text-sm text-slate-300">
                            <StatusDot status={check.status} />
                            {name.replace(/([A-Z])/g, " $1")}
                          </span>
                          <span className="text-xs text-slate-500">{check.latencyMs !== undefined ? `${check.latencyMs}ms` : check.status}</span>
                        </div>
                      ))}
                    </div>
                  </Panel>
                  <Panel className="p-5">
                    <h3 className="text-sm font-semibold text-white">Runtime Snapshot</h3>
                    <dl className="mt-4 space-y-3 text-sm">
                      <div className="flex justify-between gap-4"><dt className="text-slate-500">Provider</dt><dd className="text-slate-200">{activeProvider}</dd></div>
                      <div className="flex justify-between gap-4"><dt className="text-slate-500">Model</dt><dd className="truncate text-slate-200">{activeModel}</dd></div>
                      <div className="flex justify-between gap-4"><dt className="text-slate-500">Node</dt><dd className="text-slate-200">{overview?.nodeVersion ?? "-"}</dd></div>
                      <div className="flex justify-between gap-4"><dt className="text-slate-500">Memory</dt><dd className="text-slate-200">{system.memPercent}%</dd></div>
                      <div className="flex justify-between gap-4"><dt className="text-slate-500">Uptime</dt><dd className="text-slate-200">{fmtUptime(system.uptimeSeconds)}</dd></div>
                    </dl>
                  </Panel>
                </div>
              </>
            )}

            {tab === "ai" && (
              <>
                <SectionTitle
                  title="AI Models"
                  description="Qwen3-Coder is the active coding brain. Runtime-editable model settings use vault first."
                  action={<button onClick={() => testConnection("openrouter")} className="inline-flex items-center gap-2 rounded-md border border-white/[0.1] px-3 py-2 text-sm text-slate-200 hover:bg-white/[0.05]"><TestTube2 className="size-4" />Test model</button>}
                />
                <Panel>
                  <div className="border-b border-white/[0.06] p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="green">Coding Brain</Badge>
                      <Badge tone="blue">OpenRouter</Badge>
                      <Badge tone="neutral">Qwen3-Coder only</Badge>
                    </div>
                  </div>
                  {renderSettingRows(settings.filter((row) => aiKeys.includes(row.key)))}
                </Panel>
              </>
            )}

            {tab === "vault" && (
              <>
                <SectionTitle
                  title="Credentials Vault"
                  description="Secrets are masked in the browser. Raw secret reveal is disabled; replace values instead."
                />
                {!vaultOk && (
                  <Panel className="border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-200">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="mt-0.5 size-4" />
                      <div>
                        <p className="font-medium">Vault encryption is not configured.</p>
                        <p className="mt-1 text-amber-200/75">Set SETTINGS_ENCRYPTION_KEY before saving secrets.</p>
                      </div>
                    </div>
                  </Panel>
                )}
                <div className="space-y-4">
                  {groups.map((group) => {
                    const rows = settings.filter((setting) => setting.category === group.category);
                    if (!rows.length) return null;
                    return (
                      <Panel key={group.category} className="overflow-hidden">
                        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
                          <div className="flex items-center gap-2">
                            <group.icon className="size-4 text-slate-400" />
                            <h3 className="text-sm font-semibold text-white">{group.label}</h3>
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
                <SectionTitle
                  title="Integrations"
                  description="Run safe connection tests and see provider-specific diagnostics."
                  action={<button onClick={testAll} className="inline-flex items-center gap-2 rounded-md border border-white/[0.1] px-3 py-2 text-sm text-slate-200 hover:bg-white/[0.05]"><TestTube2 className="size-4" />Test all</button>}
                />
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {integrations.map((item) => {
                    const result = testResults[item.id];
                    return (
                      <Panel key={item.id} className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <span className="grid size-9 place-items-center rounded-md border border-white/[0.08] bg-white/[0.04] text-slate-300">
                              <item.icon className="size-4" />
                            </span>
                            <div>
                              <p className="text-sm font-semibold text-white">{item.label}</p>
                              <p className="text-xs text-slate-500">{result?.lastCheckedAt ? new Date(result.lastCheckedAt).toLocaleTimeString() : "Not tested"}</p>
                            </div>
                          </div>
                          <StatusDot status={result?.status} />
                        </div>
                        {result && (
                          <div className="mt-4 rounded-md border border-white/[0.06] bg-black/20 p-3 text-xs">
                            <p className="text-slate-200">{result.message}</p>
                            <p className="mt-1 text-slate-500">{result.latencyMs}ms</p>
                            {result.extra && Object.entries(result.extra).filter(([, value]) => value).map(([key, value]) => (
                              <p key={key} className="mt-1 break-all font-mono text-slate-500">{key}: {value}</p>
                            ))}
                          </div>
                        )}
                        <button onClick={() => testConnection(item.id)} disabled={testing[item.id]} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md border border-white/[0.1] px-3 py-2 text-sm text-slate-200 hover:bg-white/[0.05] disabled:opacity-50">
                          {testing[item.id] ? <SpinnerText label="Testing" /> : <><TestTube2 className="size-4" />Test connection</>}
                        </button>
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
                  <Panel className="p-4">
                    <h3 className="text-sm font-semibold text-white">Reload Config</h3>
                    <p className="mt-2 text-sm text-slate-400">Clears runtime cache and retests the active model without PM2 restart.</p>
                    <button onClick={reloadConfig} disabled={reloading} className="mt-4 inline-flex items-center gap-2 rounded-md border border-white/[0.1] px-3 py-2 text-sm text-slate-200 hover:bg-white/[0.05] disabled:opacity-50">
                      {reloading ? <SpinnerText label="Reloading" /> : <><RefreshCw className="size-4" />Reload config</>}
                    </button>
                  </Panel>
                  <Panel className="p-4">
                    <h3 className="text-sm font-semibold text-white">Sync ENV to Vault</h3>
                    <p className="mt-2 text-sm text-slate-400">Imports runtime-editable environment values. Existing vault values are preserved.</p>
                    <button onClick={syncEnv} disabled={!isOwner || !vaultOk || syncing} className="mt-4 inline-flex items-center gap-2 rounded-md border border-white/[0.1] px-3 py-2 text-sm text-slate-200 hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-40">
                      {syncing ? <SpinnerText label="Syncing" /> : <><Database className="size-4" />Sync ENV to Vault</>}
                    </button>
                    {!isOwner && <p className="mt-2 text-xs text-slate-500">Owner access required.</p>}
                  </Panel>
                  <Panel className="p-4">
                    <h3 className="text-sm font-semibold text-white">Restart App</h3>
                    <p className="mt-2 text-sm text-slate-400">Use only for boot-critical settings or OAuth provider registration changes.</p>
                    <button onClick={() => setConfirmRestart(true)} disabled={!isOwner} className="mt-4 inline-flex items-center gap-2 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200 hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-40">
                      <RotateCcw className="size-4" />
                      Restart app
                    </button>
                    {!isOwner && <p className="mt-2 text-xs text-slate-500">Owner access required.</p>}
                  </Panel>
                </div>
                <Panel>
                  <div className="border-b border-white/[0.06] px-4 py-3">
                    <h3 className="text-sm font-semibold text-white">Runtime Sources</h3>
                  </div>
                  {renderSettingRows(settings.filter((row) => runtimeKeys.includes(row.key)))}
                </Panel>
              </>
            )}

            {tab === "users" && (
              <>
                <SectionTitle title="Users" description="View users and update roles. Role changes are owner-only." action={<button onClick={fetchUsers} className="inline-flex items-center gap-2 rounded-md border border-white/[0.1] px-3 py-2 text-sm text-slate-200 hover:bg-white/[0.05]"><RefreshCw className={cx("size-4", loading.users && "animate-spin")} />Refresh</button>} />
                <Panel className="overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b border-white/[0.06] text-left text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-3">Email</th>
                          <th className="px-4 py-3">Name</th>
                          <th className="px-4 py-3">Provider</th>
                          <th className="px-4 py-3">Role</th>
                          <th className="px-4 py-3">Joined</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.06]">
                        {users.map((user) => (
                          <tr key={user.id}>
                            <td className="px-4 py-3 font-mono text-xs text-slate-200">{user.email}</td>
                            <td className="px-4 py-3 text-slate-300">{user.name || "-"}</td>
                            <td className="px-4 py-3 text-slate-400">{user.authProvider || "-"}</td>
                            <td className="px-4 py-3">
                              <select
                                value={user.role}
                                disabled={!isOwner || updatingUser === user.id}
                                onChange={(event) => updateRole(user.id, event.target.value as UserRow["role"])}
                                className="rounded-md border border-white/[0.1] bg-black/30 px-2 py-1 text-xs text-white disabled:opacity-50"
                              >
                                <option value="USER">USER</option>
                                <option value="ADMIN">ADMIN</option>
                                <option value="OWNER">OWNER</option>
                              </select>
                            </td>
                            <td className="px-4 py-3 text-slate-500">{new Date(user.createdAt).toLocaleDateString()}</td>
                          </tr>
                        ))}
                        {!users.length && (
                          <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">{loading.users ? "Loading users..." : "No users found."}</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </Panel>
              </>
            )}

            {tab === "audit" && (
              <>
                <SectionTitle title="Audit Logs" description="Config changes, secret updates, role updates, and admin actions." action={<button onClick={fetchAudit} className="inline-flex items-center gap-2 rounded-md border border-white/[0.1] px-3 py-2 text-sm text-slate-200 hover:bg-white/[0.05]"><RefreshCw className={cx("size-4", loading.audit && "animate-spin")} />Refresh</button>} />
                <Panel className="overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b border-white/[0.06] text-left text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-3">Action</th>
                          <th className="px-4 py-3">Resource</th>
                          <th className="px-4 py-3">Actor</th>
                          <th className="px-4 py-3">IP</th>
                          <th className="px-4 py-3">Time</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.06]">
                        {auditLogs.map((log) => (
                          <tr key={log.id}>
                            <td className="px-4 py-3"><Badge tone={log.action.includes("DELETE") || log.action.includes("RESTART") ? "amber" : "blue"}>{log.action}</Badge></td>
                            <td className="px-4 py-3 font-mono text-xs text-slate-400">{log.resource || "-"}</td>
                            <td className="px-4 py-3 text-slate-400">{log.userId || "-"}</td>
                            <td className="px-4 py-3 font-mono text-xs text-slate-500">{log.ipAddress || "-"}</td>
                            <td className="px-4 py-3 text-slate-500">{new Date(log.createdAt).toLocaleString()}</td>
                          </tr>
                        ))}
                        {!auditLogs.length && (
                          <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">{loading.audit ? "Loading audit logs..." : "No audit logs found."}</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </Panel>
              </>
            )}

            {tab === "diagnostics" && (
              <>
                <SectionTitle title="Diagnostics" description="API health, auth health, provider health, storage health, and deployment metadata." action={<button onClick={fetchOverview} className="inline-flex items-center gap-2 rounded-md border border-white/[0.1] px-3 py-2 text-sm text-slate-200 hover:bg-white/[0.05]"><RefreshCw className={cx("size-4", loading.overview && "animate-spin")} />Refresh</button>} />
                <div className="grid gap-4 md:grid-cols-2">
                  {Object.entries(checks).map(([name, check]) => (
                    <Panel key={name} className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <StatusDot status={check.status} />
                          <p className="text-sm font-medium capitalize text-white">{name.replace(/([A-Z])/g, " $1")}</p>
                        </div>
                        <Badge tone={check.status === "ok" || check.status === "configured" ? "green" : check.status === "error" || check.status === "misconfigured" ? "red" : "amber"}>{check.status}</Badge>
                      </div>
                      {check.latencyMs !== undefined && <p className="mt-2 text-xs text-slate-500">{check.latencyMs}ms response time</p>}
                    </Panel>
                  ))}
                  {overview?.awsMeta && Object.entries(overview.awsMeta).filter(([, value]) => value).map(([key, value]) => (
                    <Panel key={key} className="p-4">
                      <p className="text-xs uppercase tracking-wide text-slate-500">{key}</p>
                      <p className="mt-2 break-all font-mono text-sm text-slate-200">{value}</p>
                    </Panel>
                  ))}
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
