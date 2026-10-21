"use client";

import { Plus } from "@/components/icons/glyphs";
import { Badge, Button, EmptyState } from "@/components/ui";
import { listUsers, type FederationRow } from "@/lib/api/admin";
import { formatDateTime } from "@/lib/admin/format";
import { useResource } from "@/lib/admin/hooks";
import { useLocale, useT } from "@/lib/i18n/LocaleProvider";
import { localeTags } from "@/locales";
import { ErrorState, Skeleton } from "./states";

/** The seats (federation accounts) of one federation, with a button to add one. */
export function SeatsPanel({
  federation,
  version,
  onAdd,
}: {
  federation: FederationRow;
  /** Bumped by the page after a seat is created, so this list refetches. */
  version: number;
  onAdd: () => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const seats = useResource(`seats|${federation.id}|${version}`, (signal) =>
    listUsers({ role: "federation", country: federation.country }, signal).then((all) => all.filter((u) => u.federationId === federation.id)),
  );

  return (
    <div className="space-y-3 border-t border-line bg-ink-1 px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-chalk">{t("admin.federations.seatsOf", { code: federation.code })}</h3>
        <Button size="sm" variant="primary" onClick={onAdd} disabled={federation.status !== "active"}>
          <Plus size={14} />
          {t("admin.federations.addSeat")}
        </Button>
      </div>
      {federation.status !== "active" && <p className="text-xs text-amber">{t("admin.federations.suspendedSeatsNote")}</p>}

      {seats.loading ? (
        <div className="space-y-2" aria-busy>
          <span role="status" className="sr-only">
            {t("admin.common.loading")}
          </span>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : seats.error ? (
        <ErrorState onRetry={seats.reload} />
      ) : (seats.data ?? []).length === 0 ? (
        <EmptyState title={t("admin.federations.noSeats")} hint={t("admin.federations.noSeatsHint")} />
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-ink-2">
          {(seats.data ?? []).map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5 text-sm">
              <div className="min-w-0 flex-1 basis-48">
                <p className="truncate font-medium text-chalk">{u.name}</p>
                <p className="truncate text-xs text-chalk-faint">{u.email}</p>
              </div>
              <Badge tone={u.active ? "pitch" : "neutral"}>{t(u.active ? "admin.accounts.active" : "admin.accounts.inactive")}</Badge>
              <span className="text-xs text-chalk-faint">
                {u.lastLoginAt ? formatDateTime(u.lastLoginAt, localeTags[locale]) : t("admin.accounts.never")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
