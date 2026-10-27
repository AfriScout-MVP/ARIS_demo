"use client";

import { AlertTriangle, RefreshCcw, type IconType } from "@/components/icons/glyphs";
import { Button, Card, CardHeader, type Tint } from "@/components/ui";
import { Skeleton } from "@/components/admin/states";
import { NetworkError } from "@/lib/api/client";
import { useT } from "@/lib/i18n/LocaleProvider";

interface Frame {
  title: string;
  subtitle?: string;
  icon?: IconType;
  tint?: Tint;
}

/** A card's own frame while its data loads: the real header, and placeholder rows where the list will be. */
export function CardSkeleton({ title, subtitle, icon, tint, rows = 3 }: Frame & { rows?: number }) {
  const t = useT();
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} icon={icon} tint={tint} />
      <div aria-busy className="space-y-3">
        <span role="status" className="sr-only">
          {t("admin.common.loading")}
        </span>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3.5 w-2/5 max-w-56" />
              <Skeleton className="h-3 w-3/5 max-w-80" />
            </div>
            <Skeleton className="h-6 w-20 shrink-0" />
          </div>
        ))}
      </div>
    </Card>
  );
}

/** The same card when loading failed: what went wrong, and a way to try again. */
export function CardError({ title, subtitle, icon, tint, error, onRetry }: Frame & { error: unknown; onRetry: () => void }) {
  const t = useT();
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} icon={icon} tint={tint} />
      <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-red-500/30 bg-red-500/5 px-3 py-3">
        <p className="flex items-center gap-2 text-sm text-chalk">
          <AlertTriangle size={16} className="shrink-0 text-card-red" />
          {t(error instanceof NetworkError ? "admin.errors.network" : "admin.common.loadFailed")}
        </p>
        <Button size="sm" onClick={onRetry}>
          <RefreshCcw size={14} />
          {t("admin.common.retry")}
        </Button>
      </div>
    </Card>
  );
}

/** The plain line a card shows when there is honestly nothing to list. */
export function Nothing({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-chalk-dim">{children}</p>;
}

/** What `useResource` hands back, as the cards that share one load receive it. */
export interface Loaded<T> {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  reload: () => void;
}
