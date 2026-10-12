"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { Gauge, Globe2, Layers, Medal, Minus, TrendingDown, TrendingUp, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale, useT } from "@/lib/i18n/LocaleProvider";
import { useScope } from "@/lib/scope/ScopeProvider";
import { PageHeading } from "@/components/layout/PageHeading";
import { Avatar, Badge, Board, Card, CardHeader, EmptyState, Meter, ScoreRing, Segmented, Td, Th } from "@/components/ui";
import {
  countryByCode,
  countryFlag,
  countryName,
  rankingsFor,
  zones,
  type RefereeLevel,
} from "@/lib/mock-data";

const PROMOTION_LINE = 8;
const levels: Array<RefereeLevel | "all"> = ["all", "CAF Elite", "FIFA Listed", "National D1", "Regional"];

export default function RankingsPage() {
  const t = useT();
  const { locale } = useLocale();
  const { codes } = useScope();
  const [level, setLevel] = useState<RefereeLevel | "all">("all");

  const rows = useMemo(() => {
    const all = rankingsFor(codes);
    return level === "all" ? all : all.filter((r) => r.level === level);
  }, [codes, level]);

  const rising = rows.filter((r) => r.delta > 1).length;

  const levelMix = useMemo(() => {
    const order: RefereeLevel[] = ["CAF Elite", "FIFA Listed", "National D1", "Regional"];
    const all = rankingsFor(codes);
    return order.map((lvl) => ({
      level: lvl,
      count: all.filter((r) => r.level === lvl).length,
      share: all.length ? (all.filter((r) => r.level === lvl).length / all.length) * 100 : 0,
    }));
  }, [codes]);

  const zoneLeaders = useMemo(() => {
    const all = rankingsFor(codes);
    return zones
      .map((zone) => ({
        zone,
        leader: all.find((r) => countryByCode.get(r.countryCode)?.zone === zone) ?? null,
        size: all.filter((r) => countryByCode.get(r.countryCode)?.zone === zone).length,
      }))
      .filter((z) => z.leader);
  }, [codes]);

  const movers = useMemo(
    () =>
      rankingsFor(codes)
        .slice()
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        .slice(0, 6),
    [codes],
  );

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeading titleKey="rankings.title" subtitleKey="subtitles.rankings" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Board
          primary
          tone="var"
          icon={Trophy}
          label={t("rankings.title")}
          value={rows.length}
          hint={t("rankings.tableSub")}
        />
        <Board
          tone="gold"
          icon={Gauge}
          label={t("overview.kpiArps")}
          value={rows.length ? (rows.reduce((s, r) => s + r.arps, 0) / rows.length).toFixed(1) : "—"}
        />
        <Board tone="pitch" icon={TrendingUp} label={t("rankings.movement")} value={`+${rising}`} />
        <Board
          tone="amber"
          icon={Medal}
          label={t("rankings.promotionLine")}
          value={Math.min(PROMOTION_LINE, rows.length)}
          hint={t("rankings.promotionLineNote")}
        />
      </div>

      <Segmented
        value={level}
        onChange={setLevel}
        options={levels.map((l) => ({ value: l, label: l === "all" ? t("common.all") : l }))}
      />

      {rows.length === 0 ? (
        <Card>
          <EmptyState title={t("common.noResults")} hint={t("common.noResultsHint")} />
        </Card>
      ) : (
        <>
          <ul className="space-y-2 lg:hidden">
            {rows.map((row) => (
              <li key={row.refereeId}>
                <Link
                  href={`/referees/${row.refereeId}`}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl border bg-ink-2 p-3 lift",
                    row.rank <= PROMOTION_LINE ? "border-line-strong" : "border-line",
                  )}
                >
                  <span className="board w-6 text-base text-chalk-faint">{row.rank}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-chalk">{row.name}</p>
                    <p className="truncate text-xs text-chalk-faint">
                      {countryFlag(row.countryCode)} {countryName(row.countryCode, locale)} · {row.zone}
                    </p>
                  </div>
                  <Movement delta={row.delta} />
                  <ScoreRing value={row.arps} size={38} />
                </Link>
              </li>
            ))}
          </ul>

          <Card padded={false} className="hidden lg:block">
            <div className="scroll-x">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-line">
                    <Th className="w-14">{t("common.rank")}</Th>
                    <Th>{t("common.referee")}</Th>
                    <Th>{t("common.country")}</Th>
                    <Th>{t("common.zone")}</Th>
                    <Th>{t("common.level")}</Th>
                    <Th className="text-right">ARPS</Th>
                    <Th className="text-right">{t("referees.matchesOfficiated")}</Th>
                    <Th className="text-right">{t("rankings.movement")}</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <Fragment key={row.refereeId}>
                      <tr className="border-b border-line last:border-0 row-hover">
                        <Td className="board text-chalk-faint">{row.rank}</Td>
                        <Td>
                          <Link href={`/referees/${row.refereeId}`} className="flex items-center gap-2.5">
                            <Avatar initials={row.name.split(" ").map((p) => p[0]).join("")} size={26} />
                            <span className="text-chalk hover:underline">{row.name}</span>
                          </Link>
                        </Td>
                        <Td>
                          {countryFlag(row.countryCode)} {countryName(row.countryCode, locale)}
                        </Td>
                        <Td>{row.zone}</Td>
                        <Td>
                          <Badge tone={row.level === "CAF Elite" ? "pitch" : "neutral"}>{row.level}</Badge>
                        </Td>
                        <Td className="board text-right text-chalk">{row.arps.toFixed(1)}</Td>
                        <Td className="tnum text-right">{row.matches}</Td>
                        <Td className="text-right">
                          <span className="inline-flex justify-end">
                            <Movement delta={row.delta} />
                          </span>
                        </Td>
                      </tr>
                      {row.rank === PROMOTION_LINE && rows.length > PROMOTION_LINE && (
                        <tr>
                          <td colSpan={8} className="px-3 py-1.5">
                            <div className="flex items-center gap-3">
                              <span className="chalk-rule flex-1" />
                              <span className="whitespace-nowrap text-[10.5px] uppercase tracking-[0.1em] text-chalk-faint">
                                {t("rankings.promotionLineNote")}
                              </span>
                              <span className="chalk-rule flex-1" />
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader icon={Layers} tint="var" title={t("rankings.levelMix")} subtitle={t("rankings.levelMixSub")} />
          <ul className="space-y-3">
            {levelMix.map((row) => (
              <li key={row.level}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-chalk-dim">{row.level}</span>
                  <span className="board text-chalk">{row.count}</span>
                </div>
                <Meter value={row.share} tone={row.level === "CAF Elite" ? "pitch" : "chalk"} />
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader icon={Globe2} tint="gold" title={t("rankings.zoneLeaders")} subtitle={t("rankings.zoneLeadersSub")} />
          <ul className="space-y-1.5">
            {zoneLeaders.map((z) => (
              <li key={z.zone}>
                <Link
                  href={`/referees/${z.leader!.refereeId}`}
                  className="flex items-center gap-3 rounded-xl border border-line bg-ink-1 px-3 py-2.5 lift"
                >
                  <span className="board w-16 shrink-0 text-[11px] text-chalk-faint">{z.zone}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-chalk">
                    {countryFlag(z.leader!.countryCode)} {z.leader!.name}
                  </span>
                  <span className="board shrink-0 text-xs text-pitch">{z.leader!.arps.toFixed(1)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader icon={TrendingUp} tint="pitch" title={t("rankings.biggestMovers")} subtitle={t("rankings.biggestMoversSub")} />
          <ul className="space-y-1.5">
            {movers.map((row) => (
              <li key={row.refereeId}>
                <Link
                  href={`/referees/${row.refereeId}`}
                  className="flex items-center gap-3 rounded-xl border border-line bg-ink-1 px-3 py-2.5 lift"
                >
                  <span className="min-w-0 flex-1 truncate text-xs text-chalk">
                    {countryFlag(row.countryCode)} {row.name}
                  </span>
                  <Movement delta={row.delta} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function Movement({ delta }: { delta: number }) {
  if (Math.abs(delta) < 0.2) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-chalk-faint">
        <Minus size={12} />
        0.0
      </span>
    );
  }
  return (
    <span
      className={cn("inline-flex items-center gap-1 tnum text-xs", delta > 0 ? "text-pitch" : "text-card-red")}
    >
      {delta > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {Math.abs(delta).toFixed(1)}
    </span>
  );
}
