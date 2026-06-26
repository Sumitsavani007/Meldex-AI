"use client";

import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity, AlertTriangle, ArrowRight, Check, CheckCircle2,
  ChevronRight, CircleDot, Cloud, Code2, Copy, Database,
  Eye, EyeOff, Globe, HardDrive, Info, Key, Loader2, Lock,
  MemoryStick, MessageSquare, Monitor, Package, RefreshCw,
  RotateCcw, Save, Server, Settings, Shield, ShieldAlert,
  TestTube2, Timer, Users, WifiOff, X, Zap, Terminal, Search,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
type TabId = "overview" | "vault" | "integrations" | "users" | "conversations" | "diagnostics" | "audit";

interface SettingRow {
  key: string; label: string; category: string; isSecret: boolean;
  requireRestart: boolean; source: "ENV" | "VAULT" | "MISSING";
  hotReload?: boolean; status?: string;
  maskedValue: string | null; configured: boolean;
  updatedBy: string | null; updatedAt: string | null; description?: string;
}

interface Overview {
  appUrl: string; environment: string; nodeVersion: string; buildVersion: string;
  hostname: string; vaultConfigured: boolean;
  checks: Record<string, { status: string; latencyMs?: number }>;
  system: { totalMemMb: number; usedMemMb: number; memPercent: number; cpuLoad1: string; cpus: number; uptimeSeconds: number };
  stats: { users: number; projects: number; conversations: number; messages: number; vaultKeys: number };
  awsMeta: Record<string, string | undefined>;
  diagnosticsMs: number;
}

interface TestResult { provider: string; status: string; latencyMs: number; message: string; lastCheckedAt: string; extra?: Record<string, string> }
interface AuditEntry { id: string; action: string; resource?: string; userId?: string; ipAddress?: string; createdAt: string; metadata?: Record<string, unknown> }
interface ConvEntry { id: string; title: string; model?: string; activeBrain?: string; updatedAt: string; _count: { messages: number } }

// ── Helpers ────────────────────────────────────────────────────────────────────
const SOURCE_BADGES: Record<string, string> = {
  ENV: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  VAULT: "bg-violet-500/15 text-violet-400 border-violet-500/25",
  MISSING: "bg-red-500/15 text-red-400 border-red-500/25",
};

const STATUS_COLORS: Record<string, string> = {
  ok: "text-emerald-400", configured: "text-emerald-400",
  configured_needs_restart: "text-amber-400",
  degraded: "text-amber-400", not_configured: "text-amber-400",
  error: "text-red-400", misconfigured: "text-red-400",
  info: "text-blue-400",
};

const STATUS_DOT: Record<string, string> = {
  ok: "bg-emerald-400 shadow-emerald-400/50", configured: "bg-emerald-400 shadow-emerald-400/50",
  configured_needs_restart: "bg-amber-400 shadow-amber-400/50",
  degraded: "bg-amber-400 shadow-amber-400/50", not_configured: "bg-amber-400 shadow-amber-400/50",
  error: "bg-red-400 shadow-red-400/50", misconfigured: "bg-red-400 shadow-red-400/50",
};

function StatusPulse({ status }: { status: string }) {
  const cls = STATUS_DOT[status] ?? "bg-slate-400";
  return <span className={`inline-block w-2 h-2 rounded-full shadow-[0_0_6px] ${cls}`} />;
}

function Badge({ label, variant = "default" }: { label: string; variant?: "emerald" | "violet" | "amber" | "red" | "blue" | "default" }) {
  const styles: Record<string, string> = {
    emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    violet: "bg-violet-500/10 text-violet-400 border-violet-500/20",
    amber: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    red: "bg-red-500/10 text-red-400 border-red-500/20",
    blue: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    default: "bg-white/5 text-slate-400 border-white/10",
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border ${styles[variant]}`}>{label}</span>;
}

function SourceBadge({ source }: { source: "ENV" | "VAULT" | "MISSING" }) {
  const v = source === "ENV" ? "emerald" : source === "VAULT" ? "violet" : "red";
  return <Badge label={source} variant={v as "emerald" | "violet" | "red"} />;
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-white/5 rounded-lg ${className}`} />;
}

function fmt(bytes: number) {
  return bytes < 1024 ? `${bytes}B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)}KB` : `${(bytes / 1048576).toFixed(1)}MB`;
}

function fmtUptime(s: number) {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const CREDENTIAL_GROUPS = [
  { category: "database", label: "Database", icon: Database },
  { category: "auth", label: "Authentication", icon: Lock },
  { category: "openrouter", label: "OpenRouter AI", icon: Zap },
  { category: "qwen", label: "Qwen3-Coder", icon: Code2 },
  { category: "search", label: "Search Providers", icon: Search },
  { category: "r2", label: "Cloudflare R2", icon: Cloud },
  { category: "oauth", label: "OAuth Providers", icon: Globe },
  { category: "aws", label: "AWS Deployment", icon: Server },
  { category: "runtime", label: "App Runtime", icon: Settings },
  { category: "security", label: "Security", icon: Shield },
];

const INTEGRATIONS = [
  { id: "postgres", label: "PostgreSQL", icon: Database, color: "text-sky-400", bgColor: "bg-sky-400/10" },
  { id: "r2", label: "Cloudflare R2", icon: Cloud, color: "text-orange-400", bgColor: "bg-orange-400/10" },
  { id: "openrouter", label: "OpenRouter", icon: Zap, color: "text-yellow-400", bgColor: "bg-yellow-400/10" },
  { id: "google", label: "Google OAuth", icon: Globe, color: "text-emerald-400", bgColor: "bg-emerald-400/10" },
  { id: "github", label: "GitHub OAuth", icon: Code2, color: "text-slate-300", bgColor: "bg-white/5" },
  { id: "aws", label: "AWS Server", icon: Server, color: "text-violet-400", bgColor: "bg-violet-400/10" },
];

// ── Main Component ─────────────────────────────────────────────────────────────
export default function MasterAdminPage() {
  const { data: session, status: sessionStatus } = useSession();
  const [tab, setTab] = useState<TabId>("overview");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [settings, setSettings] = useState<SettingRow[]>([]);
  const [vaultOk, setVaultOk] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [testingId, setTestingId] = useState<string | null>(null);
  const [editVals, setEditVals] = useState<Record<string, string>>({});
  const [showVals, setShowVals] = useState<Record<string, boolean>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState<Record<string, boolean>>({});
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [restartBanner, setRestartBanner] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [conversations, setConversations] = useState<ConvEntry[]>([]);
  const [users, setUsers] = useState<{ id: string; email: string; name?: string; role: string; createdAt: string }[]>([]);

  // ── All hooks first, guards after ─────────────────────────────────────────
  const fetchOverview = useCallback(async () => {
    setOverviewLoading(true);
    try { const r = await fetch("/api/admin/master/overview"); if (r.ok) setOverview(await r.json()); }
    finally { setOverviewLoading(false); }
  }, []);

  const fetchSettings = useCallback(async () => {
    setSettingsLoading(true);
    try {
      const r = await fetch("/api/admin/master/settings");
      if (r.ok) { const d = await r.json(); setSettings(d.settings); setVaultOk(d.vaultConfigured); }
    } finally { setSettingsLoading(false); }
  }, []);

  const fetchAudit = useCallback(async () => {
    try { const r = await fetch("/api/admin/audit"); if (r.ok) { const d = await r.json(); setAuditLogs(d.logs?.slice(0, 100) ?? []); } }
    catch {}
  }, []);

  const fetchConversations = useCallback(async () => {
    try { const r = await fetch("/api/admin/master/conversations"); if (r.ok) { const d = await r.json(); setConversations(d.conversations ?? []); } }
    catch {}
  }, []);

  const fetchUsers = useCallback(async () => {
    try { const r = await fetch("/api/admin/users"); if (r.ok) { const d = await r.json(); setUsers(d.users ?? []); } }
    catch {}
  }, []);

  useEffect(() => { fetchOverview(); fetchSettings(); }, [fetchOverview, fetchSettings]);
  useEffect(() => { if (tab === "audit") fetchAudit(); }, [tab, fetchAudit]);
  useEffect(() => { if (tab === "conversations") fetchConversations(); }, [tab, fetchConversations]);
  useEffect(() => { if (tab === "users") fetchUsers(); }, [tab, fetchUsers]);

  // ── Auth guard (after all hooks) ──────────────────────────────────────────
  if (sessionStatus === "loading") return (
    <div className="flex items-center justify-center min-h-screen bg-[#080c14]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
        <p className="text-sm text-slate-500">Loading Control Center...</p>
      </div>
    </div>
  );
  if (!session?.user?.role || !["ADMIN", "OWNER"].includes(session.user.role)) redirect("/unauthorized");

  // ── Actions ───────────────────────────────────────────────────────────────
  const testConn = async (id: string) => {
    setTestingId(id);
    try {
      const r = await fetch("/api/admin/master/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: id }) });
      const res = await r.json();
      setTestResults((p) => ({ ...p, [id]: res }));
    } finally { setTestingId(null); }
  };

  const saveSetting = async (key: string, isSecret: boolean, category: string) => {
    const value = editVals[key];
    if (!value) return;
    setSavingKey(key);
    try {
      const r = await fetch("/api/admin/master/settings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value, isSecret, category }),
      });
      if (r.ok) {
        const data = await r.json();
        setSaveOk((p) => ({ ...p, [key]: true }));
        setEditVals((p) => { const n = { ...p }; delete n[key]; return n; });
        if (data.requireRestart) setRestartBanner(true);
        fetchSettings();
        setTimeout(() => setSaveOk((p) => { const n = { ...p }; delete n[key]; return n; }), 2500);
      } else {
        const e = await r.json(); alert(e.error ?? "Save failed");
      }
    } finally { setSavingKey(null); }
  };

  const syncEnv = async () => {
    setSyncing(true);
    try {
      const r = await fetch("/api/admin/master/sync-env", { method: "POST" });
      const d = await r.json();
      if (d.success) { alert(`✓ Synced ${d.synced} settings to vault`); fetchSettings(); }
      else alert(d.error);
    } finally { setSyncing(false); }
  };

  const restartApp = async () => {
    if (!confirm("Restart Meldex AI? The app will be unavailable for ~5 seconds.")) return;
    setRestarting(true);
    try {
      await fetch("/api/admin/master/restart", { method: "POST" });
      setRestartBanner(false);
      setTimeout(() => { setRestarting(false); fetchOverview(); }, 6000);
    } catch { setRestarting(false); }
  };

  const reloadConfig = async () => {
    await fetch("/api/admin/master/reload-config", { method: "POST" });
    fetchOverview();
  };

  const copyToClipboard = (val: string) => {
    navigator.clipboard.writeText(val).catch(() => {});
  };

  const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: "overview", label: "Overview", icon: Activity },
    { id: "vault", label: "Credentials Vault", icon: Key },
    { id: "integrations", label: "Integrations", icon: Zap },
    { id: "users", label: "Users", icon: Users },
    { id: "conversations", label: "Conversations", icon: MessageSquare },
    { id: "diagnostics", label: "Diagnostics", icon: Monitor },
    { id: "audit", label: "Audit Logs", icon: Shield },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#080c14] text-white flex flex-col">
      {/* Restart required banner */}
      {restartBanner && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-6 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-amber-300">
            <AlertTriangle className="w-4 h-4" />
            <span>Some changes require an app restart to take effect.</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={restartApp} disabled={restarting} className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 rounded-lg text-amber-300 transition-colors disabled:opacity-50">
              {restarting ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
              {restarting ? "Restarting..." : "Restart Now"}
            </button>
            <button onClick={() => setRestartBanner(false)} className="text-amber-400/60 hover:text-amber-400 transition-colors"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {/* Top header */}
      <header className="border-b border-white/[0.06] bg-black/30 px-6 py-3.5 flex items-center justify-between backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400/20 to-amber-600/20 border border-amber-400/20 flex items-center justify-center">
              <Shield className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white leading-none">Master Control Center</p>
              <p className="text-[11px] text-slate-500 leading-none mt-0.5">Meldex AI Enterprise</p>
            </div>
          </div>
          <div className="h-4 w-px bg-white/10" />
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-slate-400">{overview?.environment ?? "—"}</span>
            <span className="text-[11px] text-slate-600">·</span>
            <span className="text-[11px] font-mono text-slate-400">v{overview?.buildVersion ?? "—"}</span>
            <span className="text-[11px] text-slate-600">·</span>
            <span className="text-[11px] font-mono text-slate-400">{overview?.nodeVersion ?? "—"}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 bg-white/[0.04] border border-white/[0.06] rounded-lg px-2.5 py-1.5">
            <StatusPulse status={overview?.checks?.database?.status ?? "error"} />
            <span>{overview?.appUrl ?? "Loading..."}</span>
          </div>
          <button onClick={syncEnv} disabled={syncing || !vaultOk} className="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 bg-violet-500/10 hover:bg-violet-500/15 border border-violet-500/20 rounded-lg text-violet-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            {syncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowRight className="w-3 h-3" />}
            Sync ENV → Vault
          </button>
          <button onClick={reloadConfig} className="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.06] rounded-lg text-slate-300 transition-colors">
            <RefreshCw className="w-3 h-3" /> Reload Config
          </button>
          <button onClick={restartApp} disabled={restarting} className="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 bg-red-500/10 hover:bg-red-500/15 border border-red-500/20 rounded-lg text-red-300 transition-colors disabled:opacity-50">
            {restarting ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
            {restarting ? "Restarting..." : "Restart App"}
          </button>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Sidebar */}
        <nav className="w-52 shrink-0 border-r border-white/[0.06] p-3 space-y-0.5">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all ${
                tab === t.id ? "bg-amber-400/[0.08] text-amber-300 border border-amber-400/[0.12]"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]"
              }`}>
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <main className="flex-1 overflow-auto p-6">

          {/* ── OVERVIEW ─────────────────────────────────────────────── */}
          {tab === "overview" && (
            <div className="space-y-5 max-w-5xl">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-white">System Overview</h2>
                <button onClick={fetchOverview} className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-white transition-colors">
                  <RefreshCw className={`w-3 h-3 ${overviewLoading ? "animate-spin" : ""}`} /> Refresh
                </button>
              </div>

              {overviewLoading ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
                </div>
              ) : overview && (
                <>
                  {/* Stats row */}
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {[
                      { label: "Users", value: overview.stats.users, icon: Users, color: "text-emerald-400", dot: "bg-emerald-400" },
                      { label: "Projects", value: overview.stats.projects, icon: Package, color: "text-violet-400", dot: "bg-violet-400" },
                      { label: "Conversations", value: overview.stats.conversations, icon: MessageSquare, color: "text-blue-400", dot: "bg-blue-400" },
                      { label: "Messages", value: overview.stats.messages, icon: CircleDot, color: "text-amber-400", dot: "bg-amber-400" },
                      { label: "Vault Keys", value: overview.stats.vaultKeys, icon: Key, color: "text-rose-400", dot: "bg-rose-400" },
                    ].map((s) => (
                      <div key={s.label} className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4 hover:bg-white/[0.04] transition-colors">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-[11px] text-slate-500 font-medium uppercase tracking-wide">{s.label}</p>
                          <s.icon className={`w-3.5 h-3.5 ${s.color}`} />
                        </div>
                        <p className={`text-2xl font-bold ${s.color}`}>{s.value.toLocaleString()}</p>
                      </div>
                    ))}
                  </div>

                  {/* System info + service health */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* System resources */}
                    <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-5">
                      <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-4">System Resources</h3>
                      <div className="space-y-3">
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-slate-400">Memory</span>
                            <span className="text-slate-300">{overview.system.usedMemMb} / {overview.system.totalMemMb} MB</span>
                          </div>
                          <div className="h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${overview.system.memPercent > 85 ? "bg-red-400" : overview.system.memPercent > 70 ? "bg-amber-400" : "bg-emerald-400"}`}
                              style={{ width: `${overview.system.memPercent}%` }} />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div className="bg-white/[0.03] rounded-lg px-3 py-2">
                            <p className="text-slate-500 mb-0.5">CPU Load</p>
                            <p className="text-slate-200 font-mono">{overview.system.cpuLoad1} ({overview.system.cpus} cores)</p>
                          </div>
                          <div className="bg-white/[0.03] rounded-lg px-3 py-2">
                            <p className="text-slate-500 mb-0.5">Uptime</p>
                            <p className="text-slate-200 font-mono">{fmtUptime(overview.system.uptimeSeconds)}</p>
                          </div>
                          <div className="bg-white/[0.03] rounded-lg px-3 py-2">
                            <p className="text-slate-500 mb-0.5">Hostname</p>
                            <p className="text-slate-200 font-mono truncate">{overview.hostname}</p>
                          </div>
                          <div className="bg-white/[0.03] rounded-lg px-3 py-2">
                            <p className="text-slate-500 mb-0.5">Node</p>
                            <p className="text-slate-200 font-mono">{overview.nodeVersion}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Service health */}
                    <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-5">
                      <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-4">Service Health</h3>
                      <div className="space-y-2">
                        {Object.entries(overview.checks ?? {}).map(([svc, check]) => (
                          <div key={svc} className="flex items-center justify-between py-1.5 border-b border-white/[0.04] last:border-0">
                            <div className="flex items-center gap-2.5">
                              <StatusPulse status={check.status} />
                              <span className="text-xs text-slate-300 capitalize">{svc.replace(/([A-Z])/g, " $1")}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {check.latencyMs !== undefined && <span className="text-[11px] text-slate-500 font-mono">{check.latencyMs}ms</span>}
                              <span className={`text-[11px] font-medium ${STATUS_COLORS[check.status] ?? "text-slate-400"}`}>{check.status.replace("_", " ")}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* AWS metadata */}
                  {Object.values(overview.awsMeta ?? {}).some(Boolean) && (
                    <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-5">
                      <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-4">AWS Deployment</h3>
                      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                        {Object.entries(overview.awsMeta ?? {}).filter(([, v]) => v).map(([k, v]) => (
                          <div key={k} className="bg-white/[0.03] rounded-lg px-3 py-2">
                            <p className="text-[10px] text-slate-500 mb-0.5">{k.replace("AWS_", "")}</p>
                            <p className="text-[11px] font-mono text-slate-200 truncate">{v}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── CREDENTIALS VAULT ─────────────────────────────────────── */}
          {tab === "vault" && (
            <div className="space-y-5 max-w-5xl">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-white">Credentials Vault</h2>
                  <p className="text-[12px] text-slate-500 mt-0.5">Auto-discovered from process.env. Replace to update in encrypted vault.</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <SourceBadge source="ENV" /><span className="text-slate-500">from environment</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <SourceBadge source="VAULT" /><span className="text-slate-500">encrypted vault</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <SourceBadge source="MISSING" /><span className="text-slate-500">not set</span>
                  </div>
                </div>
              </div>

              {!vaultOk && (
                <div className="flex items-start gap-3 bg-amber-500/5 border border-amber-500/15 rounded-xl p-4">
                  <ShieldAlert className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-amber-300">Vault encryption not configured</p>
                    <p className="text-xs text-amber-400/70 mt-1">Secrets are visible in ENV but cannot be saved to the encrypted vault until you set <code className="font-mono bg-black/30 px-1 rounded">SETTINGS_ENCRYPTION_KEY</code>.</p>
                    <code className="block mt-2 text-xs font-mono bg-black/40 text-amber-200 px-3 py-1.5 rounded-lg">openssl rand -base64 32</code>
                  </div>
                </div>
              )}

              {settingsLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
                </div>
              ) : (
                CREDENTIAL_GROUPS.map((grp) => {
                  const rows = settings.filter((s) => s.category === grp.category);
                  if (!rows.length) return null;
                  return (
                    <div key={grp.category} className="bg-white/[0.02] border border-white/[0.06] rounded-xl overflow-hidden">
                      <div className="flex items-center gap-2.5 px-5 py-3 border-b border-white/[0.06] bg-white/[0.01]">
                        <grp.icon className="w-3.5 h-3.5 text-slate-400" />
                        <h3 className="text-[13px] font-semibold text-white">{grp.label}</h3>
                        <span className="ml-auto text-[11px] text-slate-500">{rows.filter((r) => r.configured).length}/{rows.length} configured</span>
                      </div>
                      <div className="divide-y divide-white/[0.04]">
                        {rows.map((row) => {
                          const editing = editVals[row.key] !== undefined;
                          const saving = savingKey === row.key;
                          const saved = saveOk[row.key];
                          const revealed = showVals[row.key];
                          return (
                            <div key={row.key} className="px-5 py-3.5 flex items-center gap-4 hover:bg-white/[0.01] transition-colors">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <code className="text-[12px] font-mono text-slate-200">{row.key}</code>
                                  <SourceBadge source={row.source} />
                                  {row.requireRestart && (
                                    <span className="inline-flex items-center gap-1 text-[10px] bg-orange-500/10 text-orange-400 border border-orange-500/15 px-1.5 py-0.5 rounded">
                                      <Timer className="w-2.5 h-2.5" /> restart
                                    </span>
                                  )}
                                  {row.hotReload && !row.requireRestart && (
                                    <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/15 px-1.5 py-0.5 rounded">
                                      <RefreshCw className="w-2.5 h-2.5" /> hot reload
                                    </span>
                                  )}
                                  {row.status && <Badge label={row.status} variant={row.status === "missing" ? "red" : "emerald"} />}
                                  {row.isSecret && <Lock className="w-2.5 h-2.5 text-slate-600" />}
                                </div>
                                <div className="flex items-center gap-3 mt-1">
                                  <span className="text-[11px] text-slate-500">{row.label}</span>
                                  {row.maskedValue && (
                                    <span className="text-[11px] font-mono text-slate-400 truncate max-w-[200px]">{row.maskedValue}</span>
                                  )}
                                  {row.updatedBy && (
                                    <span className="text-[10px] text-slate-600">by {row.updatedBy}</span>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                {row.maskedValue && (
                                  <button onClick={() => copyToClipboard(row.maskedValue!)} className="p-1.5 text-slate-600 hover:text-slate-300 transition-colors rounded-md hover:bg-white/5">
                                    <Copy className="w-3 h-3" />
                                  </button>
                                )}
                                <div className="relative">
                                  <input
                                    type={row.isSecret && !revealed ? "password" : "text"}
                                    placeholder={row.configured ? "Replace value..." : "Enter value..."}
                                    value={editVals[row.key] ?? ""}
                                    onChange={(e) => setEditVals((p) => ({ ...p, [row.key]: e.target.value }))}
                                    className="w-48 bg-black/30 border border-white/[0.08] rounded-lg px-3 py-1.5 text-[12px] text-white placeholder-slate-600 focus:outline-none focus:border-amber-400/40 focus:ring-1 focus:ring-amber-400/20 transition-all pr-7"
                                  />
                                  {row.isSecret && (
                                    <button onClick={() => setShowVals((p) => ({ ...p, [row.key]: !p[row.key] }))}
                                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-300 transition-colors">
                                      {revealed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                    </button>
                                  )}
                                </div>
                                <button
                                  disabled={!editing || saving || (row.isSecret && !vaultOk)}
                                  onClick={() => saveSetting(row.key, row.isSecret, row.category)}
                                  className="flex items-center gap-1 text-[11px] px-3 py-1.5 rounded-lg bg-amber-400/[0.08] text-amber-300 hover:bg-amber-400/15 border border-amber-400/15 disabled:opacity-30 disabled:cursor-not-allowed transition-all font-medium"
                                >
                                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : saved ? <Check className="w-3 h-3" /> : <Save className="w-3 h-3" />}
                                  {saving ? "Saving" : saved ? "Saved!" : "Save"}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* ── INTEGRATIONS ──────────────────────────────────────────── */}
          {tab === "integrations" && (
            <div className="space-y-5 max-w-4xl">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-white">Integrations</h2>
                <button onClick={() => INTEGRATIONS.forEach((i) => testConn(i.id))}
                  className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.06] rounded-lg text-slate-300 transition-colors">
                  <TestTube2 className="w-3 h-3" /> Test All
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {INTEGRATIONS.map((intg) => {
                  const result = testResults[intg.id];
                  const testing = testingId === intg.id;
                  return (
                    <div key={intg.id} className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-5 flex flex-col gap-4 hover:border-white/[0.1] transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg ${intg.bgColor} flex items-center justify-center`}>
                            <intg.icon className={`w-4 h-4 ${intg.color}`} />
                          </div>
                          <div>
                            <p className="text-[13px] font-semibold text-white">{intg.label}</p>
                            {result && <p className={`text-[11px] ${STATUS_COLORS[result.status] ?? "text-slate-400"}`}>{result.status.replace("_", " ")}</p>}
                          </div>
                        </div>
                        {result && <StatusPulse status={result.status} />}
                      </div>

                      {result && (
                        <div className="bg-black/20 rounded-lg p-3 space-y-1.5">
                          <p className="text-[12px] text-slate-300">{result.message}</p>
                          <p className="text-[11px] text-slate-500">{result.latencyMs}ms · {new Date(result.lastCheckedAt).toLocaleTimeString()}</p>
                          {result.extra && Object.entries(result.extra).map(([k, v]) => (
                            <div key={k} className="flex items-start gap-2">
                              <span className="text-[10px] text-slate-500 w-24 shrink-0">{k}</span>
                              <span className="text-[10px] font-mono text-slate-400 break-all">{v}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      <button onClick={() => testConn(intg.id)} disabled={testing}
                        className="flex items-center justify-center gap-2 py-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] text-[12px] text-slate-300 hover:text-white transition-all disabled:opacity-50 mt-auto">
                        {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <TestTube2 className="w-3.5 h-3.5" />}
                        {testing ? "Testing..." : "Test Connection"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── USERS ─────────────────────────────────────────────────── */}
          {tab === "users" && (
            <div className="space-y-4 max-w-4xl">
              <h2 className="text-base font-semibold text-white">Users</h2>
              <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl overflow-hidden">
                <table className="w-full text-[12px]">
                  <thead><tr className="border-b border-white/[0.06] bg-white/[0.01]">
                    {["Email", "Name", "Role", "Joined"].map((h) => (
                      <th key={h} className="text-left px-5 py-3 text-[11px] text-slate-500 font-semibold uppercase tracking-wider">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {users.length === 0 ? (
                      <tr><td colSpan={4} className="px-5 py-10 text-center text-slate-500">Loading users...</td></tr>
                    ) : users.map((u) => (
                      <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-5 py-3 font-mono text-slate-200">{u.email}</td>
                        <td className="px-5 py-3 text-slate-300">{u.name ?? "—"}</td>
                        <td className="px-5 py-3">
                          <Badge label={u.role} variant={u.role === "OWNER" ? "amber" : u.role === "ADMIN" ? "violet" : "default"} />
                        </td>
                        <td className="px-5 py-3 text-slate-500">{new Date(u.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── CONVERSATIONS ─────────────────────────────────────────── */}
          {tab === "conversations" && (
            <div className="space-y-4 max-w-4xl">
              <h2 className="text-base font-semibold text-white">Conversations</h2>
              <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl overflow-hidden">
                <table className="w-full text-[12px]">
                  <thead><tr className="border-b border-white/[0.06] bg-white/[0.01]">
                    {["Title", "Model", "Brain", "Messages", "Updated"].map((h) => (
                      <th key={h} className="text-left px-5 py-3 text-[11px] text-slate-500 font-semibold uppercase tracking-wider">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {conversations.length === 0 ? (
                      <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-500">No conversations yet</td></tr>
                    ) : conversations.map((c) => (
                      <tr key={c.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-5 py-3 text-slate-200 max-w-[240px] truncate">{c.title}</td>
                        <td className="px-5 py-3 font-mono text-slate-400">{c.model ?? "—"}</td>
                        <td className="px-5 py-3"><Badge label={c.activeBrain ?? "chat"} variant="blue" /></td>
                        <td className="px-5 py-3 text-slate-300">{c._count.messages}</td>
                        <td className="px-5 py-3 text-slate-500">{new Date(c.updatedAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── DIAGNOSTICS ───────────────────────────────────────────── */}
          {tab === "diagnostics" && (
            <div className="space-y-5 max-w-4xl">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-white">Diagnostics</h2>
                <button onClick={fetchOverview} className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-white transition-colors">
                  <RefreshCw className={`w-3 h-3 ${overviewLoading ? "animate-spin" : ""}`} /> Refresh
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {overview?.checks && Object.entries(overview.checks).map(([svc, check]) => (
                  <div key={svc} className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${check.status === "ok" || check.status === "configured" ? "bg-emerald-500/10" : check.status === "error" ? "bg-red-500/10" : "bg-amber-500/10"}`}>
                        <Monitor className={`w-4 h-4 ${STATUS_COLORS[check.status] ?? "text-slate-400"}`} />
                      </div>
                      <div>
                        <p className="text-[13px] font-medium text-white capitalize">{svc.replace(/([A-Z])/g, " $1")}</p>
                        {check.latencyMs !== undefined && <p className="text-[11px] text-slate-500">{check.latencyMs}ms response</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusPulse status={check.status} />
                      <span className={`text-[12px] font-medium ${STATUS_COLORS[check.status] ?? "text-slate-400"}`}>{check.status.replace("_", " ")}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── AUDIT LOGS ────────────────────────────────────────────── */}
          {tab === "audit" && (
            <div className="space-y-4 max-w-5xl">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-white">Audit Logs</h2>
                <button onClick={fetchAudit} className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-white transition-colors">
                  <RefreshCw className="w-3 h-3" /> Refresh
                </button>
              </div>
              <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl overflow-hidden">
                <table className="w-full text-[12px]">
                  <thead><tr className="border-b border-white/[0.06] bg-white/[0.01]">
                    {["Action", "Resource", "User", "IP", "Time"].map((h) => (
                      <th key={h} className="text-left px-5 py-3 text-[11px] text-slate-500 font-semibold uppercase tracking-wider">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {auditLogs.length === 0 ? (
                      <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-500">No audit logs yet</td></tr>
                    ) : auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-5 py-2.5">
                          <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-medium ${
                            log.action?.includes("DELETE") ? "bg-red-500/15 text-red-300" :
                            log.action?.includes("UPDATE") || log.action?.includes("SYNC") ? "bg-blue-500/15 text-blue-300" :
                            log.action?.includes("RESTART") ? "bg-orange-500/15 text-orange-300" :
                            "bg-emerald-500/15 text-emerald-300"}`}>{log.action}</span>
                        </td>
                        <td className="px-5 py-2.5 font-mono text-slate-400 max-w-[180px] truncate">{log.resource ?? "—"}</td>
                        <td className="px-5 py-2.5 text-slate-400 truncate max-w-[140px]">{log.userId ?? "—"}</td>
                        <td className="px-5 py-2.5 font-mono text-slate-500">{log.ipAddress ?? "—"}</td>
                        <td className="px-5 py-2.5 text-slate-500">{new Date(log.createdAt).toLocaleString()}</td>
                      </tr>
                    ))}
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
