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
    <div className="min-h-screen bg-gradient-to-br from-ink via-slate-900 to-slate-800 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-white mb-2">Billing & Plans</h1>
          <p className="text-slate-400">Choose the perfect plan for your needs</p>
        </div>

        {billing && (
          <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-xl p-6 mb-12">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <p className="text-slate-400 text-sm">Current Plan</p>
                <p className="text-2xl font-bold text-white capitalize">{currentPlan}</p>
              </div>
              <div>
                <p className="text-slate-400 text-sm">Status</p>
                <p className="text-2xl font-bold text-green-400">{billing.status}</p>
              </div>
              {billing.currentPeriodEnd && (
                <div>
                  <p className="text-slate-400 text-sm">Renews On</p>
                  <p className="text-2xl font-bold text-white">
                    {new Date(billing.currentPeriodEnd).toLocaleDateString()}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`relative rounded-xl border transition ${
                plan.highlighted
                  ? "border-mint bg-slate-800/80 ring-2 ring-mint/20 md:scale-105"
                  : "border-white/10 bg-slate-800/50 hover:border-mint/50"
              } backdrop-blur-xl p-6`}
            >
              {plan.highlighted && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2">
                  <span className="bg-mint text-slate-950 px-3 py-1 rounded-full text-xs font-bold">
                    POPULAR
                  </span>
                </div>
              )}

              <h3 className="text-xl font-bold text-white mb-2">{plan.name}</h3>
              <p className="text-slate-400 text-sm mb-4">{plan.description}</p>

              <div className="mb-6">
                <div className="flex items-baseline">
                  <span className="text-4xl font-bold text-white">${plan.price}</span>
                  {plan.period !== "custom" && (
                    <span className="text-slate-400 ml-2">/{plan.period}</span>
                  )}
                </div>
              </div>

              <button
                disabled={currentPlan === plan.id}
                className={`w-full py-2 rounded-lg font-medium transition mb-6 ${
                  currentPlan === plan.id
                    ? "bg-slate-700 text-slate-400 cursor-not-allowed"
                    : plan.highlighted
                    ? "bg-mint text-slate-950 hover:bg-mint/90"
                    : "bg-slate-700 hover:bg-slate-600 text-slate-300"
                }`}
              >
                {currentPlan === plan.id ? "Current Plan" : plan.cta}
              </button>

              <div className="space-y-3">
                {plan.features.map((feature) => (
                  <div key={feature} className="flex items-start gap-3">
                    <Check className="w-4 h-4 text-mint flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-slate-300">{feature}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <Zap className="w-5 h-5 text-mint" />
              <h3 className="text-lg font-semibold text-white">Flexible Scaling</h3>
            </div>
            <p className="text-slate-400 text-sm">
              Start small and scale up as your needs grow. Pay only for what you use.
            </p>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <Users className="w-5 h-5 text-mint" />
              <h3 className="text-lg font-semibold text-white">Team Management</h3>
            </div>
            <p className="text-slate-400 text-sm">
              Invite team members and manage permissions with ease on Pro and Team plans.
            </p>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <Package className="w-5 h-5 text-mint" />
              <h3 className="text-lg font-semibold text-white">No Hidden Fees</h3>
            </div>
            <p className="text-slate-400 text-sm">
              Transparent pricing with no surprises. Cancel anytime without penalties.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
