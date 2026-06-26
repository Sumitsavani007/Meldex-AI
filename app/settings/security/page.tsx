"use client";

import { KeyRound, Lock, Shield, Smartphone } from "lucide-react";
import { PanelCard, SoftButton, UserPanelShell } from "@/components/user-panel-shell";

const securityCards = [
  { icon: Lock, title: "Change Password", description: "Password changes are managed by your login provider.", cta: "Unavailable", titleAttr: "Password change is not available for this login method yet" },
  { icon: Smartphone, title: "Two-Factor Authentication", description: "Add an extra layer of security to your account.", cta: "2FA unavailable", titleAttr: "Two-factor authentication is not enabled in this release" },
  { icon: Shield, title: "Active Sessions", description: "Review devices and browser sessions connected to your account.", cta: "Sessions unavailable", titleAttr: "Session management UI is not available yet" },
  { icon: KeyRound, title: "Recovery Options", description: "Recovery is handled through your authentication provider.", cta: "Managed by provider", titleAttr: "Recovery options are managed through your auth provider" },
];

export default function SecuritySettingsPage() {
  return (
    <UserPanelShell title="Security" description="Protect your account, token access, and connected sessions." eyebrow="Security">
      <div className="grid gap-5 md:grid-cols-2">
        {securityCards.map((item) => (
          <PanelCard key={item.title}>
            <div className="flex items-start gap-4">
              <span className="grid size-11 place-items-center rounded-xl bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200">
                <item.icon className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold">{item.title}</h2>
                <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">{item.description}</p>
                <SoftButton disabled title={item.titleAttr} className="mt-4">{item.cta}</SoftButton>
              </div>
            </div>
          </PanelCard>
        ))}
      </div>
    </UserPanelShell>
  );
}
