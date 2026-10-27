"use client";

import { Badge } from "@/components/ui";
import { useT } from "@/lib/i18n/LocaleProvider";
import { freshnessAge, freshnessKey, freshnessTone, FRESH_WITHIN_DAYS } from "@/lib/freshness";
import type { SyncHealth } from "@/lib/store";

/** A country's data freshness: "Up to date" / "Stale" / "No data yet", with the rule in the tooltip. */
export function FreshnessBadge({ health }: { health: SyncHealth }) {
  const t = useT();
  return (
    <span title={t("federations.freshnessRule", { days: FRESH_WITHIN_DAYS })}>
      <Badge tone={freshnessTone[health]}>{t(freshnessKey[health])}</Badge>
    </span>
  );
}

/** "5 h" / "12 d" since the last change, or "no data yet". */
export function useFreshnessAge() {
  const t = useT();
  return (hours: number | null | undefined) => freshnessAge(hours, { h: t("common.hours"), d: t("common.daysShort") }) ?? t("common.noDataYet");
}
