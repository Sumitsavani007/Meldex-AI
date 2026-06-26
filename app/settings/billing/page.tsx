"use client";

import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { useState, useEffect } from "react";
import { Check, Zap, Users, Package } from "lucide-react";

interface BillingData {
  plan: string;
  status: string;
  currentPeriodEnd?: string;
}

interface Plan {
  id: string;
  name: string;
  price: number;
  period: string;
  description: string;
  features: string[];
  cta: string;
  highlighted?: boolean;
}

const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: 0,
    period: "month",
    description: "Perfect for getting started",
    features: [
      "1 Project",
      "100k tokens/month",
      "5 Agent runs/day",
      "Community support",
      "Basic AI Chat",
    ],
    cta: "Get Started",
  },
  {
    id: "pro",
    name: "Pro",
    price: 29,
    period: "month",
    description: "For individual developers",
    features: [
      "10 Projects",
      "10M tokens/month",
      "100 Agent runs/day",
      "Priority support",
      "Advanced AI Chat",
      "Model switching",
      "Custom integrations",
    ],
    cta: "Start Free Trial",
    highlighted: true,
  },
  {
    id: "team",
    name: "Team",
    price: 99,
    period: "month",
    description: "For teams and organizations",
    features: [
      "Unlimited Projects",
      "100M tokens/month",
      "1000 Agent runs/day",
      "24/7 support",
      "Team collaboration",
      "Advanced analytics",
      "Custom models",
      "SSO & SAML",
    ],
    cta: "Contact Sales",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: 0,
    period: "custom",
    description: "For large organizations",
    features: [
      "Unlimited everything",
      "Dedicated support",
      "SLA guarantee",
      "Custom deployment",
      "On-premise option",
      "Advanced security",
      "Audit logging",
      "Custom billing",
    ],
    cta: "Contact Sales",
  },
];

export default function BillingPage() {
  const { data: session } = useSession();
  const [billing, setBilling] = useState<BillingData | null>(null);

  useEffect(() => {
    if (!session?.user?.id) {
      redirect("/login");
    }
    fetchBilling();
  }, [session]);

  const fetchBilling = async () => {
    try {
      const res = await fetch("/api/billing");
      if (res.ok) {
        const data = await res.json();
        setBilling(data.billing);
      }
    } catch (error) {
      console.error("Failed to fetch billing:", error);
    }
  };

  const currentPlan = billing?.plan || "free";

  return (
    <div className="min-h-screen bg-white px-4 py-8 text-slate-950 dark:bg-black dark:text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-10">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Billing</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">Plans</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Choose the plan that matches how you work.</p>
        </div>

        {billing && (
          <div className="mb-10 rounded-lg border border-slate-200 bg-slate-50 p-5 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">Current Plan</p>
                <p className="mt-1 text-2xl font-semibold capitalize text-slate-950 dark:text-white">{currentPlan}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">Status</p>
                <p className="mt-1 text-2xl font-semibold text-blue-600 dark:text-blue-400">{billing.status}</p>
              </div>
              {billing.currentPeriodEnd && (
                <div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Renews On</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-950 dark:text-white">
                    {new Date(billing.currentPeriodEnd).toLocaleDateString()}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`relative rounded-lg border p-5 transition ${
                plan.highlighted
                  ? "border-blue-600 bg-blue-50 ring-2 ring-blue-600/10 dark:bg-blue-600/10"
                  : "border-slate-200 bg-white hover:border-slate-300 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-white/20"
              }`}
            >
              {plan.highlighted && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2">
                  <span className="rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white">
                    POPULAR
                  </span>
                </div>
              )}

              <h3 className="mb-2 text-xl font-semibold text-slate-950 dark:text-white">{plan.name}</h3>
              <p className="mb-5 text-sm leading-6 text-slate-500 dark:text-slate-400">{plan.description}</p>

              <div className="mb-6">
                <div className="flex items-baseline">
                  <span className="text-4xl font-semibold text-slate-950 dark:text-white">${plan.price}</span>
                  {plan.period !== "custom" && (
                    <span className="ml-2 text-slate-500 dark:text-slate-400">/{plan.period}</span>
                  )}
                </div>
              </div>

              <button
                disabled={currentPlan === plan.id}
                className={`mx-focus mb-6 w-full rounded-lg py-2 text-sm font-medium transition ${
                  currentPlan === plan.id
                    ? "cursor-not-allowed bg-slate-100 text-slate-400 dark:bg-white/5"
                    : plan.highlighted
                    ? "bg-slate-950 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                    : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300 dark:hover:bg-white/[0.06]"
                }`}
              >
                {currentPlan === plan.id ? "Current Plan" : plan.cta}
              </button>

              <div className="space-y-3">
                {plan.features.map((feature) => (
                  <div key={feature} className="flex items-start gap-3">
                    <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600 dark:text-blue-400" />
                    <span className="text-sm text-slate-600 dark:text-slate-300">{feature}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="mb-4 flex items-center gap-3">
              <Zap className="h-5 w-5 text-slate-500" />
              <h3 className="text-lg font-semibold text-slate-950 dark:text-white">Flexible Scaling</h3>
            </div>
            <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">
              Start small and scale up as your needs grow. Pay only for what you use.
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="mb-4 flex items-center gap-3">
              <Users className="h-5 w-5 text-slate-500" />
              <h3 className="text-lg font-semibold text-slate-950 dark:text-white">Team Management</h3>
            </div>
            <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">
              Invite team members and manage permissions with ease on Pro and Team plans.
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="mb-4 flex items-center gap-3">
              <Package className="h-5 w-5 text-slate-500" />
              <h3 className="text-lg font-semibold text-slate-950 dark:text-white">No Hidden Fees</h3>
            </div>
            <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">
              Transparent pricing with no surprises. Cancel anytime without penalties.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
