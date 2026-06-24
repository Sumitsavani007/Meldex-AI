import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

type Tone = "success" | "error" | "warning" | "idle" | "info";

const TONE_CLASSES: Record<Tone, string> = {
  success: "bg-mint/15 text-mint border-mint/25",
  error: "bg-rose/15 text-rose border-rose/25",
  warning: "bg-ember/15 text-ember border-ember/25",
  idle: "bg-white/8 text-slate-400 border-white/10",
  info: "bg-iris/15 text-iris border-iris/25",
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
    success: "bg-mint shadow-[0_0_6px_rgba(99,242,190,0.8)]",
    error: "bg-rose shadow-[0_0_6px_rgba(255,107,139,0.8)]",
    warning: "bg-ember shadow-[0_0_6px_rgba(255,184,107,0.8)]",
    idle: "bg-slate-500",
    info: "bg-iris shadow-[0_0_6px_rgba(154,164,255,0.8)]",
  };
  return <span className={cn("inline-block size-2 rounded-full", dotColors[tone])} />;
}
