"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale, useT } from "@/lib/i18n/LocaleProvider";
import { useScope } from "@/lib/scope/ScopeProvider";
import { PageHeading } from "@/components/layout/PageHeading";
import { Avatar, Badge, Card, CardHeader, EmptyState, Meter, ScoreRing, Select } from "@/components/ui";
import { CompareRadar } from "@/components/charts/CompareRadar";
import { countryFlag, countryName, getSubIndices, referees } from "@/lib/mock-data";

export default function ComparePage() {
  const t = useT();
  const { locale } = useLocale();
  const { codes } = useScope();

  const pool = useMemo(
    () => referees.filter((r) => codes.includes(r.countryCode)).sort((a, b) => b.arps - a.arps),
    [codes],
  );

  const [aId, setAId] = useState(pool[0]?.id ?? referees[0].id);
  const [bId, setBId] = useState(pool[1]?.id ?? referees[1].id);

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

  const subA = getSubIndices(a);
  const subB = getSubIndices(b);

  const metrics = [
    { key: "ras", label: t("referees.ras") },
    { key: "cei", label: t("referees.cei") },
    { key: "mds", label: t("referees.mds") },
    { key: "prs", label: t("referees.prs") },
    { key: "ci", label: t("referees.ci") },
  ] as const;

  const radar = metrics.map((m) => ({
    metric: m.label,
    [a.name]: subA[m.key],
    [b.name]: subB[m.key],
  }));

  const headToHead = [
    { label: "ARPS", a: a.arps, b: b.arps, max: 100 },
    { label: t("arae.rmcs"), a: a.rmcsAvg, b: b.rmcsAvg, max: 100 },
    { label: t("referees.varAccuracy"), a: a.varAccuracy, b: b.varAccuracy, max: 100 },
    { label: t("arae.fitness"), a: a.fitness, b: b.fitness, max: 100 },
    { label: t("referees.matchesOfficiated"), a: a.matches, b: b.matches, max: Math.max(a.matches, b.matches) },
    {
      label: locale === "fr" ? "Cartons / rencontre" : "Cards per match",
      a: Number(((a.cards.yellow + a.cards.red) / a.matches).toFixed(2)),
      b: Number(((b.cards.yellow + b.cards.red) / b.matches).toFixed(2)),
      max: 5,
      lowerIsBetter: true,
    },
  ];

  const gaps = metrics
    .map((m) => ({ label: m.label, diff: subA[m.key] - subB[m.key] }))
    .sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff));

  const options = pool.map((r) => ({ value: r.id, label: `${r.name} — ${r.arps.toFixed(1)}` }));

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeading titleKey="compare.title" subtitleKey="subtitles.compare" />

      <Card>
        <CardHeader title={t("compare.pickTwo")} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select label={t("compare.refereeA")} value={a.id} onChange={setAId} options={options} />
          <Select label={t("compare.refereeB")} value={b.id} onChange={setBId} options={options} />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[a, b].map((referee, i) => (
          <Card key={referee.id} className={cn(i === 0 ? "border-line-strong" : "border-pitch/30")}>
            <div className="flex items-center gap-3">
              <Avatar initials={referee.initials} size={44} tone={i === 0 ? "chalk" : "neutral"} />
              <div className="min-w-0 flex-1">
                <Link href={`/referees/${referee.id}`} className="flex items-center gap-1 text-[14px] text-chalk hover:underline">
                  {referee.name}
                  <ArrowUpRight size={12} />
                </Link>
                <p className="truncate text-[11.5px] text-chalk-faint">
                  {countryFlag(referee.countryCode)} {countryName(referee.countryCode, locale)} · {referee.level}
                </p>
                <Badge className="mt-1.5" tone={referee.trend >= 0 ? "pitch" : "red"}>
                  {referee.trend >= 0 ? "+" : "−"}
                  {Math.abs(referee.trend).toFixed(1)} {t("common.points")}
                </Badge>
              </div>
              <ScoreRing value={referee.arps} size={52} />
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("compare.profile")} subtitle={t("compare.profileSub")} />
          <CompareRadar data={radar} seriesNames={[a.name, b.name]} />
        </Card>

        <Card>
          <CardHeader title={t("compare.headToHead")} />
          <div className="space-y-3.5">
            {headToHead.map((row) => {
              const aWins = row.lowerIsBetter ? row.a < row.b : row.a > row.b;
              return (
                <div key={row.label}>
                  <div className="mb-1 flex items-center justify-between text-[12px]">
                    <span className={cn("board", aWins ? "text-chalk" : "text-chalk-faint")}>{row.a}</span>
                    <span className="text-chalk-faint">{row.label}</span>
                    <span className={cn("board", !aWins ? "text-pitch" : "text-chalk-faint")}>{row.b}</span>
                  </div>
                  <div className="flex gap-1">
                    <div className="flex flex-1 justify-end">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
                        <div
                          className="ml-auto h-full rounded-full bg-pitch"
                          style={{ width: `${Math.min(100, (row.a / row.max) * 100)}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex-1">
                      <Meter value={(row.b / row.max) * 100} tone="pitch" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title={t("compare.verdict")} subtitle={t("compare.verdictSub")} />
        <ul className="space-y-2">
          {gaps.map((gap) => {
            const leader = gap.diff >= 0 ? a : b;
            return (
              <li
                key={gap.label}
                className="flex items-center justify-between gap-3 rounded-lg border border-line bg-ink-1 px-3 py-2.5"
              >
                <span className="min-w-0 text-[12.5px] text-chalk-dim">{gap.label}</span>
                <span className="shrink-0 text-[12.5px]">
                  <span className={cn(gap.diff >= 0 ? "text-chalk" : "text-pitch")}>{leader.name}</span>
                  <span className="text-chalk-faint">
                    {" "}
                    {t("compare.aheadOn")} {t("compare.by")} {Math.abs(gap.diff).toFixed(1)}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
