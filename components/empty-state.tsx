import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-14 text-center",
        className
      )}
    >
      {Icon && (
        <div className="grid size-14 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-400">
          <Icon className="size-7" />
        </div>
      )}
      <div>
        <p className="font-semibold text-slate-300">{title}</p>
        {description && (
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
