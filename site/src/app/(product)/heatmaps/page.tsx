"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";
import { useFormatters, useLocale, useT } from "@/lib/i18n/LocaleProvider";
import { useScope } from "@/lib/scope/ScopeProvider";
import { PageHeading } from "@/components/layout/PageHeading";
import { Badge, Board, Card, CardHeader, EmptyState, Meter } from "@/components/ui";
import { Pitch } from "@/components/pitch/Pitch";
import { axisProps, chartColors, tooltipStyle } from "@/components/charts/theme";
import { competitionById, countryFlag, heatPointsFor, matches, refereeById } from "@/lib/mock-data";

export default function PositioningPage() {
  const t = useT();
  const { locale } = useLocale();
  const fmt = useFormatters();
  const { matches: inScope } = useScope();

  const list = useMemo(() => matches.filter((m) => inScope(m.countryCode)), [inScope]);
  const [matchId, setMatchId] = useState(list[0]?.id ?? matches[0].id);
  const match = list.find((m) => m.id === matchId) ?? list[0];

  const points = useMemo(() => (match ? heatPointsFor(match.id) : []), [match]);

  if (!match) {
    return (
      <div className="space-y-4">
        <PageHeading titleKey="positioning.title" subtitleKey="subtitles.positioning" />
        <Card>
          <EmptyState title={t("calendar.noFixtures")} hint={t("calendar.noFixturesHint")} />
        </Card>
      </div>
    );
  }

  const referee = refereeById.get(match.refereeId);
  const distances = match.decisions.map((d) => ({
    minute: `${d.minute}'`,
    distance: d.distance,
    overturned: d.finalCall === "overturned",
    type: d.type,
  }));
  const farCalls = match.decisions.filter((d) => d.distance > 20).length;

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeading titleKey="positioning.title" subtitleKey="subtitles.positioning" />

      <Card>
        <CardHeader title={t("positioning.selectMatch")} subtitle={referee?.name} />
        <div className="scroll-x -mx-1 px-1">
          <div className="flex gap-2">
            {list.map((m) => (
              <button
                key={m.id}
                onClick={() => setMatchId(m.id)}
                className={cn(
                  "shrink-0 rounded-md border px-3 py-1.5 text-[12.5px] transition-colors",
                  m.id === match.id
                    ? "border-pitch bg-pitch text-[#04140c]"
                    : "border-line bg-ink-1 text-chalk-dim hover:border-line-strong hover:text-chalk",
                )}
              >
                {countryFlag(m.countryCode)} {m.home} — {m.away}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Board primary label={t("positioning.distance")} value={match.physical.distanceKm} unit={t("positioning.km")} />
        <Board label={t("positioning.sprints")} value={match.physical.sprints} />
        <Board label={t("positioning.topSpeed")} value={match.physical.topSpeed} unit={t("positioning.kmh")} />
        <Board
          label={t("positioning.avgDistanceToBall")}
          value={match.physical.avgDistanceToBall}
          unit={t("positioning.metres")}
        />
        <Board
          label={t("positioning.diagonal")}
          value={`${match.physical.diagonalAdherence}%`}
          tone={match.physical.diagonalAdherence >= 85 ? "pitch" : match.physical.diagonalAdherence >= 78 ? "amber" : "red"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title={t("positioning.heatmap")}
            subtitle={t("positioning.heatmapSub")}
            action={
              <span className="text-[11.5px] text-chalk-faint">
                {competitionById.get(match.competitionId)?.name} · {fmt.date(match.date)}
              </span>
            }
          />
          <div className="aspect-[100/64] w-full overflow-hidden rounded-lg border border-line">
            <Pitch>
              {points.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r={1.6 + p.intensity * 1.5}
                  fill="#4ade80"
                  fillOpacity={0.06 + p.intensity * 0.13}
                />
              ))}
              {match.decisions.map((d) => {
                const x = 8 + (d.minute / 90) * 84;
                const y = 10 + ((d.distance * 1.6) % 44);
                const colour =
                  d.type === "Red Card" || d.type === "Penalty"
                    ? "#ef4444"
                    : d.type === "Yellow Card" || d.type === "Handball"
                      ? "#f5c518"
                      : d.varReview
                        ? "#4da3ff"
                        : "#f1f5f9";
                return (
                  <g key={d.id}>
                    <circle cx={x} cy={y} r="1.5" fill={colour} />
                    <circle cx={x} cy={y} r="3" fill="none" stroke={colour} strokeOpacity="0.4" strokeWidth="0.3" />
                  </g>
                );
              })}
            </Pitch>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-chalk-faint">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-card-red" />
              {locale === "fr" ? "Penalty / rouge" : "Penalty / red"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber" />
              {locale === "fr" ? "Jaune / main" : "Yellow / handball"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-var" />
              {t("matchReview.varReview")}
            </span>
            <span className="ml-auto">
              {locale === "fr"
                ? `${farCalls} décisions prises à plus de 20 m`
                : `${farCalls} calls made from beyond 20 m`}
            </span>
          </div>
        </Card>

        <Card>
          <CardHeader title={t("positioning.diagonal")} subtitle={t("positioning.diagonalSub")} />
          <div className="space-y-3">
            <div>
              <div className="mb-1 flex items-center justify-between text-[12px]">
                <span className="text-chalk-dim">{t("positioning.inChannel")}</span>
                <span className="board text-chalk">{match.physical.diagonalAdherence}%</span>
              </div>
              <Meter
                value={match.physical.diagonalAdherence}
                tone={match.physical.diagonalAdherence >= 85 ? "pitch" : "amber"}
              />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-[12px]">
                <span className="text-chalk-dim">{t("positioning.outOfChannel")}</span>
                <span className="board text-chalk">{100 - match.physical.diagonalAdherence}%</span>
              </div>
              <Meter value={100 - match.physical.diagonalAdherence} tone="red" />
            </div>
          </div>

          <p className="mt-4 text-[12.5px] leading-relaxed text-chalk-faint">
            {locale === "fr"
              ? "La diagonale est le couloir que l'arbitre est censé tenir. Chaque décision prise en dehors coûte de l'angle de vue — c'est le lien direct entre placement et justesse."
              : "The diagonal is the channel the referee is meant to hold. Every call made outside it costs viewing angle — that is the direct link between positioning and accuracy."}
          </p>

          <div className="mt-4 space-y-1.5">
            {match.decisions
              .slice()
              .sort((a, b) => b.distance - a.distance)
              .slice(0, 3)
              .map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-2 rounded-md border border-line bg-ink-1 px-2.5 py-1.5">
                  <span className="board w-8 text-[11.5px] text-chalk-faint">{d.minute}&apos;</span>
                  <span className="min-w-0 flex-1 truncate text-[12px] text-chalk-dim">{d.type}</span>
                  <Badge tone={d.distance > 25 ? "red" : d.distance > 18 ? "amber" : "neutral"}>{d.distance} m</Badge>
                </div>
              ))}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title={t("positioning.decisionPoints")} subtitle={t("positioning.decisionPointsSub")} />
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={distances} margin={{ top: 4, right: 6, bottom: 0, left: -24 }}>
              <CartesianGrid stroke={chartColors.grid} vertical={false} />
              <XAxis dataKey="minute" {...axisProps} />
              <YAxis {...axisProps} unit=" m" />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
              <Bar dataKey="distance" name={t("positioning.decisionPoints")} radius={[3, 3, 0, 0]}>
                {distances.map((d, i) => (
                  <Cell key={i} fill={d.overturned ? chartColors.amber : chartColors.chalkDim} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-[11.5px] text-chalk-faint">
          {locale === "fr"
            ? "Les barres ambre sont les décisions annulées après revue."
            : "Amber bars are the calls overturned on review."}
        </p>
      </Card>
    </div>
  );
}
