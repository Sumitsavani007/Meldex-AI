"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { PanelCard, SoftButton, UserPanelShell } from "@/components/user-panel-shell";

type WindowType = "FIVE_HOUR" | "WEEKLY" | "MONTHLY";

type UsageResponse = {
  usage: {
    plan: { name: string; maxContextTokens: number };
    windows: Record<WindowType, { creditsUsed: number; creditsLimit: number; resetAt: string }>;
  };
  transactions: Array<{
    id: string;
    type: string;
    credits: number;
    reason?: string | null;
    metadataJson?: Record<string, unknown> | null;
    createdAt: string;
  }>;
};

export default function UsagePage() {
  const [data, setData] = useState<UsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadUsage() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/usage", { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Usage unavailable");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Usage unavailable");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsage();
  }, []);

  const totalCredits = useMemo(() => data?.transactions.reduce((sum, tx) => sum + (tx.type === "USAGE" ? tx.credits : 0), 0) || 0, [data]);

  return (
    <UserPanelShell title="Usage" description="Credit windows, model usage, and transaction history." eyebrow="Usage">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-slate-500 dark:text-slate-400">{data?.usage.plan.name || "Plan"} · {totalCredits.toLocaleString()} credits used in recent history</div>
        <div className="flex gap-2">
          <SoftButton onClick={loadUsage} disabled={loading}><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />Refresh</SoftButton>
          <a href="/api/usage?format=csv" className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200 dark:hover:bg-white/[0.08]"><Download className="size-4" />Export CSV</a>
        </div>
      </div>

      {error && <PanelCard className="mb-4 border-red-200 bg-red-50 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">{error}</PanelCard>}

      <div className="grid gap-4 md:grid-cols-3">
        {(["FIVE_HOUR", "WEEKLY", "MONTHLY"] as const).map((type) => {
          const window = data?.usage.windows[type];
          const pct = window?.creditsLimit ? Math.min(100, Math.round((window.creditsUsed / window.creditsLimit) * 100)) : 0;
          return (
            <PanelCard key={type}>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">{type.replace("_", " ")}</h2>
                <span className="text-xs text-slate-500">{pct}%</span>
              </div>
              <div className="mt-4 text-2xl font-semibold">{(window?.creditsUsed || 0).toLocaleString()} <span className="text-sm font-normal text-slate-500">/ {(window?.creditsLimit || 0).toLocaleString()}</span></div>
              <div className="mt-3 h-2 rounded-full bg-slate-100 dark:bg-white/10"><div className="h-2 rounded-full bg-violet-600" style={{ width: `${pct}%` }} /></div>
              <p className="mt-2 text-xs text-slate-500">Resets {window ? new Date(window.resetAt).toLocaleString() : "-"}</p>
            </PanelCard>
          );
        })}
      </div>

      <PanelCard className="mt-4 overflow-hidden p-0">
        <div className="border-b border-slate-200 px-4 py-3 dark:border-white/10">
          <h2 className="text-sm font-semibold">Credit Transactions</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-white/10">
              <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Model</th><th className="px-4 py-3">Task</th><th className="px-4 py-3 text-right">Credits</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-white/10">
              {(data?.transactions || []).map((tx) => {
                const meta = tx.metadataJson || {};
                return (
                  <tr key={tx.id}>
                    <td className="px-4 py-3 text-slate-500">{new Date(tx.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3">{tx.type}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{String(meta.model || "-")}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{String(meta.taskId || tx.reason || "-")}</td>
                    <td className="px-4 py-3 text-right font-semibold">{tx.credits.toLocaleString()}</td>
                  </tr>
                );
              })}
              {!data?.transactions?.length && <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">{loading ? "Loading usage..." : "No credit transactions yet."}</td></tr>}
            </tbody>
          </table>
        </div>
      </PanelCard>
    </UserPanelShell>
  );
}
