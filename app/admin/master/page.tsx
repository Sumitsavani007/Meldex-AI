"use client";

import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import type { ElementType, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  Code2,
  Copy,
  Database,
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
}

interface UserRow {
  id: string;
  email: string;
  name?: string | null;
  role: "USER" | "ADMIN" | "OWNER";
  authProvider?: string;
  createdAt: string;
}

type Toast = { id: number; tone: "success" | "error" | "info"; message: string };

const groups: Array<{ category: string; label: string; icon: ElementType }> = [
  { category: "openrouter", label: "OpenRouter", icon: Zap },
  { category: "qwen", label: "Qwen3-Coder", icon: Code2 },
  { category: "search", label: "Search Providers", icon: Search },
  { category: "r2", label: "Cloudflare R2", icon: Cloud },
  { category: "oauth", label: "Auth Providers", icon: Globe },
  { category: "aws", label: "AWS / Deployment", icon: Server },
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
  return value && ["overview", "ai", "vault", "integrations", "runtime", "users", "audit", "diagnostics"].includes(value) ? value : "overview";
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

function IconButton({ children, onClick, disabled }: { children: ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
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
    if (tab === "users") fetchUsers();
    if (tab === "audit") fetchAudit();
  }, [tab, fetchUsers, fetchAudit]);

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

      {tab === "users" && (
        <>
          <SectionTitle title="Users" description="View users and update roles. Role changes are owner-only." action={<IconButton onClick={fetchUsers}><RefreshCw className={cx("size-4", loading.users && "animate-spin")} />Refresh</IconButton>} />
          <Panel className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-white/[0.08]">
                  <tr><th className="px-4 py-3">Email</th><th className="px-4 py-3">Name</th><th className="px-4 py-3">Provider</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Joined</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-white/[0.08]">
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td className="px-4 py-3 font-mono text-xs">{user.email}</td>
                      <td className="px-4 py-3">{user.name || "-"}</td>
                      <td className="px-4 py-3 text-slate-500">{user.authProvider || "-"}</td>
                      <td className="px-4 py-3"><select value={user.role} disabled={!isOwner || updatingUser === user.id} onChange={(event) => updateRole(user.id, event.target.value as UserRow["role"])} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs dark:border-white/[0.1] dark:bg-black/20"><option value="USER">USER</option><option value="ADMIN">ADMIN</option><option value="OWNER">OWNER</option></select></td>
                      <td className="px-4 py-3 text-slate-500">{new Date(user.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                  {!users.length && <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">{loading.users ? "Loading users..." : "No users found."}</td></tr>}
                </tbody>
              </table>
            </div>
          </Panel>
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
