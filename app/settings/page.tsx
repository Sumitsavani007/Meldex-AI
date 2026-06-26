"use client";

import Link from "next/link";
import { Bell, Brush, CreditCard, KeyRound, Languages, Monitor, Moon, Shield, Trash2, User, CircleHelp, Sun } from "lucide-react";
import { PageHeader, SectionShell } from "@/components/ui";
import { useThemePreference } from "@/components/theme-provider";

const userSettings = [
  { href: "/settings/profile", label: "Profile", description: "Name, email, and account details.", icon: User },
  { href: "/settings", label: "Appearance", description: "Theme, density, and visual comfort.", icon: Brush },
  { href: "/settings", label: "Notifications", description: "Product and account notifications.", icon: Bell },
  { href: "/settings", label: "Language", description: "Preferred language and regional format.", icon: Languages },
  { href: "/settings/security", label: "Security", description: "Password, sessions, and recovery.", icon: Shield },
  { href: "/settings/tokens", label: "Access Tokens", description: "Create tokens for VS Code, CLI, and benchmarks.", icon: KeyRound },
  { href: "/settings/security", label: "Sessions", description: "Review devices signed in to your account.", icon: Monitor },
  { href: "/settings/billing", label: "Billing", description: "Plan, invoices, and subscription status.", icon: CreditCard },
  { href: "/settings", label: "Delete Account", description: "Export or permanently remove your account.", icon: Trash2 },
  { href: "/settings", label: "Help", description: "Account help and product support.", icon: CircleHelp },
];

export default function SettingsPage() {
  const { theme, setTheme } = useThemePreference();

  return (
    <SectionShell className="space-y-8 py-8">
      <PageHeader
        title="Settings"
        description="Manage your personal Meldex account preferences."
      />

      <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-[#262626] dark:bg-[#171717]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-950 dark:text-white">Appearance</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-[#a1a1aa]">
              Choose how Meldex looks on this device.
            </p>
          </div>
          <div className="grid grid-cols-3 rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-[#262626] dark:bg-[#111111]">
            {[
              { value: "light" as const, label: "Light", icon: Sun },
              { value: "dark" as const, label: "Dark", icon: Moon },
              { value: "system" as const, label: "System", icon: Monitor },
            ].map((option) => {
              const Icon = option.icon;
              const active = theme === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setTheme(option.value)}
                  className={[
                    "mx-focus inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition",
                    active
                      ? "bg-white text-slate-950 shadow-sm dark:bg-[#202020] dark:text-white"
                      : "text-slate-500 hover:text-slate-950 dark:text-[#a1a1aa] dark:hover:text-white",
                  ].join(" ")}
                  aria-pressed={active}
                >
                  <Icon className="size-4" />
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {userSettings.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className="group rounded-lg border border-slate-200 bg-white p-5 transition hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
          >
            <div className="mb-4 grid size-9 place-items-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
              <item.icon className="size-4" />
            </div>
            <h2 className="text-sm font-semibold text-slate-950 dark:text-white">{item.label}</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">{item.description}</p>
          </Link>
        ))}
      </div>
    </SectionShell>
  );
}
