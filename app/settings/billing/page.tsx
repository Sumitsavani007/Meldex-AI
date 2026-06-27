"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, CreditCard, Download, RefreshCw, Sparkles } from "lucide-react";
import { PanelCard, SoftButton, UserPanelShell } from "@/components/user-panel-shell";

type WindowType = "FIVE_HOUR" | "WEEKLY" | "MONTHLY";

type Plan = {
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
  featuresJson?: string[] | null;
  isActive: boolean;
};

type BillingResponse = {
  plans: Plan[];
  usage: {
    plan: Plan;
    windows: Record<WindowType, { creditsUsed: number; creditsLimit: number; resetAt: string }>;
  };
  requests: Array<{
    id: string;
    status: string;
    message?: string | null;
    adminNote?: string | null;
    createdAt: string;
    requestedPlan: Plan;
  }>;
  notifications: Array<{ id: string; type: string; title: string; message: string; createdAt: string }>;
};

function money(cents: number, currency: string) {
  if (!cents) return "$0";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

function usagePct(used = 0, limit = 0) {
  return limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
}

export default function BillingPage() {
  const [data, setData] = useState<BillingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [requestingPlan, setRequestingPlan] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadBilling() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/billing", { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Billing unavailable");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Billing unavailable");
    } finally {
      setLoading(false);
    }
  }

  async function requestUpgrade(planId: string) {
    setRequestingPlan(planId);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, message: "Manual upgrade requested from billing page." }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Upgrade request failed");
      setMessage(json.message || "Upgrade request sent. Payment is coming soon, so an admin will review this manually.");
      await loadBilling();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upgrade request failed");
    } finally {
      setRequestingPlan(null);
    }
  }

  useEffect(() => {
    loadBilling();
  }, []);

  const current = data?.usage.plan;
  const pendingByPlan = useMemo(() => new Map((data?.requests || []).filter((request) => request.status === "PENDING").map((request) => [request.requestedPlan.id, request])), [data]);
  const activePlans = (data?.plans || []).filter((plan) => plan.isActive);
  const fiveHour = data?.usage.windows.FIVE_HOUR;
  const weekly = data?.usage.windows.WEEKLY;
  const monthly = data?.usage.windows.MONTHLY;

  return (
    <UserPanelShell title="Billing" description="Plan limits, usage windows, and manual upgrade requests." eyebrow="Billing">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400">Payment gateway is coming soon. Upgrades are admin-approved for now.</p>
        </div>
        <div className="flex gap-2">
          <SoftButton onClick={loadBilling} disabled={loading}><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />Refresh</SoftButton>
          <a href="/api/usage?format=csv" className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200 dark:hover:bg-white/[0.08]"><Download className="size-4" />Export usage</a>
        </div>
      </div>

      {error && <PanelCard className="mb-4 border-red-200 bg-red-50 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">{error}</PanelCard>}
      {message && <PanelCard className="mb-4 border-emerald-200 bg-emerald-50 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">{message}</PanelCard>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="space-y-5">
          <PanelCard>
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">Current plan</p>
                <h2 className="mt-1 text-3xl font-semibold">{current?.name || "Loading"}</h2>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  Context {current?.maxContextTokens.toLocaleString() || "-"} tokens · {current?.maxWorkspaceCount || 0} workspaces · {current?.maxStorageMb || 0} MB storage
                </p>
              </div>
              <div className="grid min-w-[280px] gap-3 rounded-2xl bg-slate-50 p-4 dark:bg-white/[0.04]">
                {[
                  ["5-hour", fiveHour],
                  ["Weekly", weekly],
                  ["Monthly", monthly],
                ].map(([label, window]) => {
                  const item = window as typeof fiveHour | undefined;
                  const pct = usagePct(item?.creditsUsed, item?.creditsLimit);
                  return (
                    <div key={String(label)}>
                      <div className="mb-1 flex justify-between text-xs"><span>{String(label)}</span><span>{(item?.creditsUsed || 0).toLocaleString()} / {(item?.creditsLimit || 0).toLocaleString()}</span></div>
                      <div className="h-2 rounded-full bg-slate-200 dark:bg-white/10"><div className="h-2 rounded-full bg-violet-600" style={{ width: `${pct}%` }} /></div>
                    </div>
                  );
                })}
              </div>
            </div>
          </PanelCard>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {activePlans.map((plan) => {
              const isCurrent = current?.id === plan.id;
              const pending = pendingByPlan.get(plan.id);
              const isHigher = current ? plan.priorityLevel > current.priorityLevel : false;
              const features = Array.isArray(plan.featuresJson) ? plan.featuresJson : [];
              return (
                <div key={plan.id} className={`relative rounded-2xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:bg-[#111113] ${isCurrent ? "border-violet-300 ring-2 ring-violet-600/10 dark:border-violet-400/30" : "border-slate-200 dark:border-white/10"}`}>
                  {isCurrent && <span className="absolute right-4 top-4 rounded-full bg-violet-600 px-2 py-1 text-[10px] font-semibold uppercase text-white">Current</span>}
                  <h3 className="pr-16 text-lg font-semibold">{plan.name}</h3>
                  <p className="mt-1 min-h-10 text-sm text-slate-500 dark:text-slate-400">{plan.description}</p>
                  <div className="mt-5 text-3xl font-semibold">{money(plan.priceMonthly, plan.currency)}<span className="text-sm font-normal text-slate-500"> / mo</span></div>
                  <div className="mt-4 grid gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <div>{plan.fiveHourCredits.toLocaleString()} credits / 5h</div>
                    <div>{plan.weeklyCredits.toLocaleString()} credits / week</div>
                    <div>{plan.monthlyCredits.toLocaleString()} credits / month</div>
                    <div>{plan.maxContextTokens.toLocaleString()} context tokens</div>
                    <div>{plan.maxWorkspaceCount.toLocaleString()} workspaces · {plan.maxStorageMb.toLocaleString()} MB</div>
                  </div>
                  <SoftButton
                    disabled={isCurrent || !isHigher || Boolean(pending) || requestingPlan === plan.id}
                    title={isCurrent ? "This is your current plan" : pending ? "Upgrade request is pending" : !isHigher ? "Select a higher plan" : "Request manual admin upgrade"}
                    variant={isCurrent || pending ? "secondary" : "primary"}
                    className="mt-5 w-full"
                    onClick={() => requestUpgrade(plan.id)}
                  >
                    {isCurrent ? "Current Plan" : pending ? "Request Pending" : requestingPlan === plan.id ? "Requesting..." : "Request Upgrade"}
                  </SoftButton>
                  <div className="mt-5 space-y-3">
                    {features.map((feature) => (
                      <div key={feature} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                        <Check className="mt-0.5 size-4 shrink-0 text-violet-600" />
                        {feature}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <aside className="space-y-5">
          <PanelCard>
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200"><CreditCard className="size-4" /></span>
              <div><h2 className="text-sm font-semibold">Upgrade flow</h2><p className="text-xs text-slate-500">Manual approval mode</p></div>
            </div>
            <div className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
              <div className="flex gap-2"><Check className="mt-0.5 size-4 text-emerald-500" />Payment coming soon message shown before paid checkout exists.</div>
              <div className="flex gap-2"><Check className="mt-0.5 size-4 text-emerald-500" />Admin can approve and assign plan instantly.</div>
              <div className="flex gap-2"><Check className="mt-0.5 size-4 text-emerald-500" />Credits and limits update from DB.</div>
            </div>
          </PanelCard>
          <PanelCard>
            <h2 className="text-sm font-semibold">Reset dates</h2>
            <div className="mt-4 space-y-3 text-sm">
              {([
                ["5-hour", fiveHour],
                ["Weekly", weekly],
                ["Monthly", monthly],
              ] as Array<[string, typeof fiveHour]>).map(([label, window]) => <div key={label} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 dark:bg-white/[0.04]"><span>{label}</span><span className="text-xs text-slate-500">{window?.resetAt ? new Date(window.resetAt).toLocaleString() : "-"}</span></div>)}
            </div>
          </PanelCard>
          <PanelCard>
            <h2 className="text-sm font-semibold">Requests</h2>
            <div className="mt-4 space-y-2">
              {(data?.requests || []).slice(0, 5).map((request) => (
                <div key={request.id} className="rounded-xl border border-slate-200 p-3 text-sm dark:border-white/10">
                  <div className="flex justify-between gap-3"><span className="font-medium">{request.requestedPlan.name}</span><span className="text-xs text-slate-500">{request.status}</span></div>
                  <p className="mt-1 text-xs text-slate-500">{request.adminNote || request.message || "Awaiting admin review."}</p>
                </div>
              ))}
              {!data?.requests?.length && <p className="text-sm text-slate-500">No upgrade requests yet.</p>}
            </div>
          </PanelCard>
          <PanelCard>
            <h2 className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="size-4 text-violet-600" /> Notifications</h2>
            <div className="mt-4 space-y-2">
              {(data?.notifications || []).slice(0, 4).map((item) => <div key={item.id} className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-white/[0.04]"><div className="font-medium">{item.title}</div><p className="mt-1 text-xs text-slate-500">{item.message}</p></div>)}
              {!data?.notifications?.length && <p className="text-sm text-slate-500">Billing notifications will appear here.</p>}
            </div>
          </PanelCard>
          <PanelCard className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
            <div className="flex gap-2 text-sm"><AlertTriangle className="mt-0.5 size-4" /> AI generation pauses when credits are exhausted, but files, preview, downloads, and workspace access stay available.</div>
          </PanelCard>
        </aside>
      </div>
    </UserPanelShell>
  );
}
