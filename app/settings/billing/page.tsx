"use client";

import { useEffect, useState } from "react";
import { BarChart3, Check, CreditCard, Download, Package, Users, Zap } from "lucide-react";
import { PanelCard, SoftButton, UserPanelShell } from "@/components/user-panel-shell";

interface BillingData {
  plan: string;
  status: string;
  currentPeriodEnd?: string;
}

const plans = [
  { id: "free", name: "Free", price: "$0", description: "For trying Meldex", features: ["1 workspace", "Basic AI chat", "Community support"] },
  { id: "pro", name: "Pro", price: "$29", description: "For serious builders", features: ["10 workspaces", "Priority agent runs", "Extension tokens", "Model switching"], highlighted: true },
  { id: "team", name: "Team", price: "$99", description: "For product teams", features: ["Unlimited projects", "Team collaboration", "Advanced analytics", "Shared billing"] },
  { id: "enterprise", name: "Enterprise", price: "Custom", description: "For scale", features: ["SLA", "Custom deployment", "Audit logs", "Dedicated support"] },
];

export default function BillingPage() {
  const [billing, setBilling] = useState<BillingData | null>(null);

  useEffect(() => {
    fetch("/api/billing")
      .then((res) => res.ok ? res.json() : null)
      .then((data) => setBilling(data?.billing || null))
      .catch(() => setBilling(null));
  }, []);

  const currentPlan = billing?.plan || "free";

  return (
    <UserPanelShell title="Billing" description="Plan, usage, invoices, and subscription controls." eyebrow="Billing">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="space-y-5">
          <PanelCard className="overflow-hidden">
            <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">Current Plan</p>
                <h2 className="mt-1 text-3xl font-semibold capitalize">{currentPlan}</h2>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  Status: <span className="font-medium text-emerald-600 dark:text-emerald-300">{billing?.status || "active"}</span>
                </p>
              </div>
              <div className="grid min-w-[260px] gap-2 rounded-2xl bg-slate-50 p-4 dark:bg-white/[0.04]">
                <div className="flex items-center justify-between text-sm"><span className="text-slate-500">Tokens used</span><span className="font-semibold">2.4M</span></div>
                <div className="h-2 rounded-full bg-slate-200 dark:bg-white/10"><div className="h-2 w-[42%] rounded-full bg-violet-600" /></div>
                <p className="text-xs text-slate-500 dark:text-slate-400">42% of monthly allowance</p>
              </div>
            </div>
          </PanelCard>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {plans.map((plan) => (
              <div key={plan.id} className={`relative rounded-2xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:bg-[#111113] ${plan.highlighted ? "border-violet-300 ring-2 ring-violet-600/10 dark:border-violet-400/30" : "border-slate-200 dark:border-white/10"}`}>
                {plan.highlighted && <span className="absolute right-4 top-4 rounded-full bg-violet-600 px-2 py-1 text-[10px] font-semibold uppercase text-white">Popular</span>}
                <h3 className="text-lg font-semibold">{plan.name}</h3>
                <p className="mt-1 min-h-10 text-sm text-slate-500 dark:text-slate-400">{plan.description}</p>
                <div className="mt-5 text-3xl font-semibold">{plan.price}</div>
                <SoftButton disabled title={currentPlan === plan.id ? "This is your current plan" : "Plan changes are not enabled in this release"} variant={plan.highlighted ? "primary" : "secondary"} className="mt-5 w-full">
                  {currentPlan === plan.id ? "Current Plan" : "Upgrade"}
                </SoftButton>
                <div className="mt-5 space-y-3">
                  {plan.features.map((feature) => (
                    <div key={feature} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                      <Check className="mt-0.5 size-4 shrink-0 text-violet-600" />
                      {feature}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <aside className="space-y-5">
          <PanelCard>
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200"><BarChart3 className="size-4" /></span>
              <div><h2 className="text-sm font-semibold">Usage</h2><p className="text-xs text-slate-500">Last 30 days</p></div>
            </div>
            <div className="mt-5 flex h-28 items-end gap-2">
              {[30, 52, 45, 70, 58, 85, 62, 74].map((height, index) => (
                <div key={index} className="flex-1 rounded-t-lg bg-violet-100 dark:bg-violet-500/20" style={{ height: `${height}%` }} />
              ))}
            </div>
          </PanelCard>
          <PanelCard>
            <h2 className="text-sm font-semibold">Invoices</h2>
            <div className="mt-4 space-y-2">
              {["June 2026", "May 2026", "April 2026"].map((invoice) => (
                <button key={invoice} disabled title="Invoice download is not available in this release" className="flex w-full cursor-not-allowed items-center justify-between rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-500 dark:bg-white/[0.04]">
                  {invoice}<Download className="size-4" />
                </button>
              ))}
            </div>
          </PanelCard>
          <div className="grid gap-3">
            {[
              [Zap, "Flexible scaling"],
              [Users, "Team ready"],
              [Package, "No hidden fees"],
              [CreditCard, "Secure billing"],
            ].map(([Icon, label]) => (
              <div key={String(label)} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm font-medium dark:border-white/10 dark:bg-[#111113]">
                <Icon className="size-4 text-violet-600" />
                {String(label)}
              </div>
            ))}
          </div>
        </aside>
      </div>
    </UserPanelShell>
  );
}
