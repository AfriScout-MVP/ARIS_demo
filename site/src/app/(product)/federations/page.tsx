"use client";

import { useSyncNow } from "@/lib/dataset/useSyncNow";
import { RequireRole } from "@/components/auth/RequireRole";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CalendarDays, Globe2, RefreshCcw, Trophy, Users } from "@/components/icons/glyphs";
import { cn } from "@/lib/utils";
import { useLocale, useT } from "@/lib/i18n/LocaleProvider";
import { useScope } from "@/lib/scope/ScopeProvider";
import { PageHeading } from "@/components/layout/PageHeading";
import { Badge, Board, Button, Card, CardHeader, EmptyState, Segmented, Td, Th } from "@/components/ui";
import { axisProps, barCursor, chartColors, tooltipStyle } from "@/components/charts/theme";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { FreshnessBadge, useFreshnessAge } from "@/components/ui/FreshnessBadge";
import {
  competitions,
  countryByCode,
  countryName,
  federationRows,
  zoneDistribution,
  zoneKey,
  type Zone,
} from "@/lib/store";

// The continental comparison of federations is for the confederation: a federation seat would only ever see its own row.
export default function FederationsPage() {
  return (
    <RequireRole roles={["admin"]}>
      <FederationsView />
    </RequireRole>
  );
}

function FederationsView() {
  const t = useT();
  const { locale } = useLocale();
  const { setScope, codes, lockedTo } = useScope();
  const [zoneFilter, setZoneFilter] = useState<Zone | "all">("all");
  const { syncing, syncNow } = useSyncNow();
  const age = useFreshnessAge();

  const presentZones = useMemo(() => zoneDistribution(), []);

  const rows = useMemo(
    () =>
      federationRows()
        .filter((row) => zoneFilter === "all" || row.zone === zoneFilter)
        .sort((a, b) => b.avgArps - a.avgArps),
    [zoneFilter],
  );

  const totals = rows.reduce(
    (acc, row) => ({
      referees: acc.referees + row.refereeCount,
      fixtures: acc.fixtures + row.fixtures,
      open: acc.open + row.openSlots,
      stale: acc.stale + (row.syncHealth === "healthy" ? 0 : 1),
    }),
    { referees: 0, fixtures: 0, open: 0, stale: 0 },
  );

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeading titleKey="federations.title" subtitleKey="subtitles.federations" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Board
          primary
          tone="var"
          icon={Globe2}
          label={t("federations.title")}
          value={rows.length}
          hint={t("federations.tableSub")}
        />
        <Board tone="pitch" icon={Users} label={t("common.referees")} value={totals.referees} />
        <Board
          tone="gold"
          icon={CalendarDays}
          label={t("federations.fixturesSeason")}
          value={totals.fixtures}
        />
        <Board
          icon={RefreshCcw}
          label={t("federations.syncStale")}
          value={totals.stale}
          tone={totals.stale ? "amber" : "pitch"}
          hint={t("federations.calendarSync")}
        />
      </div>

      <div className="scroll-x -mx-3 px-3 sm:mx-0 sm:px-0">
        <Segmented
          value={zoneFilter}
          onChange={setZoneFilter}
          options={[
            { value: "all" as const, label: t("common.all") },
            ...presentZones.map((z) => ({ value: z.zone, label: z.zone })),
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState title={t("common.noResults")} />
        </Card>
      ) : (
        <>
          <ul className="space-y-2 lg:hidden">
            {rows.map((row) => {
                            return (
                <li key={row.code}>
                  <Card interactive>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-chalk">
                          <CountryFlag code={row.countryCode} /> {countryName(row.countryCode, locale)}
                        </p>
                        <p className="text-xs text-chalk-faint">
                          {row.code} · {row.zone}
                        </p>
                      </div>
                      <FreshnessBadge health={row.syncHealth} />
                    </div>
                    <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                      <Mini label={t("federations.corps")} value={row.refereeCount} />
                      <Mini label={t("federations.avgArps")} value={row.avgArps || "—"} />
                      <Mini label={t("calendar.fixtures")} value={row.fixtures} />
                      <Mini label={t("federations.openSlots")} value={row.openSlots} />
                    </div>
                    {!lockedTo && (
                    <Button
                      className="mt-3 w-full"
                      size="sm"
                      variant={codes.length === 1 && codes[0] === row.countryCode ? "primary" : "secondary"}
                      onClick={() => setScope({ kind: "country", code: row.countryCode })}
                    >
                      {t("federations.switchScope")}
                    </Button>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>

          <Card padded={false} className="hidden lg:block">
            <div className="scroll-x">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-line">
                    <Th>{t("common.federation")}</Th>
                    <Th>{t("common.zone")}</Th>
                    <Th className="text-right">{t("federations.corps")}</Th>
                    <Th className="text-right">{t("federations.eliteCount")}</Th>
                    <Th className="text-right">{t("federations.avgArps")}</Th>
                    <Th className="text-right">{t("federations.competitionsTracked")}</Th>
                    <Th className="text-right">{t("federations.fixturesSeason")}</Th>
                    <Th className="text-right">{t("federations.openSlots")}</Th>
                    <Th>{t("federations.calendarSync")}</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                                        return (
                      <tr key={row.code} className="border-b border-line last:border-0 row-hover">
                        <Td>
                          <span className="text-chalk">
                            <CountryFlag code={row.countryCode} /> {countryName(row.countryCode, locale)}
                          </span>
                          <span className="ml-1.5 text-chalk-faint">{row.code}</span>
                        </Td>
                        <Td>{row.zone}</Td>
                        <Td className="tnum text-right">{row.refereeCount}</Td>
                        <Td className="tnum text-right">{row.eliteCount}</Td>
                        <Td className="board text-right text-chalk">{row.avgArps || "—"}</Td>
                        <Td className="tnum text-right">{row.competitions}</Td>
                        <Td className="tnum text-right">{row.fixtures}</Td>
                        <Td className={cn("tnum text-right", row.openSlots > 0 && "text-amber")}>{row.openSlots}</Td>
                        <Td>
                          <span className="flex items-center gap-2">
                            <FreshnessBadge health={row.syncHealth} />
                            <span className="text-[11px] text-chalk-faint">{age(row.lastSyncHours)}</span>
                          </span>
                        </Td>
                        <Td className="text-right">
                          {!lockedTo && (
                            <Button size="sm" variant="ghost" onClick={() => setScope({ kind: "country", code: row.countryCode })}>
                              {t("federations.switchScope")}
                            </Button>
                          )}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader icon={Globe2} tint="var" title={t("federations.zoneSummary")} subtitle={t("federations.zoneSummarySub")} />
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={presentZones} margin={{ top: 4, right: 6, bottom: 0, left: -24 }}>
                <CartesianGrid stroke={chartColors.grid} vertical={false} />
                <XAxis dataKey="zone" {...axisProps} interval={0} angle={-12} textAnchor="end" height={44} />
                <YAxis {...axisProps} />
                <Tooltip contentStyle={tooltipStyle} cursor={barCursor} />
                <Bar dataKey="referees" name={t("common.referees")} fill={chartColors.chalkDim} radius={[3, 3, 0, 0]} />
                <Bar dataKey="countries" name={t("common.countries")} fill={chartColors.pitch} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader
            icon={Trophy}
            tint="gold"
            title={t("common.competitions")}
            subtitle={t("federations.competitionsTracked")}
            action={
              <Button size="sm" variant="secondary" disabled={syncing} onClick={() => void syncNow()}>
                <RefreshCcw size={12} className={syncing ? "animate-spin" : undefined} />
                {t("common.syncNow")}
              </Button>
            }
          />
          <ul className="max-h-[320px] space-y-1.5 overflow-y-auto">
            {competitions
              .filter((c) => zoneFilter === "all" || countryByCode.get(c.countryCode)?.zone === zoneFilter || c.countryCode === "CAF")
              .map((comp) => (
                <li
                  key={comp.id}
                  className="flex items-center justify-between gap-2 rounded-[10px] border border-line bg-ink-1 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs text-chalk">{comp.name}</p>
                    <p className="text-[11px] text-chalk-faint">
                      {comp.countryCode === "CAF" ? "CAF" : countryName(comp.countryCode, locale)} ·{" "}
                      {t("common.matchday")} {comp.currentMatchday}/{comp.matchdays}
                    </p>
                  </div>
                  {comp.varEnabled && <Badge tone="var">VAR</Badge>}
                </li>
              ))}
          </ul>
        </Card>
      </div>

      <p className="text-xs text-chalk-faint">
        {t("federations.zonesList", { list: presentZones.map((z) => `${z.zone} (${t(zoneKey[z.zone])})`).join(" · ") })}
      </p>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-line bg-ink-1 px-1.5 py-1.5">
      <p className="truncate text-xs font-medium text-chalk-faint">{label}</p>
      <p className="board text-sm text-chalk">{value}</p>
    </div>
  );
}
