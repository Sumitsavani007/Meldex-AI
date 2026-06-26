"use client";

import Link from "next/link";
import { Bell, Brush, CreditCard, KeyRound, Languages, Monitor, Moon, Shield, Sun, User } from "lucide-react";
import { PanelCard, SoftButton, UserPanelShell } from "@/components/user-panel-shell";
import { useThemePreference } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

const settingsSections = [
  { href: "/settings/profile", label: "Profile", description: "Name, email, avatar, and account plan.", icon: User },
  { href: "/settings/security", label: "Security", description: "Password, sessions, recovery, and account safety.", icon: Shield },
  { href: "/settings/tokens", label: "API Tokens", description: "Create and revoke extension, CLI, and benchmark tokens.", icon: KeyRound },
  { href: "/settings/billing", label: "Billing", description: "Subscription, usage, invoices, and plan controls.", icon: CreditCard },
  { href: "/settings/models", label: "Models", description: "Provider configuration, model health, and defaults.", icon: Monitor },
  { href: "/settings/brain", label: "Brain", description: "AI routing preferences and provider diagnostics.", icon: Brush },
];

export default function SettingsPage() {
  const { theme, setTheme } = useThemePreference();

  return (
    <UserPanelShell title="Settings" description="Account, appearance, access, and product preferences." eyebrow="Settings">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <PanelCard>
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold">General</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Workspace defaults and visual comfort for this device.</p>
            </div>
            <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 dark:border-violet-400/20 dark:bg-violet-500/10 dark:text-violet-200">Synced</span>
          </div>

          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium">Default Model</label>
              <select className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-violet-300 dark:border-white/10 dark:bg-white/[0.04]">
                <option>Qwen3-Coder via OpenRouter</option>
                <option>GPT-4o</option>
                <option>Claude Sonnet</option>
              </select>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Theme</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: "light" as const, label: "Light", icon: Sun },
                  { value: "dark" as const, label: "Dark", icon: Moon },
                  { value: "system" as const, label: "System", icon: Monitor },
                ].map((option) => {
                  const active = theme === option.value;
                  return (
                    <button
                      key={option.value}
                      onClick={() => setTheme(option.value)}
                      className={cn(
                        "mx-focus flex h-11 items-center justify-center gap-2 rounded-xl border text-sm font-medium transition",
                        active
                          ? "border-violet-300 bg-violet-50 text-violet-700 shadow-sm dark:border-violet-400/30 dark:bg-violet-500/15 dark:text-violet-100"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:bg-white/[0.08]",
                      )}
                    >
                      <option.icon className="size-4" />
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium">Language</label>
              <div className="flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300">
                <Languages className="size-4" />
                English / Gujarati friendly
              </div>
            </div>
            <div className="flex justify-end">
              <SoftButton variant="primary" disabled title="Settings are saved automatically in this release">Save Changes</SoftButton>
            </div>
          </div>
        </PanelCard>

        <div className="space-y-5">
          <PanelCard>
            <h2 className="text-sm font-semibold">Account Health</h2>
            <div className="mt-4 space-y-3">
              {[
                ["Google login", "Connected"],
                ["Extension token", "Managed"],
                ["Notifications", "Unavailable"],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-3 text-sm dark:bg-white/[0.04]">
                  <span className="text-slate-500 dark:text-slate-400">{label}</span>
                  <span className="font-medium">{value}</span>
                </div>
              ))}
            </div>
          </PanelCard>
          <PanelCard>
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200">
                <Bell className="size-4" />
              </span>
              <div>
                <h2 className="text-sm font-semibold">Notifications</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">Product alerts are not available in this release.</p>
              </div>
            </div>
          </PanelCard>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {settingsSections.map((item) => (
          <Link key={item.href} href={item.href} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-md dark:border-white/10 dark:bg-[#111113] dark:hover:border-violet-400/25">
            <span className="mb-4 grid size-10 place-items-center rounded-xl bg-slate-50 text-slate-600 dark:bg-white/[0.05] dark:text-slate-300">
              <item.icon className="size-4" />
            </span>
            <h2 className="text-sm font-semibold">{item.label}</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">{item.description}</p>
          </Link>
        ))}
      </div>
    </UserPanelShell>
  );
}
