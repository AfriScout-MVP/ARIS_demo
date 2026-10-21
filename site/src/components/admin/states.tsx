"use client";

import { AlertTriangle, RefreshCcw } from "@/components/icons/glyphs";
import { Button, Card } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/LocaleProvider";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-ink-3", className)} />;
}

/** Placeholder rows while a list loads. Announces itself once, politely. */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  const t = useT();
  return (
    <Card padded={false}>
      <div aria-busy className="divide-y divide-line">
        <span role="status" className="sr-only">
          {t("admin.common.loading")}
        </span>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3.5">
            <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3.5 w-1/3 max-w-48" />
              <Skeleton className="h-3 w-1/2 max-w-72" />
            </div>
            <Skeleton className="hidden h-6 w-20 sm:block" />
          </div>
        ))}
      </div>
    </Card>
  );
}

export function ErrorState({ onRetry, networkDown = false }: { onRetry: () => void; networkDown?: boolean }) {
  const t = useT();
  return (
    <Card>
      <div role="alert" className="flex flex-col items-center gap-3 px-2 py-6 text-center">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/10 text-card-red">
          <AlertTriangle size={20} />
        </span>
        <p className="text-sm font-medium text-chalk">{t(networkDown ? "admin.errors.network" : "admin.common.loadFailed")}</p>
        <Button onClick={onRetry}>
          <RefreshCcw size={14} />
          {t("admin.common.retry")}
        </Button>
      </div>
    </Card>
  );
}

/** Screen-reader-only count of the rows now showing, announced whenever the filters change it. */
export function ResultsLive({ count }: { count: number }) {
  const t = useT();
  return (
    <p aria-live="polite" className="sr-only">
      {t(count === 1 ? "admin.common.resultsOne" : "admin.common.resultsOther", { count })}
    </p>
  );
}
