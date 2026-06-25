"use client";

import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  Activity, AlertTriangle, Check, CheckCircle2, ChevronRight, CircleDot,
  ClipboardList, Cloud, Code2, Database, Eye, EyeOff, Globe, HardDrive,
  Info, Key, Loader2, Lock, RefreshCw, Save, Server, Settings,
  Shield, ShieldAlert, Terminal, TestTube2, Timer, Users, Wifi, WifiOff, X,
  Zap,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type TabId = "overview" | "vault" | "integrations" | "audit";

interface SystemOverview {
  appUrl: string;
  environment: string;
  nodeVersion: string;
  buildVersion: string;
  vaultConfigured: boolean;
  checks: Record<string, { status: string; latencyMs?: number }>;
  stats: { users: number; projects: number; conversations: number; messages: number };
  awsMeta: Record<string, string | undefined>;
  diagnosticsMs: number;
}

interface SystemSetting {
  id: string;
  key: string;
  valueMasked: string | null;
  category: string;
  isSecret: boolean;
  requireRestart: boolean;
  updatedBy: string | null;
  updatedAt: string;
}

interface TestResult {
  provider: string;
  status: string;
  latencyMs: number;
  message: string;
  lastCheckedAt: string;
  extra?: Record<string, string>;
}

// ── Credential categories ─────────────────────────────────────────────────────

const CREDENTIAL_GROUPS = [
  {
    category: "database",
    label: "Database",
    icon: Database,
    keys: [
      { key: "DATABASE_URL", label: "Database URL", isSecret: true, requireRestart: true },
    ],
  },
  {
    category: "auth",
    label: "Auth / NextAuth",
    icon: Lock,
    keys: [
      { key: "AUTH_SECRET", label: "Auth Secret", isSecret: true, requireRestart: true },
      { key: "NEXTAUTH_URL", label: "NextAuth URL", isSecret: false, requireRestart: true },
      { key: "AUTH_URL", label: "Auth URL", isSecret: false, requireRestart: true },
    ],
  },
  {
    category: "openrouter",
    label: "OpenRouter AI",
    icon: Zap,
    keys: [
      { key: "OPENROUTER_API_KEY", label: "API Key", isSecret: true, requireRestart: false },
      { key: "OPENROUTER_BASE_URL", label: "Base URL", isSecret: false, requireRestart: false },
      { key: "OPENROUTER_MODEL", label: "Default Model", isSecret: false, requireRestart: false },
      { key: "MELDEX_BRAIN_PROVIDER", label: "Brain Provider", isSecret: false, requireRestart: false },
    ],
  },
  {
    category: "r2",
    label: "Cloudflare R2",
    icon: Cloud,
    keys: [
      { key: "R2_ACCOUNT_ID", label: "Account ID", isSecret: true, requireRestart: false },
      { key: "R2_ACCESS_KEY_ID", label: "Access Key ID", isSecret: true, requireRestart: false },
      { key: "R2_SECRET_ACCESS_KEY", label: "Secret Access Key", isSecret: true, requireRestart: false },
      { key: "R2_BUCKET", label: "Bucket Name", isSecret: false, requireRestart: false },
      { key: "R2_PUBLIC_URL", label: "Public URL", isSecret: false, requireRestart: false },
    ],
  },
  {
    category: "oauth",
    label: "OAuth Providers",
    icon: Globe,
    keys: [
      { key: "GOOGLE_CLIENT_ID", label: "Google Client ID", isSecret: false, requireRestart: true },
      { key: "GOOGLE_CLIENT_SECRET", label: "Google Client Secret", isSecret: true, requireRestart: true },
      { key: "GITHUB_ID", label: "GitHub Client ID", isSecret: false, requireRestart: true },
      { key: "GITHUB_SECRET", label: "GitHub Client Secret", isSecret: true, requireRestart: true },
    ],
  },
  {
    category: "aws",
    label: "AWS Deployment Metadata",
    icon: Server,
    keys: [
      { key: "AWS_INSTANCE_ID", label: "Instance ID", isSecret: false, requireRestart: false },
      { key: "AWS_REGION", label: "Region", isSecret: false, requireRestart: false },
      { key: "AWS_PUBLIC_IP", label: "Public IP", isSecret: false, requireRestart: false },
      { key: "AWS_DEPLOY_PATH", label: "Deploy Path", isSecret: false, requireRestart: false },
      { key: "AWS_SSH_USER", label: "SSH User", isSecret: false, requireRestart: false },
      { key: "AWS_SERVER_NAME", label: "Server Name", isSecret: false, requireRestart: false },
    ],
  },
];

const INTEGRATIONS = [
  { id: "postgres", label: "PostgreSQL", icon: Database, color: "text-blue-400" },
  { id: "r2", label: "Cloudflare R2", icon: Cloud, color: "text-orange-400" },
  { id: "openrouter", label: "OpenRouter", icon: Zap, color: "text-yellow-400" },
  { id: "google", label: "Google OAuth", icon: Globe, color: "text-green-400" },
  { id: "github", label: "GitHub OAuth", icon: Code2, color: "text-slate-300" },
  { id: "aws", label: "AWS Server", icon: Server, color: "text-purple-400" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: string }) {
  const color =
    status === "ok" || status === "configured" ? "bg-green-400" :
    status === "degraded" || status === "info" ? "bg-yellow-400" :
    status === "not_configured" || status === "misconfigured" ? "bg-orange-400" :
    "bg-red-400";
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />;
}

function StatusBadge({ status }: { status: string }) {
  const styles =
    status === "ok" || status === "configured" ? "bg-green-500/20 text-green-300 border-green-500/30" :
    status === "info" ? "bg-blue-500/20 text-blue-300 border-blue-500/30" :
    status === "not_configured" ? "bg-orange-500/20 text-orange-300 border-orange-500/30" :
    status === "misconfigured" ? "bg-red-500/20 text-red-300 border-red-500/30" :
    "bg-slate-500/20 text-slate-300 border-slate-500/30";
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border ${styles} font-medium`}>
      {status.replace("_", " ")}
    </span>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function MasterAdminPage() {
  const { data: session, status } = useSession();
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [overview, setOverview] = useState<SystemOverview | null>(null);
  const [settings, setSettings] = useState<SystemSetting[]>([]);
  const [vaultConfigured, setVaultConfigured] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [testingId, setTestingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [showValues, setShowValues] = useState<Record<string, boolean>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<Record<string, "ok" | "error">>({});
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [auditLogs, setAuditLogs] = useState<{ id: string; key: string; action: string; oldMasked: string | null; newMasked: string | null; updatedBy: string | null; createdAt: string }[]>([]);

  // ── Auth guard ────────────────────────────────────────────────────────────
  // NOTE: guards are applied AFTER all hooks to comply with React rules of hooks

  // ── Data fetching ─────────────────────────────────────────────────────────
  const fetchOverview = useCallback(async () => {
    setOverviewLoading(true);
    try {
      const r = await fetch("/api/admin/master/overview");
      if (r.ok) setOverview(await r.json());
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    setSettingsLoading(true);
    try {
      const r = await fetch("/api/admin/master/settings");
      if (r.ok) {
        const data = await r.json();
        setSettings(data.settings);
        setVaultConfigured(data.vaultConfigured);
      }
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  const fetchAudit = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/audit");
      if (r.ok) {
        const data = await r.json();
        setAuditLogs(data.logs?.slice(0, 50) ?? []);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchOverview();
    fetchSettings();
  }, [fetchOverview, fetchSettings]);

  useEffect(() => {
    if (activeTab === "audit") fetchAudit();
  }, [activeTab, fetchAudit]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const testConnection = async (providerId: string) => {
    setTestingId(providerId);
    try {
      const r = await fetch("/api/admin/master/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: providerId }),
      });
      const data = await r.json();
      setTestResults((prev) => ({ ...prev, [providerId]: data }));
    } finally {
      setTestingId(null);
    }
  };

  const saveSetting = async (key: string, isSecret: boolean, category: string, requireRestart: boolean) => {
    const value = editValues[key];
    if (value === undefined || value === "") return;
    setSavingKey(key);
    try {
      const r = await fetch("/api/admin/master/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value, isSecret, category }),
      });
      if (r.ok) {
        setSaveStatus((prev) => ({ ...prev, [key]: "ok" }));
        setEditValues((prev) => { const n = { ...prev }; delete n[key]; return n; });
        fetchSettings();
        if (requireRestart) {
          alert(`✓ Saved. Note: "${key}" requires an app restart to take effect.`);
        }
      } else {
        const err = await r.json();
        setSaveStatus((prev) => ({ ...prev, [key]: "error" }));
        alert(`Error saving ${key}: ${err.error}`);
      }
    } finally {
      setSavingKey(null);
      setTimeout(() => setSaveStatus((prev) => { const n = { ...prev }; delete n[key]; return n; }), 3000);
    }
  };

  const reloadConfig = async () => {
    await fetch("/api/admin/master/reload-config", { method: "POST" });
    fetchOverview();
    alert("Config cache reloaded");
  };

  // ── Auth guard (after all hooks) ──────────────────────────────────────────
  if (status === "loading") return (
    <div className="flex items-center justify-center min-h-screen bg-ink">
      <Loader2 className="animate-spin text-mint w-8 h-8" />
    </div>
  );
  if (!session?.user?.role || !["ADMIN", "OWNER"].includes(session.user.role)) {
    redirect("/unauthorized");
  }

  // ── Tabs ──────────────────────────────────────────────────────────────────
  const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: "overview", label: "System Overview", icon: Activity },
    { id: "vault", label: "Credentials Vault", icon: Key },
    { id: "integrations", label: "Integrations", icon: Wifi },
    { id: "audit", label: "Audit Logs", icon: ClipboardList },
  ];

  const getSettingForKey = (key: string) => settings.find((s) => s.key === key);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0f1a] via-[#0d1520] to-[#0a0f1a]">
      {/* Header */}
      <div className="border-b border-white/10 bg-black/20 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-400/10 border border-amber-400/20">
              <Shield className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Master Admin Control Center</h1>
              <p className="text-xs text-slate-400">Meldex AI — Production Management</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!vaultConfigured && (
              <div className="flex items-center gap-1.5 text-xs text-orange-300 bg-orange-500/10 border border-orange-500/20 rounded-lg px-3 py-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                Vault not configured — secrets disabled
              </div>
            )}
            <button onClick={reloadConfig} className="flex items-center gap-1.5 text-xs text-slate-300 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-3 py-1.5 transition-colors">
              <RefreshCw className="w-3.5 h-3.5" /> Reload Config
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto flex gap-0">
        {/* Sidebar */}
        <nav className="w-56 shrink-0 border-r border-white/10 min-h-[calc(100vh-64px)] p-4 space-y-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? "bg-amber-400/10 text-amber-300 border border-amber-400/20"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <main className="flex-1 p-6 overflow-auto">

          {/* ── OVERVIEW ─────────────────────────────────────────────────── */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-white">System Overview</h2>
                <button onClick={fetchOverview} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors">
                  <RefreshCw className={`w-3.5 h-3.5 ${overviewLoading ? "animate-spin" : ""}`} /> Refresh
                </button>
              </div>

              {overviewLoading ? (
                <div className="flex items-center gap-2 text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>
              ) : overview ? (
                <>
                  {/* App info grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { label: "App URL", value: overview.appUrl },
                      { label: "Environment", value: overview.environment },
                      { label: "Node Version", value: overview.nodeVersion },
                      { label: "Build Version", value: `v${overview.buildVersion}` },
                    ].map((item) => (
                      <div key={item.label} className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
                        <p className="text-xs text-slate-400 mb-1">{item.label}</p>
                        <p className="text-sm font-mono text-white truncate">{item.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { label: "Users", value: overview.stats.users, icon: Users, color: "text-mint" },
                      { label: "Projects", value: overview.stats.projects, icon: HardDrive, color: "text-iris" },
                      { label: "Conversations", value: overview.stats.conversations, icon: CircleDot, color: "text-ember" },
                      { label: "Messages", value: overview.stats.messages, icon: Activity, color: "text-sky-400" },
                    ].map((s) => (
                      <div key={s.label} className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs text-slate-400">{s.label}</p>
                          <s.icon className={`w-4 h-4 ${s.color}`} />
                        </div>
                        <p className={`text-2xl font-bold ${s.color}`}>{s.value.toLocaleString()}</p>
                      </div>
                    ))}
                  </div>

                  {/* Service checks */}
                  <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
                    <h3 className="text-sm font-semibold text-white mb-4">Service Health</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {Object.entries(overview.checks).map(([service, check]) => (
                        <div key={service} className="flex items-center justify-between bg-white/[0.03] rounded-lg px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <StatusDot status={check.status} />
                            <span className="text-xs text-slate-300 capitalize">{service.replace(/([A-Z])/g, ' $1')}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <StatusBadge status={check.status} />
                            {check.latencyMs !== undefined && (
                              <span className="text-xs text-slate-500">{check.latencyMs}ms</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* AWS Metadata */}
                  {Object.values(overview.awsMeta).some(Boolean) && (
                    <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
                      <h3 className="text-sm font-semibold text-white mb-4">AWS Deployment</h3>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {Object.entries(overview.awsMeta).filter(([, v]) => v).map(([k, v]) => (
                          <div key={k} className="bg-white/[0.03] rounded-lg px-3 py-2">
                            <p className="text-xs text-slate-400">{k}</p>
                            <p className="text-xs font-mono text-slate-200 mt-0.5 truncate">{v}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-slate-400 text-sm">Failed to load overview.</div>
              )}
            </div>
          )}

          {/* ── CREDENTIALS VAULT ────────────────────────────────────────── */}
          {activeTab === "vault" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-white">Credentials Vault</h2>
                {!vaultConfigured && (
                  <div className="flex items-center gap-2 text-sm text-orange-300 bg-orange-500/10 border border-orange-500/20 rounded-xl px-4 py-2">
                    <ShieldAlert className="w-4 h-4" />
                    <span>Set <code className="font-mono bg-white/10 px-1 rounded">SETTINGS_ENCRYPTION_KEY</code> to enable secret storage</span>
                  </div>
                )}
              </div>

              {/* Setup hint */}
              {!vaultConfigured && (
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 text-sm text-amber-200">
                  <p className="font-medium mb-1">Generate encryption key:</p>
                  <code className="block font-mono text-xs bg-black/40 rounded p-2 mt-1">openssl rand -base64 32</code>
                  <p className="mt-2 text-amber-300/70 text-xs">Add to <code className="font-mono">.env.production</code> as <code className="font-mono">SETTINGS_ENCRYPTION_KEY=&lt;value&gt;</code> then restart the app.</p>
                </div>
              )}

              {settingsLoading ? (
                <div className="flex items-center gap-2 text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>
              ) : (
                CREDENTIAL_GROUPS.map((group) => (
                  <div key={group.category} className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
                    <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-white/10 bg-white/[0.02]">
                      <group.icon className="w-4 h-4 text-amber-400" />
                      <h3 className="text-sm font-semibold text-white">{group.label}</h3>
                    </div>
                    <div className="divide-y divide-white/5">
                      {group.keys.map((item) => {
                        const saved = getSettingForKey(item.key);
                        const editing = editValues[item.key] !== undefined;
                        const revealed = showValues[item.key];
                        const saving = savingKey === item.key;
                        const saved_ok = saveStatus[item.key] === "ok";
                        const needsRestart = item.requireRestart;

                        return (
                          <div key={item.key} className="px-5 py-3.5 flex items-center gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-mono text-slate-300">{item.key}</span>
                                {needsRestart && (
                                  <span className="text-xs bg-orange-500/20 text-orange-300 border border-orange-500/20 px-1.5 py-0.5 rounded flex items-center gap-1">
                                    <Timer className="w-3 h-3" /> restart required
                                  </span>
                                )}
                                {item.isSecret && <Lock className="w-3 h-3 text-slate-500" />}
                              </div>
                              <p className="text-xs text-slate-500">{item.label}</p>
                              {saved && (
                                <p className="text-xs font-mono text-slate-400 mt-1">
                                  {saved.valueMasked ?? "(empty)"} <span className="text-slate-600 ml-2">updated by {saved.updatedBy ?? "system"}</span>
                                </p>
                              )}
                            </div>

                            {/* Input / actions */}
                            <div className="flex items-center gap-2 shrink-0">
                              <div className="relative">
                                <input
                                  type={item.isSecret && !revealed ? "password" : "text"}
                                  placeholder={saved ? "Replace value..." : "Enter value..."}
                                  value={editValues[item.key] ?? ""}
                                  onChange={(e) => setEditValues((prev) => ({ ...prev, [item.key]: e.target.value }))}
                                  className="w-52 bg-black/30 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-400/50 pr-8"
                                />
                                {item.isSecret && (
                                  <button
                                    onClick={() => setShowValues((prev) => ({ ...prev, [item.key]: !prev[item.key] }))}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                                  >
                                    {revealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                  </button>
                                )}
                              </div>
                              <button
                                disabled={!editing || saving || (!vaultConfigured && item.isSecret)}
                                onClick={() => saveSetting(item.key, item.isSecret, group.category, item.requireRestart)}
                                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-amber-400/10 text-amber-300 hover:bg-amber-400/20 border border-amber-400/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                              >
                                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved_ok ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                                {saving ? "Saving..." : saved_ok ? "Saved!" : "Save"}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── INTEGRATIONS ─────────────────────────────────────────────── */}
          {activeTab === "integrations" && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-white">Integration Status</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {INTEGRATIONS.map((intg) => {
                  const result = testResults[intg.id];
                  const testing = testingId === intg.id;
                  return (
                    <div key={intg.id} className="bg-white/[0.03] border border-white/10 rounded-xl p-5 flex flex-col gap-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <intg.icon className={`w-5 h-5 ${intg.color}`} />
                          <span className="text-sm font-semibold text-white">{intg.label}</span>
                        </div>
                        {result && <StatusBadge status={result.status} />}
                      </div>

                      {result && (
                        <div className="space-y-1.5">
                          <p className="text-xs text-slate-300">{result.message}</p>
                          <p className="text-xs text-slate-500">{result.latencyMs}ms · {new Date(result.lastCheckedAt).toLocaleTimeString()}</p>
                          {result.extra && (
                            <div className="mt-2 space-y-1">
                              {Object.entries(result.extra).map(([k, v]) => (
                                <div key={k} className="flex items-start gap-2">
                                  <span className="text-xs text-slate-500 w-28 shrink-0">{k}</span>
                                  <span className="text-xs font-mono text-slate-300 break-all">{v}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      <button
                        onClick={() => testConnection(intg.id)}
                        disabled={testing}
                        className="flex items-center justify-center gap-2 w-full py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-300 hover:text-white transition-all disabled:opacity-50"
                      >
                        {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <TestTube2 className="w-3.5 h-3.5" />}
                        {testing ? "Testing..." : "Test Connection"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── AUDIT LOGS ───────────────────────────────────────────────── */}
          {activeTab === "audit" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-white">Audit Logs</h2>
                <button onClick={fetchAudit} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors">
                  <RefreshCw className="w-3.5 h-3.5" /> Refresh
                </button>
              </div>
              <div className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/[0.02]">
                      <th className="text-left px-4 py-3 text-slate-400 font-medium">Action</th>
                      <th className="text-left px-4 py-3 text-slate-400 font-medium">Resource</th>
                      <th className="text-left px-4 py-3 text-slate-400 font-medium">By</th>
                      <th className="text-left px-4 py-3 text-slate-400 font-medium">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {auditLogs.length === 0 ? (
                      <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">No audit logs yet</td></tr>
                    ) : (
                      auditLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-white/[0.02]">
                          <td className="px-4 py-2.5">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              log.action?.includes("DELETE") ? "bg-red-500/20 text-red-300" :
                              log.action?.includes("UPDATE") ? "bg-blue-500/20 text-blue-300" :
                              "bg-green-500/20 text-green-300"
                            }`}>{log.action}</span>
                          </td>
                          <td className="px-4 py-2.5 font-mono text-slate-300">{(log as { resource?: string }).resource ?? log.key ?? "-"}</td>
                          <td className="px-4 py-2.5 text-slate-400">{(log as { userId?: string }).userId ?? log.updatedBy ?? "-"}</td>
                          <td className="px-4 py-2.5 text-slate-500">{new Date((log as { createdAt: string }).createdAt).toLocaleString()}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
