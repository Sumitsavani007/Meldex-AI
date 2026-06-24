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
        "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition",
        variant === "primary"
          ? "bg-mint text-slate-950 shadow-[0_0_20px_rgba(99,242,190,0.25)] hover:bg-mint/90 hover:shadow-[0_0_28px_rgba(99,242,190,0.35)]"
          : "border border-white/10 bg-white/5 text-slate-100 hover:bg-white/10 hover:border-white/20"
      )}
    >
      {children}
    </Link>
  );
}

export function SectionShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cn("mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 lg:px-8", className)}>{children}</section>;
}

export function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("glass-panel rounded-xl", className)}>{children}</div>;
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
    <Panel className="p-5 transition hover:border-mint/30 hover:bg-white/[0.055]">
      <div className="mb-5 flex items-center justify-between">
        <span className="grid size-10 place-items-center rounded-lg border border-mint/20 bg-mint/10 text-mint">
          <Icon className="size-5" />
        </span>
        <span className="text-xs text-slate-500">{action}</span>
      </div>
      <h3 className="text-base font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
    </Panel>
  );
}

export function StatusPill({ tone, children }: { tone: "success" | "error" | "idle" | "warning"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        tone === "success" && "border-mint/30 bg-mint/10 text-mint",
        tone === "error" && "border-red-400/30 bg-red-400/10 text-red-300",
        tone === "warning" && "border-amber-400/30 bg-amber-400/10 text-amber-300",
        tone === "idle" && "border-white/10 bg-white/5 text-slate-300"
      )}
    >
      <span className={cn(
        "size-1.5 rounded-full",
        tone === "success" && "bg-mint",
        tone === "error" && "bg-red-400",
        tone === "warning" && "bg-amber-400",
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
      variant === "default" && "border border-white/10 bg-white/5 text-slate-300",
      variant === "mint" && "border border-mint/20 bg-mint/10 text-mint",
      variant === "iris" && "border border-iris/20 bg-iris/10 text-iris",
      variant === "ember" && "border border-ember/20 bg-ember/10 text-ember",
      variant === "rose" && "border border-rose/20 bg-rose/10 text-rose",
      variant === "amber" && "border border-amber-400/20 bg-amber-400/10 text-amber-300",
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
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-white/8 bg-white/[0.02] py-16 text-center">
      {Icon && (
        <span className="grid size-14 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-500">
          <Icon className="size-7" />
        </span>
      )}
      <div>
        <p className="font-semibold text-slate-200">{title}</p>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("animate-spin text-mint", className ?? "size-5")} />;
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
        {label && <p className="text-xs font-semibold uppercase tracking-wider text-mint">{label}</p>}
        <h1 className={cn("font-bold text-white", label ? "mt-1 text-2xl sm:text-3xl" : "text-2xl sm:text-3xl")}>{title}</h1>
        {description && <p className="mt-1.5 text-sm text-slate-400">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

