"use client";

import { AppShell, appShellNav } from "@/components/app-shell";
import { cn } from "@/lib/utils";

export const userPanelNav = appShellNav;
export const userPanelTools = appShellNav.filter((item) => ["/billing", "/settings"].includes(item.href));

export function UserPanelShell({
  title,
  description,
  eyebrow,
  children,
  rightRail,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  children: React.ReactNode;
  rightRail?: React.ReactNode;
}) {
  return (
    <AppShell title={title} description={description} breadcrumb={eyebrow} rightRail={rightRail}>
      {children}
    </AppShell>
  );
}

export function PanelCard({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition dark:border-white/10 dark:bg-[#111113]", className)}>
      {children}
    </div>
  );
}

export function SoftButton({
  children,
  variant = "secondary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  return (
    <button
      {...props}
      className={cn(
        "mx-focus inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45",
        variant === "primary" && "bg-violet-600 text-white shadow-sm shadow-violet-600/20 hover:bg-violet-700",
        variant === "secondary" && "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200 dark:hover:bg-white/[0.08]",
        variant === "ghost" && "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.08]",
        variant === "danger" && "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-400/20 dark:bg-red-500/10 dark:text-red-200",
        className,
      )}
    >
      {children}
    </button>
  );
}
