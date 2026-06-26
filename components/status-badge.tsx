import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

type Tone = "success" | "error" | "warning" | "idle" | "info";

const TONE_CLASSES: Record<Tone, string> = {
  success: "border-emerald-600/20 bg-emerald-600/10 text-emerald-700 dark:text-emerald-300",
  error: "border-red-600/20 bg-red-600/10 text-red-700 dark:text-red-300",
  warning: "border-amber-600/20 bg-amber-600/10 text-amber-700 dark:text-amber-300",
  idle: "border-slate-200 bg-slate-100 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300",
  info: "border-blue-600/20 bg-blue-600/10 text-blue-700 dark:text-blue-300",
};

export function StatusBadge({
  tone = "idle",
  icon: Icon,
  label,
  className,
}: {
  tone?: Tone;
  icon?: LucideIcon;
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        TONE_CLASSES[tone],
        className
      )}
    >
      {Icon && <Icon className="size-3" />}
      {label}
    </span>
  );
}

export function StatusDot({ tone = "idle" }: { tone?: Tone }) {
  const dotColors: Record<Tone, string> = {
    success: "bg-emerald-600",
    error: "bg-red-600",
    warning: "bg-amber-600",
    idle: "bg-slate-500",
    info: "bg-blue-600",
  };
  return <span className={cn("inline-block size-2 rounded-full", dotColors[tone])} />;
}
