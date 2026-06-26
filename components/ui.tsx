import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function ButtonLink({
  href,
  children,
  variant = "primary"
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
}) {
  return (
    <Link
      href={href}
      className={cn(
        "mx-focus inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition active:scale-[0.99]",
        variant === "primary"
          ? "bg-slate-950 text-white shadow-sm hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
          : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200 dark:hover:bg-white/[0.08]"
      )}
    >
      {children}
    </Link>
  );
}

export function SectionShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cn("mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8", className)}>{children}</section>;
}

export function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("glass-panel rounded-lg", className)}>{children}</div>;
}

export function ActionCard({
  icon: Icon,
  title,
  description,
  action
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action: string;
}) {
  return (
    <Panel className="p-5 transition hover:border-slate-300 hover:bg-slate-50 dark:hover:border-white/20 dark:hover:bg-white/[0.05]">
      <div className="mb-5 flex items-center justify-between">
        <span className="grid size-10 place-items-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
          <Icon className="size-5" />
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-400">{action}</span>
      </div>
      <h3 className="text-base font-semibold text-slate-950 dark:text-white">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>
    </Panel>
  );
}

export function StatusPill({ tone, children }: { tone: "success" | "error" | "idle" | "warning"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        tone === "success" && "border-emerald-600/20 bg-emerald-600/10 text-emerald-700 dark:text-emerald-300",
        tone === "error" && "border-red-600/20 bg-red-600/10 text-red-700 dark:text-red-300",
        tone === "warning" && "border-amber-600/20 bg-amber-600/10 text-amber-700 dark:text-amber-300",
        tone === "idle" && "border-slate-200 bg-slate-100 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
      )}
    >
      <span className={cn(
        "size-1.5 rounded-full",
        tone === "success" && "bg-emerald-600",
        tone === "error" && "bg-red-600",
        tone === "warning" && "bg-amber-600",
        tone === "idle" && "bg-slate-500"
      )} />
      {children}
    </span>
  );
}

export function Badge({
  children,
  variant = "default",
  className,
}: {
  children: React.ReactNode;
  variant?: "default" | "mint" | "iris" | "ember" | "rose" | "amber";
  className?: string;
}) {
  return (
    <span className={cn(
      "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
      variant === "default" && "border border-slate-200 bg-slate-100 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300",
      variant === "mint" && "border border-blue-600/20 bg-blue-600/10 text-blue-700 dark:text-blue-300",
      variant === "iris" && "border border-indigo-600/20 bg-indigo-600/10 text-indigo-700 dark:text-indigo-300",
      variant === "ember" && "border border-slate-400/20 bg-slate-400/10 text-slate-600 dark:text-slate-300",
      variant === "rose" && "border border-red-600/20 bg-red-600/10 text-red-700 dark:text-red-300",
      variant === "amber" && "border border-amber-600/20 bg-amber-600/10 text-amber-700 dark:text-amber-300",
      className
    )}>
      {children}
    </span>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-slate-200 bg-slate-50 py-16 text-center dark:border-white/10 dark:bg-white/[0.03]">
      {Icon && (
        <span className="grid size-14 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 dark:border-white/10 dark:bg-white/5">
          <Icon className="size-7" />
        </span>
      )}
      <div>
        <p className="font-semibold text-slate-950 dark:text-slate-200">{title}</p>
        {description && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("animate-spin text-blue-600 dark:text-blue-400", className ?? "size-5")} />;
}

export function PageHeader({
  label,
  title,
  description,
  action,
}: {
  label?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        {label && <p className="text-xs font-semibold uppercase text-blue-600 dark:text-blue-400">{label}</p>}
        <h1 className={cn("font-semibold tracking-tight text-slate-950 dark:text-white", label ? "mt-1 text-2xl sm:text-3xl" : "text-2xl sm:text-3xl")}>{title}</h1>
        {description && <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
