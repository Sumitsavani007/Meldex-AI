"use client";

import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import {
  Database,
  Shield,
  Cpu,
  FolderOpen,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
} from "lucide-react";

interface Check {
  status: "ok" | "degraded" | "error";
  latencyMs?: number;
  detail?: string;
}

interface HealthData {
  status: "ok" | "degraded" | "error";
  timestamp: string;
  version: string;
  checks: {
    database: Check;
    auth: Check;
    ollama: Check;
    workspace: Check;
  };
}

function StatusBadge({ status }: { status: Check["status"] }) {
  if (status === "ok")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-500/20 text-green-400 border border-green-500/30">
        <CheckCircle2 className="w-3 h-3" /> OK
      </span>
    );
  if (status === "degraded")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
        <AlertTriangle className="w-3 h-3" /> Degraded
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30">
      <XCircle className="w-3 h-3" /> Error
    </span>
  );
}

const checkMeta: Record<
  keyof HealthData["checks"],
  { label: string; icon: React.ElementType; desc: string }
> = {
  database: {
    label: "Database",
    icon: Database,
    desc: "PostgreSQL connection via Prisma",
  },
  auth: {
    label: "Authentication",
    icon: Shield,
    desc: "NextAuth JWT + NEXTAUTH_SECRET",
  },
  ollama: {
    label: "Ollama AI",
    icon: Cpu,
    desc: "Local LLM server for chat & agents",
  },
  workspace: {
    label: "Workspace",
    icon: FolderOpen,
    desc: "File workspace directory",
  },
};

export default function SystemDiagnosticsPage() {
  const { data: session, status } = useSession();
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  if (status === "loading") return null;
  if (!session?.user?.role || !["ADMIN", "OWNER"].includes(session.user.role)) {
    redirect("/unauthorized");
  }

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/health");
      const data = await res.json();
      setHealth(data);
      setLastRefresh(new Date());
    } catch {
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchHealth, 30_000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  const overallColor =
    !health ? "text-slate-400" :
    health.status === "ok" ? "text-green-400" :
    health.status === "degraded" ? "text-yellow-400" :
    "text-red-400";

  return (
    <div className="min-h-screen bg-gradient-to-br from-ink via-slate-900 to-slate-800 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">System Diagnostics</h1>
            <p className="text-slate-400">Real-time health status of all subsystems</p>
          </div>
          <button
            onClick={fetchHealth}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700/50 hover:bg-slate-700 border border-white/10 rounded-lg text-slate-300 text-sm transition disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* Overall status banner */}
        <div
          className={`mb-6 p-4 rounded-xl border ${
            !health
              ? "bg-slate-800/50 border-white/10"
              : health.status === "ok"
              ? "bg-green-500/10 border-green-500/30"
              : health.status === "degraded"
              ? "bg-yellow-500/10 border-yellow-500/30"
              : "bg-red-500/10 border-red-500/30"
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <span className="text-slate-400 text-sm">Overall Status</span>
              <p className={`text-2xl font-bold capitalize mt-0.5 ${overallColor}`}>
                {loading ? "Checking…" : health ? health.status : "Unavailable"}
              </p>
            </div>
            {health && (
              <div className="text-right text-xs text-slate-500">
                <p>Version {health.version}</p>
                <p className="flex items-center gap-1 justify-end mt-1">
                  <Clock className="w-3 h-3" />
                  {lastRefresh?.toLocaleTimeString()}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Check cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(Object.keys(checkMeta) as (keyof HealthData["checks"])[]).map((key) => {
            const meta = checkMeta[key];
            const check = health?.checks[key];
            const Icon = meta.icon;

            return (
              <div
                key={key}
                className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-xl p-6"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-mint/10 border border-mint/20">
                      <Icon className="w-5 h-5 text-mint" />
                    </div>
                    <div>
                      <h3 className="text-white font-semibold">{meta.label}</h3>
                      <p className="text-slate-500 text-xs">{meta.desc}</p>
                    </div>
                  </div>
                  {loading ? (
                    <span className="text-xs text-slate-500 animate-pulse">Checking…</span>
                  ) : check ? (
                    <StatusBadge status={check.status} />
                  ) : (
                    <StatusBadge status="error" />
                  )}
                </div>

                {check && (
                  <div className="mt-3 space-y-1 text-xs text-slate-400">
                    {check.latencyMs !== undefined && (
                      <p>
                        Latency:{" "}
                        <span className="text-slate-200">{check.latencyMs} ms</span>
                      </p>
                    )}
                    {check.detail && (
                      <p className={check.status !== "ok" ? "text-yellow-400" : ""}>
                        {check.detail}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Environment variables hint for admins */}
        <div className="mt-8 bg-slate-800/30 border border-white/5 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-3">Required Environment Variables</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
            {[
              "DATABASE_URL",
              "NEXTAUTH_SECRET",
              "NEXTAUTH_URL",
              "GOOGLE_CLIENT_ID",
              "GOOGLE_CLIENT_SECRET",
              "GITHUB_ID",
              "GITHUB_SECRET",
              "OLLAMA_BASE_URL",
              "DEFAULT_MODEL",
            ].map((v) => (
              <div key={v} className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    ["DATABASE_URL", "NEXTAUTH_SECRET", "NEXTAUTH_URL"].includes(v)
                      ? "bg-red-400"
                      : "bg-yellow-400"
                  }`}
                />
                <span className="text-slate-400">{v}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-600 mt-3">
            <span className="text-red-400">●</span> Required&nbsp;&nbsp;
            <span className="text-yellow-400">●</span> Recommended
          </p>
        </div>
      </div>
    </div>
  );
}
