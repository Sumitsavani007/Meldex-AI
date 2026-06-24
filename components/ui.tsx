import Link from "next/link";
import type { LucideIcon } from "lucide-react";
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
        "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition",
        variant === "primary"
          ? "bg-mint text-slate-950 hover:bg-mint/90"
          : "border border-white/10 bg-white/5 text-slate-100 hover:bg-white/10"
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
  return <div className={cn("glass-panel rounded-md", className)}>{children}</div>;
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
        <span className="grid size-10 place-items-center rounded-md border border-white/10 bg-white/5 text-mint">
          <Icon className="size-5" />
        </span>
        <span className="text-xs text-slate-500">{action}</span>
      </div>
      <h3 className="text-base font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
    </Panel>
  );
}

export function StatusPill({ tone, children }: { tone: "success" | "error" | "idle"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs",
        tone === "success" && "border-mint/30 bg-mint/10 text-mint",
        tone === "error" && "border-red-400/30 bg-red-400/10 text-red-200",
        tone === "idle" && "border-white/10 bg-white/5 text-slate-300"
      )}
    >
      {children}
    </span>
  );
}
