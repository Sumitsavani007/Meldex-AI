import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { TrendingUp, TrendingDown } from "lucide-react";

export function DashboardCard({
  label,
  value,
  sub,
  icon: Icon,
  trend,
  trendLabel,
  accent = "mint",
  className,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon?: LucideIcon;
  trend?: "up" | "down" | "neutral";
  trendLabel?: string;
  accent?: "mint" | "iris" | "ember" | "rose";
  className?: string;
}) {
  const accentMap = {
    mint: "border-blue-600/20 bg-blue-600/10 text-blue-700 dark:text-blue-300",
    iris: "border-indigo-600/20 bg-indigo-600/10 text-indigo-700 dark:text-indigo-300",
    ember: "border-slate-400/20 bg-slate-400/10 text-slate-600 dark:text-slate-300",
    rose: "border-red-600/20 bg-red-600/10 text-red-700 dark:text-red-300",
  };

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-lg border border-slate-200 bg-white p-5 transition hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-white/20 dark:hover:bg-white/[0.055]",
        className
      )}
    >
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-1.5 text-3xl font-semibold tabular-nums text-slate-950 dark:text-white">{value}</p>
          {sub && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{sub}</p>}
          {trendLabel && (
            <div
              className={cn(
                "mt-2 inline-flex items-center gap-1 text-xs font-medium",
                trend === "up" && "text-blue-600 dark:text-blue-400",
                trend === "down" && "text-red-600 dark:text-red-300",
                trend === "neutral" && "text-slate-400"
              )}
            >
              {trend === "up" && <TrendingUp className="size-3" />}
              {trend === "down" && <TrendingDown className="size-3" />}
              {trendLabel}
            </div>
          )}
        </div>
        {Icon && (
          <span
            className={cn(
              "grid size-10 shrink-0 place-items-center rounded-lg border",
              accentMap[accent]
            )}
          >
            <Icon className="size-5" />
          </span>
        )}
      </div>
    </div>
  );
}
