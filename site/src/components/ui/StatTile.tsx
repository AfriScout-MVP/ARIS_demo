import { cn } from "@/lib/utils";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

export function StatTile({
  label,
  value,
  delta,
  suffix,
  icon,
  className,
}: {
  label: string;
  value: string | number;
  delta?: number;
  suffix?: string;
  icon?: React.ReactNode;
  className?: string;
}) {
  const positive = (delta ?? 0) >= 0;
  return (
    <div className={cn("rounded-2xl border border-aris-border bg-aris-surface/80 p-5", className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-aris-muted">{label}</span>
        {icon && <span className="text-aris-muted-2">{icon}</span>}
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="font-display text-3xl font-semibold text-aris-text">{value}</span>
        {suffix && <span className="text-sm text-aris-muted">{suffix}</span>}
      </div>
      {delta !== undefined && (
        <div
          className={cn(
            "mt-2 inline-flex items-center gap-1 text-xs font-medium",
            positive ? "text-aris-emerald-light" : "text-aris-red",
          )}
        >
          {positive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          {Math.abs(delta).toFixed(1)} vs last season
        </div>
      )}
    </div>
  );
}
