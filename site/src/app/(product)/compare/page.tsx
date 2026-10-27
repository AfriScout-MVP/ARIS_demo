"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpRight, ArrowLeftRight } from "@/components/icons/glyphs";
import { cn } from "@/lib/utils";
import { useLocale, useT } from "@/lib/i18n/LocaleProvider";
import { useScope } from "@/lib/scope/ScopeProvider";
import { PageHeading } from "@/components/layout/PageHeading";
import { Badge, Card, ChalkRule, EmptyState, ScoreRing, Select } from "@/components/ui";
import { CompareRadar } from "@/components/charts/CompareRadar";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { pickLocalized } from "@/lib/i18n/localized";
import { countryName, RADAR_MIN_AXES, RADAR_MIN_REPORTS, radarFor, referees, refereeHref, sharedAxes, type Referee } from "@/lib/store";

/** A is green, B is sky — the same two colours the radar uses. */
const SIDE = {
  a: { text: "text-pitch", bar: "bg-pitch", ring: "bg-pitch/10" },
  b: { text: "text-var", bar: "bg-var", ring: "bg-var/10" },
} as const;

/** One official's half of the versus header; B mirrors so the two face in. */
function Side({
  referee,
  side,
  matchesLabel,
}: {
  referee: Referee;
  side: "a" | "b";
  matchesLabel: string;
}) {
  const { locale } = useLocale();
  return (
    <div className={cn("flex items-center gap-3", side === "b" && "sm:flex-row-reverse sm:text-right")}>
      <div className={cn("shrink-0 rounded-[14px] p-1", SIDE[side].ring)}>
        <ScoreRing value={referee.arps} size={56} />
      </div>
      <div className="min-w-0 flex-1">
        <Link
          href={refereeHref(referee.id)}
          className={cn(
            "flex items-center gap-1 font-display text-base font-semibold text-chalk hover:underline",
            side === "b" && "sm:justify-end",
          )}
        >
          <span className="truncate">{referee.name}</span>
          <ArrowUpRight size={12} className="shrink-0" />
        </Link>
        <p className="truncate text-xs text-chalk-faint">
          <CountryFlag code={referee.countryCode} /> {countryName(referee.countryCode, locale)} · {referee.level}
        </p>
        <div className={cn("mt-1.5 flex flex-wrap gap-1.5", side === "b" && "sm:justify-end")}>
          <Badge tone={side === "a" ? "pitch" : "var"}>
            {referee.matches} {matchesLabel}
          </Badge>
          <Badge tone={referee.trend >= 0 ? "pitch" : "red"}>
            {referee.trend >= 0 ? "+" : "−"}
            {Math.abs(referee.trend).toFixed(1)}
          </Badge>
        </div>
      </div>
    </div>
  );
}

export default function ComparePage() {
  const t = useT();
  const { locale } = useLocale();
  const { codes } = useScope();

  const pool = useMemo(
    () => referees.filter((r) => codes.includes(r.countryCode)).sort((a, b) => b.arps - a.arps),
    [codes],
  );

  const [aId, setAId] = useState(pool[0]?.id ?? "");
  const [bId, setBId] = useState(pool[1]?.id ?? "");

  const a = pool.find((r) => r.id === aId) ?? pool[0];
  const b = pool.find((r) => r.id === bId) ?? pool[1];

  if (!a || !b) {
    return (
      <div className="space-y-4">
        <PageHeading titleKey="compare.title" subtitleKey="subtitles.compare" />
        <Card>
          <EmptyState title={t("compare.pickTwo")} hint={t("common.noResultsHint")} />
        </Card>
      </div>
    );
  }

  // the grid criteria both officials have been marked on, from their filed reports — never an estimate
  const axes = sharedAxes(radarFor(a.id), radarFor(b.id));
  const radar = axes.map((x) => ({
    metric: pickLocalized(x.label, locale),
    [a.name]: x.a,
    [b.name]: x.b,
  }));

  const headToHead = [
    { label: "ARPS", a: a.arps, b: b.arps, max: 100 },
    { label: t("arae.rmcs"), a: a.rmcsAvg, b: b.rmcsAvg, max: 100 },
    { label: t("referees.varAccuracy"), a: a.varAccuracy, b: b.varAccuracy, max: 100 },
    { label: t("arae.fitness"), a: a.fitness, b: b.fitness, max: 100 },
    {
      label: t("referees.matchesOfficiated"),
      a: a.matches,
      b: b.matches,
      max: Math.max(a.matches, b.matches),
    },
    {
      label: t("referees.cardsPerMatch"),
      a: Number(((a.cards.yellow + a.cards.red) / Math.max(1, a.matches)).toFixed(2)),
      b: Number(((b.cards.yellow + b.cards.red) / Math.max(1, b.matches)).toFixed(2)),
      max: 5,
      lowerIsBetter: true,
    },
  ];

  const gaps = axes
    .map((x) => ({ label: pickLocalized(x.label, locale), diff: x.a - x.b }))
    .sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff));

  const options = pool.map((r) => ({ value: r.id, label: `${r.name} — ${r.arps.toFixed(1)}` }));
  const aWins = headToHead.filter((row) => (row.lowerIsBetter ? row.a < row.b : row.a > row.b)).length;

  function swap() {
    setAId(b!.id);
    setBId(a!.id);
  }

  const matchesLabel = t("common.matches").toLowerCase();

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeading titleKey="compare.title" subtitleKey="subtitles.compare" />

      {/* One panel: pick, profiles, metrics and verdict all sit side by side. */}
      <Card padded={false} className="overflow-hidden">
        <div className="grid grid-cols-1 gap-3 border-b border-line bg-ink-1/60 p-4 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-end sm:gap-4">
          <Select label={t("compare.refereeA")} value={a.id} onChange={setAId} options={options} />
          <button
            onClick={swap}
            title={t("compare.pickTwo")}
            className="mx-auto inline-flex h-9 w-9 items-center justify-center rounded-full border border-line bg-ink-2 text-chalk-faint transition-colors hover:border-line-strong hover:text-chalk"
          >
            <ArrowLeftRight size={14} />
          </button>
          <Select label={t("compare.refereeB")} value={b.id} onChange={setBId} options={options} />
        </div>

        <div className="grid grid-cols-1 items-center gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:p-5">
          <Side referee={a} side="a" matchesLabel={matchesLabel} />
          <div className="flex items-center justify-center gap-3 sm:flex-col sm:gap-1">
            <span className="board text-[20px] font-semibold text-pitch">{aWins}</span>
            <span className="text-xs font-medium text-chalk-faint">
              {t("compare.wins")}
            </span>
            <span className="board text-[20px] font-semibold text-var">{headToHead.length - aWins}</span>
          </div>
          <Side referee={b} side="b" matchesLabel={matchesLabel} />
        </div>

        <ChalkRule />

        <div className="grid grid-cols-1 gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
          {/* Diverging bars: A grows left from the centre, B grows right. */}
          <div>
            <p className="mb-3 text-xs font-medium text-chalk-faint">
              {t("compare.headToHead")}
            </p>
            <div className="space-y-3">
              {headToHead.map((row) => {
                const leadsA = row.lowerIsBetter ? row.a < row.b : row.a > row.b;
                return (
                  <div key={row.label}>
                    <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                      <span className={cn("board w-14", leadsA ? "font-semibold text-pitch" : "text-chalk-faint")}>
                        {row.a}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-center text-chalk-dim">{row.label}</span>
                      <span
                        className={cn(
                          "board w-14 text-right",
                          !leadsA ? "font-semibold text-var" : "text-chalk-faint",
                        )}
                      >
                        {row.b}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="flex h-1.5 flex-1 justify-end overflow-hidden rounded-l-full bg-wash/[0.06]">
                        <div
                          className={cn("h-full rounded-l-full transition-[width] duration-500", SIDE.a.bar)}
                          style={{ width: `${Math.min(100, (row.a / row.max) * 100)}%` }}
                        />
                      </div>
                      <span className="h-2.5 w-px shrink-0 bg-line-strong" />
                      <div className="h-1.5 flex-1 overflow-hidden rounded-r-full bg-wash/[0.06]">
                        <div
                          className={cn("h-full rounded-r-full transition-[width] duration-500", SIDE.b.bar)}
                          style={{ width: `${Math.min(100, (row.b / row.max) * 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="mb-2 mt-5 text-xs font-medium text-chalk-faint">
              {t("compare.verdict")} · {t("compare.verdictSub").toLowerCase()}
            </p>
            {gaps.length === 0 && <p className="text-xs text-chalk-faint">{t("compare.notEnough", { min: RADAR_MIN_REPORTS })}</p>}
            <ul className="space-y-1.5">
              {gaps.map((gap) => {
                const leader = gap.diff >= 0 ? a : b;
                const tone = gap.diff >= 0 ? SIDE.a : SIDE.b;
                return (
                  <li
                    key={gap.label}
                    className="flex items-center justify-between gap-3 rounded-[10px] border border-line bg-ink-1 px-3 py-2"
                  >
                    <span className="min-w-0 truncate text-xs text-chalk-dim">{gap.label}</span>
                    <span className="shrink-0 text-xs">
                      <span className={tone.text}>{leader.name}</span>
                      <span className="text-chalk-faint">
                        {" "}
                        {t("compare.aheadOn")} {t("compare.by")} {Math.abs(gap.diff).toFixed(1)}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="lg:border-l lg:border-line lg:pl-5">
            <p className="mb-1 text-xs font-medium text-chalk-faint">
              {t("compare.profile")}
            </p>
            <p className="mb-2 text-xs text-chalk-faint">{t("compare.profileSub")}</p>
            {radar.length >= RADAR_MIN_AXES ? (
              <CompareRadar data={radar} seriesNames={[a.name, b.name]} />
            ) : (
              <EmptyState title={t("compare.notEnough", { min: RADAR_MIN_REPORTS })} />
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
