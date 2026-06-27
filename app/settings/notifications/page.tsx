"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell, ShieldCheck } from "lucide-react";
import { PanelCard, UserPanelShell } from "@/components/user-panel-shell";

type Preference = {
  id: string;
  type: string;
  inAppEnabled: boolean;
  emailEnabled: boolean;
};

const securityTypes = new Set(["new_login", "token_created", "token_revoked", "suspicious_usage", "security_change"]);

function categoryFor(type: string) {
  if (type.includes("payment") || type.includes("subscription") || type === "plan_changed") return "Billing";
  if (type.includes("credit") || type.includes("limit")) return "Usage";
  if (type.includes("token") || type.includes("login") || type.includes("security") || type === "suspicious_usage") return "Security";
  if (type.includes("workspace") || type.includes("agent") || type.includes("preview") || type.includes("download")) return "Workspace";
  return "System";
}

export default function NotificationSettingsPage() {
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      await fetch("/api/notifications", { method: "POST" }).catch(() => undefined);
      const res = await fetch("/api/notifications/preferences", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setPreferences(data.preferences || []);
        setTypes(data.types || []);
      }
    } finally {
      setLoading(false);
    }
  }

  async function update(type: string, field: "inAppEnabled" | "emailEnabled", value: boolean) {
    const res = await fetch("/api/notifications/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, [field]: value }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setPreferences((prev) => {
        const rest = prev.filter((item) => item.type !== type);
        return [...rest, data.preference].sort((a, b) => a.type.localeCompare(b.type));
      });
    }
  }

  useEffect(() => {
    load();
  }, []);

  const prefByType = useMemo(() => new Map(preferences.map((item) => [item.type, item])), [preferences]);
  const grouped = useMemo(() => {
    const result = new Map<string, string[]>();
    for (const type of types) {
      const category = categoryFor(type);
      result.set(category, [...(result.get(category) || []), type]);
    }
    return Array.from(result.entries());
  }, [types]);

  return (
    <UserPanelShell title="Notifications" description="Control in-app and email alerts for billing, credits, workspace, and security events." eyebrow="Notifications">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <PanelCard className="p-0">
          <div className="border-b border-slate-200 px-4 py-3 dark:border-white/10">
            <h2 className="text-sm font-semibold">Preferences</h2>
            <p className="mt-1 text-xs text-slate-500">Security-critical notifications stay enabled.</p>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-white/10">
            {loading && <div className="p-8 text-center text-sm text-slate-500">Loading notification preferences...</div>}
            {!loading && grouped.map(([category, rows]) => (
              <div key={category} className="p-4">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{category}</h3>
                <div className="space-y-2">
                  {rows.map((type) => {
                    const pref = prefByType.get(type) || { type, inAppEnabled: true, emailEnabled: true };
                    const locked = securityTypes.has(type);
                    return (
                      <div key={type} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5 dark:border-white/10">
                        <div>
                          <p className="text-sm font-medium">{type.replaceAll("_", " ")}</p>
                          {locked && <p className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500"><ShieldCheck className="size-3" /> Security required</p>}
                        </div>
                        <div className="flex items-center gap-4 text-xs">
                          <label className="inline-flex items-center gap-2">
                            <input type="checkbox" checked={pref.inAppEnabled} disabled={locked} onChange={(event) => update(type, "inAppEnabled", event.target.checked)} />
                            In-app
                          </label>
                          <label className="inline-flex items-center gap-2">
                            <input type="checkbox" checked={pref.emailEnabled} disabled={locked} onChange={(event) => update(type, "emailEnabled", event.target.checked)} />
                            Email
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </PanelCard>

        <div className="space-y-4">
          <PanelCard>
            <span className="grid size-10 place-items-center rounded-xl bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200">
              <Bell className="size-4" />
            </span>
            <h2 className="mt-3 text-sm font-semibold">How alerts work</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">Meldex creates in-app alerts immediately. Email delivery is logged safely when an email provider is not configured, so product actions never fail because email is unavailable.</p>
          </PanelCard>
        </div>
      </div>
    </UserPanelShell>
  );
}
