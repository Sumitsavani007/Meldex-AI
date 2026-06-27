"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, Check, CreditCard, Download, ExternalLink, Receipt, RefreshCw, Sparkles } from "lucide-react";
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
  stripePriceIdMonthly?: string | null;
  stripePriceIdYearly?: string | null;
  razorpayPlanIdMonthly?: string | null;
  razorpayPlanIdYearly?: string | null;
  paymentEnabled: boolean;
  trialDays: number;
  yearlyDiscount: number;
};

type Subscription = {
  id: string;
  provider: string;
  status: string;
  billingCycle: "MONTHLY" | "YEARLY";
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd: boolean;
  plan: Plan;
};

type Invoice = {
  id: string;
  provider: string;
  status: string;
  amount: number;
  currency: string;
  hostedInvoiceUrl?: string | null;
  invoicePdf?: string | null;
  createdAt: string;
};

type PaymentEvent = {
  id: string;
  provider: string;
  type: string;
  status: string;
  amount?: number | null;
  currency?: string | null;
  createdAt: string;
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
  paymentConfig: {
    provider: "manual" | "stripe" | "razorpay";
    mode: "test" | "live";
    currency: string;
    enabled: boolean;
    stripeConfigured: boolean;
    razorpayConfigured: boolean;
  };
  subscriptions: Subscription[];
  activeSubscription: Subscription | null;
  invoices: Invoice[];
  paymentEvents: PaymentEvent[];
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
  const [checkoutPlan, setCheckoutPlan] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<"MONTHLY" | "YEARLY">("MONTHLY");
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

  async function startCheckout(planId: string) {
    setCheckoutPlan(planId);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, billingCycle }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Checkout failed");
      if (!json.checkoutUrl) throw new Error("Checkout URL missing from provider response");
      window.location.href = json.checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
    } finally {
      setCheckoutPlan(null);
    }
  }

  useEffect(() => {
    loadBilling();
  }, []);

  const current = data?.usage.plan;
  const paymentConfig = data?.paymentConfig;
  const activeSubscription = data?.activeSubscription;
  const pendingByPlan = useMemo(() => new Map((data?.requests || []).filter((request) => request.status === "PENDING").map((request) => [request.requestedPlan.id, request])), [data]);
  const activePlans = (data?.plans || []).filter((plan) => plan.isActive);
  const fiveHour = data?.usage.windows.FIVE_HOUR;
  const weekly = data?.usage.windows.WEEKLY;
  const monthly = data?.usage.windows.MONTHLY;

  return (
    <UserPanelShell title="Billing" description="Subscriptions, usage windows, credits, invoices, and upgrade options." eyebrow="Billing">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {paymentConfig?.enabled
              ? `${paymentConfig.provider === "stripe" ? "Stripe" : "Razorpay"} checkout is ${paymentConfig.mode} mode. Manual admin upgrades remain available.`
              : "Payments not enabled yet. You can request an admin-reviewed upgrade."}
          </p>
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
                {activeSubscription ? (
                  <div className="mt-4 inline-flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300">
                    <CreditCard className="size-4 text-violet-600" />
                    {activeSubscription.provider} · {activeSubscription.status} · {activeSubscription.billingCycle.toLowerCase()}
                    <span className="text-slate-400">Renews {activeSubscription.currentPeriodEnd ? new Date(activeSubscription.currentPeriodEnd).toLocaleString() : "not set"}</span>
                  </div>
                ) : (
                  <div className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                    <AlertTriangle className="size-4" /> No active paid subscription.
                  </div>
                )}
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

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-[#111113]">
            <div className="text-sm">
              <div className="font-semibold">Billing cycle</div>
              <div className="text-xs text-slate-500">Select monthly or yearly before checkout.</div>
            </div>
            <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1 dark:bg-white/[0.06]">
              {(["MONTHLY", "YEARLY"] as const).map((cycle) => (
                <button
                  key={cycle}
                  onClick={() => setBillingCycle(cycle)}
                  className={`h-9 rounded-lg px-4 text-sm font-semibold transition ${billingCycle === cycle ? "bg-white text-violet-700 shadow-sm dark:bg-[#1b1b20] dark:text-violet-200" : "text-slate-500 hover:text-slate-900 dark:hover:text-white"}`}
                >
                  {cycle === "MONTHLY" ? "Monthly" : "Yearly"}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {activePlans.map((plan) => {
              const isCurrent = current?.id === plan.id;
              const pending = pendingByPlan.get(plan.id);
              const isHigher = current ? plan.priorityLevel > current.priorityLevel : false;
              const features = Array.isArray(plan.featuresJson) ? plan.featuresJson : [];
              const cyclePrice = billingCycle === "YEARLY" ? plan.priceYearly : plan.priceMonthly;
              const providerPlanConfigured = paymentConfig?.provider === "stripe"
                ? Boolean(billingCycle === "YEARLY" ? plan.stripePriceIdYearly : plan.stripePriceIdMonthly)
                : paymentConfig?.provider === "razorpay"
                  ? Boolean(billingCycle === "YEARLY" ? plan.razorpayPlanIdYearly : plan.razorpayPlanIdMonthly)
                  : false;
              const canCheckout = Boolean(paymentConfig?.enabled && isHigher && !isCurrent);
              const checkoutHint = paymentConfig?.enabled
                ? providerPlanConfigured
                  ? `${paymentConfig.provider === "stripe" ? "Stripe" : "Razorpay"} checkout ready.`
                  : `${paymentConfig.provider === "stripe" ? "Stripe price" : "Razorpay plan"} mapping will be validated at checkout.`
                : "Manual admin upgrade only.";
              const actionLabel = isCurrent
                ? "Current Plan"
                : pending
                  ? "Request Pending"
                  : canCheckout
                    ? checkoutPlan === plan.id ? "Redirecting..." : "Upgrade"
                    : requestingPlan === plan.id ? "Requesting..." : "Request Upgrade";
              return (
                <div key={plan.id} className={`relative rounded-2xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:bg-[#111113] ${isCurrent ? "border-violet-300 ring-2 ring-violet-600/10 dark:border-violet-400/30" : "border-slate-200 dark:border-white/10"}`}>
                  {isCurrent && <span className="absolute right-4 top-4 rounded-full bg-violet-600 px-2 py-1 text-[10px] font-semibold uppercase text-white">Current</span>}
                  <h3 className="pr-16 text-lg font-semibold">{plan.name}</h3>
                  <p className="mt-1 min-h-10 text-sm text-slate-500 dark:text-slate-400">{plan.description}</p>
                  <div className="mt-5 text-3xl font-semibold">{money(cyclePrice, plan.currency)}<span className="text-sm font-normal text-slate-500"> / {billingCycle === "YEARLY" ? "yr" : "mo"}</span></div>
                  {billingCycle === "YEARLY" && plan.yearlyDiscount > 0 && <div className="mt-1 text-xs font-semibold text-emerald-600">Save {plan.yearlyDiscount}% yearly</div>}
                  <div className="mt-4 grid gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <div>{plan.fiveHourCredits.toLocaleString()} credits / 5h</div>
                    <div>{plan.weeklyCredits.toLocaleString()} credits / week</div>
                    <div>{plan.monthlyCredits.toLocaleString()} credits / month</div>
                    <div>{plan.maxContextTokens.toLocaleString()} context tokens</div>
                    <div>{plan.maxWorkspaceCount.toLocaleString()} workspaces · {plan.maxStorageMb.toLocaleString()} MB</div>
                  </div>
                  <SoftButton
                    disabled={isCurrent || !isHigher || Boolean(pending) || requestingPlan === plan.id || checkoutPlan === plan.id}
                    title={isCurrent ? "This is your current plan" : pending ? "Upgrade request is pending" : !isHigher ? "Select a higher plan" : canCheckout ? checkoutHint : "Payments are not enabled. Request admin upgrade."}
                    variant={isCurrent || pending ? "secondary" : "primary"}
                    className="mt-5 w-full"
                    onClick={() => canCheckout ? startCheckout(plan.id) : requestUpgrade(plan.id)}
                  >
                    {actionLabel}
                  </SoftButton>
                  {!isCurrent && !pending && <p className="mt-2 text-center text-[11px] text-slate-500">{checkoutHint}</p>}
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
              <div><h2 className="text-sm font-semibold">Payment status</h2><p className="text-xs text-slate-500">{paymentConfig?.provider || "manual"} · {paymentConfig?.mode || "test"}</p></div>
            </div>
            <div className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
              <div className="flex gap-2"><Check className="mt-0.5 size-4 text-emerald-500" />{paymentConfig?.enabled ? "Checkout is enabled for configured plan mappings." : "Payments not enabled yet."}</div>
              <div className="flex gap-2"><Check className="mt-0.5 size-4 text-emerald-500" />Admin/manual plan assignment remains available.</div>
              <div className="flex gap-2"><Check className="mt-0.5 size-4 text-emerald-500" />Plan limits and credits come from the database.</div>
            </div>
          </PanelCard>
          <PanelCard>
            <h2 className="flex items-center gap-2 text-sm font-semibold"><CalendarClock className="size-4 text-violet-600" /> Subscription</h2>
            {activeSubscription ? (
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 dark:bg-white/[0.04]"><span>Plan</span><span>{activeSubscription.plan.name}</span></div>
                <div className="flex justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 dark:bg-white/[0.04]"><span>Status</span><span>{activeSubscription.status}</span></div>
                <div className="flex justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 dark:bg-white/[0.04]"><span>Cycle</span><span>{activeSubscription.billingCycle}</span></div>
                <div className="flex justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 dark:bg-white/[0.04]"><span>Renewal</span><span className="text-xs">{activeSubscription.currentPeriodEnd ? new Date(activeSubscription.currentPeriodEnd).toLocaleDateString() : "-"}</span></div>
                <SoftButton disabled title="Provider customer portal is not enabled yet." className="w-full">Manage subscription</SoftButton>
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">No active subscription. Choose a paid plan or request admin approval.</p>
            )}
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
            <h2 className="flex items-center gap-2 text-sm font-semibold"><Receipt className="size-4 text-violet-600" /> Invoices</h2>
            <div className="mt-4 space-y-2">
              {(data?.invoices || []).slice(0, 5).map((invoice) => (
                <div key={invoice.id} className="rounded-xl border border-slate-200 p-3 text-sm dark:border-white/10">
                  <div className="flex justify-between gap-3"><span className="font-medium">{money(invoice.amount, invoice.currency)}</span><span className="text-xs text-slate-500">{invoice.status}</span></div>
                  <p className="mt-1 text-xs text-slate-500">{invoice.provider} · {new Date(invoice.createdAt).toLocaleString()}</p>
                  {invoice.hostedInvoiceUrl && <a className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-violet-600" href={invoice.hostedInvoiceUrl} target="_blank" rel="noreferrer">Open invoice <ExternalLink className="size-3" /></a>}
                </div>
              ))}
              {!data?.invoices?.length && <p className="text-sm text-slate-500">Invoices will appear after checkout or webhook sync.</p>}
            </div>
          </PanelCard>
          <PanelCard>
            <h2 className="text-sm font-semibold">Payment events</h2>
            <div className="mt-4 space-y-2">
              {(data?.paymentEvents || []).slice(0, 5).map((event) => <div key={event.id} className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-white/[0.04]"><div className="font-medium">{event.type}</div><p className="mt-1 text-xs text-slate-500">{event.provider} · {event.status} · {new Date(event.createdAt).toLocaleString()}</p></div>)}
              {!data?.paymentEvents?.length && <p className="text-sm text-slate-500">Webhook events will appear here.</p>}
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
