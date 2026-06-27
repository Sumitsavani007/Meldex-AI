"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { Calendar, CreditCard, KeyRound, Mail, Shield, User } from "lucide-react";
import { PanelCard, SoftButton, UserPanelShell } from "@/components/user-panel-shell";

export default function ProfileSettingsPage() {
  const { data: session, status } = useSession({ required: true });
  const [planName, setPlanName] = useState("Plan");

  useEffect(() => {
    fetch("/api/usage", { cache: "no-store" })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => setPlanName(data?.usage?.plan?.name || "Plan"))
      .catch(() => undefined);
  }, []);

  if (status === "loading") {
    return <UserPanelShell title="Profile" eyebrow="Profile"><div className="h-80 animate-pulse rounded-2xl bg-slate-100 dark:bg-white/[0.06]" /></UserPanelShell>;
  }

  return (
    <UserPanelShell title="Profile" description="Your Meldex identity, plan, security, and connected access." eyebrow="Profile">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <PanelCard>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            <span className="grid size-20 place-items-center rounded-full bg-violet-600 text-2xl font-semibold text-white shadow-sm shadow-violet-600/20">
              {(session?.user?.name?.[0] || session?.user?.email?.[0] || "U").toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-2xl font-semibold">{session?.user?.name || "Meldex User"}</h2>
              <p className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400">{session?.user?.email}</p>
              <span className="mt-3 inline-flex rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 dark:bg-violet-500/15 dark:text-violet-200">{planName}</span>
            </div>
            <SoftButton disabled title="Profile editing is not available in this release">Edit Profile</SoftButton>
          </div>
          <div className="mt-8 grid gap-3 md:grid-cols-2">
            {[
              [Mail, "Email", session?.user?.email || "Not set"],
              [Calendar, "Member Since", new Date().toLocaleDateString()],
              [User, "Role", session?.user?.role || "User"],
              [Shield, "Authentication", "Google / Credentials"],
            ].map(([Icon, label, value]) => (
              <div key={String(label)} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.04]">
                <Icon className="mb-3 size-4 text-violet-600" />
                <p className="text-xs text-slate-500 dark:text-slate-400">{String(label)}</p>
                <p className="mt-1 truncate text-sm font-semibold">{String(value)}</p>
              </div>
            ))}
          </div>
        </PanelCard>

        <aside className="space-y-5">
          <PanelCard>
            <h2 className="text-sm font-semibold">Account Links</h2>
            <div className="mt-4 space-y-1">
              {[
                ["/settings/security", Shield, "Security"],
                ["/settings/tokens", KeyRound, "API Tokens"],
                ["/settings/billing", CreditCard, "Billing"],
              ].map(([href, Icon, label]) => (
                <Link key={String(href)} href={String(href)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium hover:bg-slate-50 dark:hover:bg-white/[0.05]">
                  <Icon className="size-4 text-slate-500" />
                  {String(label)}
                </Link>
              ))}
            </div>
          </PanelCard>
          <PanelCard>
            <h2 className="text-sm font-semibold">Sessions</h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Session management UI is not available in this release.</p>
            <SoftButton disabled title="Session management UI is not available yet" className="mt-4 w-full">Manage Sessions</SoftButton>
          </PanelCard>
        </aside>
      </div>
    </UserPanelShell>
  );
}
