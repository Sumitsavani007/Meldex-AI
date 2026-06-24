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
    mint: "text-mint bg-mint/10 border-mint/20",
    iris: "text-iris bg-iris/10 border-iris/20",
    ember: "text-ember bg-ember/10 border-ember/20",
    rose: "text-rose bg-rose/10 border-rose/20",
  };

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border border-white/8 bg-white/[0.03] p-5 transition hover:border-white/15 hover:bg-white/[0.055]",
        className
      )}
    >
      {/* background gradient blob */}
      <div
        className={cn(
          "pointer-events-none absolute -right-6 -top-6 size-28 rounded-full opacity-10 blur-2xl transition group-hover:opacity-20",
          accent === "mint" && "bg-mint",
          accent === "iris" && "bg-iris",
          accent === "ember" && "bg-ember",
          accent === "rose" && "bg-rose"
        )}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-slate-400">{label}</p>
          <p className="mt-1.5 text-3xl font-bold tabular-nums text-white">{value}</p>
          {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
          {trendLabel && (
            <div
              className={cn(
                "mt-2 inline-flex items-center gap-1 text-xs font-medium",
                trend === "up" && "text-mint",
                trend === "down" && "text-rose",
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
