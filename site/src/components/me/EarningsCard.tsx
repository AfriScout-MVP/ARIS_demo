"use client";

import { useState } from "react";
import { TrendingUp } from "@/components/icons/glyphs";
import { Card, CardHeader, Segmented } from "@/components/ui";
import { getEarnings } from "@/lib/api/me";
import { useResource } from "@/lib/admin/hooks";
import { useFormatters, useT } from "@/lib/i18n/LocaleProvider";
import { CardError, CardSkeleton, Nothing } from "./CardStates";

/** A referee's own earnings, totalled by season or by year. */
export function EarningsCard() {
  const t = useT();
  const fmt = useFormatters();
  const [by, setBy] = useState<"season" | "year">("season");
  const periods = useResource(`me:earnings|${by}`, (signal) => getEarnings(by, signal));

  const frame = { title: t("selfService.earnings.title"), icon: TrendingUp, tint: "gold" as const };
  if (periods.loading) return <CardSkeleton {...frame} rows={2} />;
  if (periods.error || !periods.data) return <CardError {...frame} error={periods.error} onRetry={periods.reload} />;

  return (
    <Card>
      <CardHeader {...frame} />
      <Segmented
        className="mb-3"
        value={by}
        onChange={setBy}
        options={[
          { value: "season", label: t("selfService.earnings.bySeason") },
          { value: "year", label: t("selfService.earnings.byYear") },
        ]}
      />
      {periods.data.length === 0 ? (
        <Nothing>{t("selfService.earnings.none")}</Nothing>
      ) : (
        <ul className="divide-y divide-line">
          {periods.data.map((p) => (
            <li key={p.period} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-chalk">{p.period}</p>
                <p className="text-xs text-chalk-dim">{t("selfService.earnings.lines", { n: p.lines })}</p>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span className="text-chalk">
                  {t("selfService.earnings.paid")}: {fmt.number(p.paid)} {p.currency}
                </span>
                {p.pending > 0 && (
                  <span className="text-amber">
                    {t("selfService.earnings.pending")}: {fmt.number(p.pending)} {p.currency}
                  </span>
                )}
                {p.contested > 0 && (
                  <span className="text-card-red">
                    {t("selfService.earnings.contested")}: {fmt.number(p.contested)} {p.currency}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
