"use client";

import { Github, Plug, Settings, Slack } from "lucide-react";
import { PanelCard, SoftButton, UserPanelShell } from "@/components/user-panel-shell";

const integrations = [
  { name: "GitHub", status: "Available", icon: Github },
  { name: "Slack", status: "Planned", icon: Slack },
  { name: "OpenRouter", status: "Connected", icon: Plug },
  { name: "Custom Webhook", status: "Planned", icon: Settings },
];

export default function IntegrationsPage() {
  return (
    <UserPanelShell title="Integrations" description="Connect external systems and keep workspace automation under control." eyebrow="Integrations">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {integrations.map((integration) => (
          <PanelCard key={integration.name}>
            <div className="flex items-center justify-between">
              <span className="grid size-11 place-items-center rounded-xl bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200"><integration.icon className="size-5" /></span>
              <span className="rounded-full bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-white/[0.05] dark:text-slate-300">{integration.status}</span>
            </div>
            <h2 className="mt-5 text-base font-semibold">{integration.name}</h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Secure integration controls for Meldex workspace workflows.</p>
            <SoftButton disabled title={integration.status === "Connected" ? "Managed by system configuration" : "Connection flow is not available in this release"} className="mt-5 w-full">{integration.status === "Connected" ? "Connected" : "Connect"}</SoftButton>
          </PanelCard>
        ))}
      </div>
    </UserPanelShell>
  );
}
