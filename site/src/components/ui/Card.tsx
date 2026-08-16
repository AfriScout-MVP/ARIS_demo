import { cn } from "@/lib/utils";

export function Card({
  children,
  className,
  hover = false,
}: {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-aris-border bg-aris-surface/80 p-5",
        hover && "card-hover",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  icon,
  action,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 mb-4">
      <div className="flex items-start gap-3">
        {icon && (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-aris-emerald/10 text-aris-emerald-light">
            {icon}
          </div>
        )}
        <div>
          <h3 className="font-display font-semibold text-aris-text text-[15px]">{title}</h3>
          {subtitle && <p className="text-xs text-aris-muted mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}
