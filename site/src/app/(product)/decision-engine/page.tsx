"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, ArrowUpRight, BarChart3, CheckCircle2, Flame, ListChecks, Radio, Ruler, Scale, Users, Video } from "@/components/icons/glyphs";
import { cn } from "@/lib/utils";
import { useFormatters, useLocale, useT } from "@/lib/i18n/LocaleProvider";
import { useScope } from "@/lib/scope/ScopeProvider";
import { PageHeading } from "@/components/layout/PageHeading";
import { Badge, Board, Card, CardHeader, EmptyState, Meter, type Tone } from "@/components/ui";
import { axisProps, chartColors, tooltipStyle } from "@/components/charts/theme";
import { CrewStrip } from "@/components/officiating/CrewStrip";
import {
  assessmentByMatch,
  competitionById,
  decisionTypeKey,
  fixtures,
  matches,
  matchesOf,
  refereeById,
  refereeHref,
  type MatchDecision,
} from "@/lib/store";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { pickLocalized } from "@/lib/i18n/localized";

const typeTone: Record<MatchDecision["type"], Tone> = {
  Penalty: "red",
  "Red Card": "red",
  "Yellow Card": "amber",
  Offside: "var",
  Handball: "amber",
  Foul: "neutral",
};

export default function MatchReviewPage() {
  const t = useT();
  const { locale } = useLocale();
  const fmt = useFormatters();
  const { matches: inScope } = useScope();

  const list = useMemo(() => matches.filter((m) => inScope(m.countryCode)), [inScope]);
  const [matchId, setMatchId] = useState(list[0]?.id ?? "");
  const match = list.find((m) => m.id === matchId) ?? list[0];
  const [decisionId, setDecisionId] = useState<string | null>(null);

  if (!match) {
    return (
      <div className="space-y-4">
        <PageHeading titleKey="matchReview.title" subtitleKey="subtitles.matchReview" />
        <Card>
          <EmptyState title={t("calendar.noFixtures")} hint={t("calendar.noFixturesHint")} />
        </Card>
      </div>
    );
  }

  const active = match.decisions.find((d) => d.id === decisionId) ?? match.decisions[0];
  if (!active) {
    return (
      <div className="space-y-4">
        <PageHeading titleKey="matchReview.title" subtitleKey="subtitles.matchReview" />
        <Card>
          <EmptyState title={t("matchReview.noDecisions")} hint={t("matchReview.noDecisionsHint")} />
        </Card>
      </div>
    );
  }
  const overturned = match.decisions.filter((d) => d.finalCall === "overturned").length;
  const varReviews = match.decisions.filter((d) => d.varReview).length;
  const referee = refereeById.get(match.refereeId);
  const report = assessmentByMatch.get(match.id);
  const fixture = fixtures.find((f) => f.home === match.home && f.away === match.away);

  // How this match sat against the referee's own season, which is the only
  // baseline that makes a single-match number mean anything.
  const own = matchesOf(match.refereeId);
  const avg = (pick: (m: (typeof matches)[number]) => number) =>
    own.reduce((sum, m) => sum + pick(m), 0) / own.length;
  const farCalls = match.decisions.filter((d) => d.distance > 20).length;
  const comparison = [
    { label: t("matchReview.matchArps"), now: match.arpsForMatch, season: Math.round(avg((m) => m.arpsForMatch) * 10) / 10, max: 100 },
    { label: t("positioning.diagonal"), now: match.physical.diagonalAdherence, season: Math.round(avg((m) => m.physical.diagonalAdherence)), max: 100 },
    { label: t("positioning.distance"), now: match.physical.distanceKm, season: Math.round(avg((m) => m.physical.distanceKm) * 10) / 10, max: 14 },
    { label: t("positioning.sprints"), now: match.physical.sprints, season: Math.round(avg((m) => m.physical.sprints)), max: 50 },
  ];

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeading titleKey="matchReview.title" subtitleKey="subtitles.matchReview" />

      <Card>
        <CardHeader icon={Video} tint="var" title={t("matchReview.selectMatch")} subtitle={t("matchReview.selectMatchSub")} />
        <div className="scroll-x -mx-1 px-1">
          <div className="flex gap-2">
            {list.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  setMatchId(m.id);
                  setDecisionId(null);
                }}
                className={cn(
                  "shrink-0 rounded-lg border px-3 py-1.5 text-xs transition-colors max-sm:min-h-10",
                  m.id === match.id
                    ? "border-red-600 bg-red-600 text-white"
                    : "border-line bg-ink-1 text-chalk-dim hover:border-line-strong hover:text-chalk",
                )}
              >
                <CountryFlag code={m.countryCode} /> {m.home} — {m.away}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs text-chalk-faint">
              {competitionById.get(match.competitionId)?.name} · {fmt.longDate(match.date)}
            </p>
            <h2 className="mt-1 font-display text-[20px] font-semibold text-chalk">
              {match.home} <span className="board text-chalk-dim">{match.score}</span> {match.away}
            </h2>
            {referee && (
              <Link
                href={refereeHref(referee.id)}
                className="mt-1 inline-flex items-center gap-1 text-xs text-chalk-faint hover:text-chalk max-sm:-my-3 max-sm:py-3"
              >
                {t("common.referee")}: {referee.name}
                <ArrowUpRight size={11} />
              </Link>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2 sm:w-[300px]">
            <Board tone="var" label={t("matchReview.matchArps")} value={match.arpsForMatch} />
            <Board tone="gold" label={t("arae.rmcs")} value={match.rmcs} />
            <Board
              label={t("matchReview.overturned")}
              value={overturned}
              tone={overturned ? "amber" : "pitch"}
            />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" padded={false}>
          <div className="px-4 py-3">
            <CardHeader
              icon={ListChecks}
              tint="pitch"
              title={t("matchReview.timeline")}
              subtitle={t("matchReview.timelineSub", { n: match.decisions.length })}
              className="mb-0"
            />
          </div>
          <div className="chalk-rule" />
          <ul>
            {match.decisions.map((decision) => (
              <li key={decision.id}>
                <button
                  onClick={() => setDecisionId(decision.id)}
                  className={cn(
                    "flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left last:border-0 transition-colors",
                    active.id === decision.id ? "bg-wash/[0.06]" : "hover:bg-wash/[0.03]",
                  )}
                >
                  <span className="board w-9 shrink-0 text-sm text-chalk-faint">{decision.minute}&apos;</span>
                  <Badge tone={typeTone[decision.type]} className="shrink-0">
                    {t(decisionTypeKey[decision.type])}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-xs text-chalk-dim">
                    {pickLocalized(decision.description, locale)}
                  </span>
                  {decision.varReview && <Radio size={13} className="shrink-0 text-var" />}
                  {decision.finalCall === "overturned" ? (
                    <AlertTriangle size={14} className="shrink-0 text-amber" />
                  ) : (
                    <CheckCircle2 size={14} className="shrink-0 text-pitch" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader
            icon={Scale}
            tint="gold"
            title={t("matchReview.detail")}
            subtitle={`${t("matchReview.minute")} ${active.minute}'`}
          />
          <Badge tone={typeTone[active.type]}>{t(decisionTypeKey[active.type])}</Badge>
          <p className="mt-3 text-sm leading-relaxed text-chalk">{pickLocalized(active.description, locale)}</p>

          <dl className="mt-4 grid grid-cols-2 gap-2">
            <Fact label={t("matchReview.initialCall")} value={t(active.initialCall === "given" ? "matchReview.given" : "matchReview.notGiven")} />
            <Fact
              label={t("matchReview.finalCall")}
              value={t(active.finalCall === "confirmed" ? "matchReview.confirmedCall" : "matchReview.overturnedCall")}
              tone={active.finalCall === "confirmed" ? "text-pitch" : "text-amber"}
            />
            <Fact
              label={t("matchReview.varReview")}
              value={t(active.varReview ? "common.yes" : "common.no")}
              tone={active.varReview ? "text-var" : "text-chalk"}
            />
            <Fact label={t("matchReview.confidence")} value={`${active.confidence}%`} />
            <Fact label={t("positioning.decisionPoints")} value={`${active.distance} m`} />
          </dl>

          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="text-chalk-faint">{t("matchReview.pressure")}</span>
              <span className="board text-chalk">{active.pressureIndex}</span>
            </div>
            <Meter
              value={active.pressureIndex}
              tone={active.pressureIndex > 80 ? "red" : active.pressureIndex > 60 ? "amber" : "chalk"}
            />
          </div>

          <div className="mt-4">
            <p className="mb-1.5 text-xs font-medium text-chalk-faint">
              {t("matchReview.playersInvolved")}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {active.players.map((player) => (
                <Badge key={player} tone="neutral">
                  {player}
                </Badge>
              ))}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/heatmaps"
              className="inline-flex items-center gap-1 rounded-lg border border-line bg-ink-1 px-2.5 py-1.5 text-xs text-chalk-dim hover:text-chalk max-sm:min-h-10"
            >
              <Ruler size={12} />
              {t("nav.positioning")}
            </Link>
            {report && (
              <Link
                href="/assessments"
                className="inline-flex items-center gap-1 rounded-lg border border-line bg-ink-1 px-2.5 py-1.5 text-xs text-chalk-dim hover:text-chalk max-sm:min-h-10"
              >
                {t("assessments.observer")} {report.state === "filed" ? report.overall.toFixed(1) : "—"}
                <ArrowUpRight size={11} />
              </Link>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader icon={Users} tint="var" title={t("matchReview.crewOnTheDay")} subtitle={t("matchReview.crewOnTheDaySub")} />
          {fixture ? (
            <CrewStrip crew={fixture.crew} size="md" />
          ) : (
            <EmptyState title={t("common.empty")} />
          )}
          <dl className="mt-4 grid grid-cols-2 gap-2">
            <Fact label={t("matchReview.farCalls")} value={`${farCalls} / ${match.decisions.length}`} tone={farCalls > 2 ? "text-amber" : "text-chalk"} />
            <Fact label={t("matchReview.reviewRate")} value={`${varReviews} / ${match.decisions.length}`} tone="text-var" />
          </dl>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader icon={BarChart3} tint="pitch" title={t("matchReview.againstSeason")} subtitle={t("matchReview.againstSeasonSub")} />
          <ul className="space-y-3">
            {comparison.map((row) => (
              <li key={row.label}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-chalk-dim">{row.label}</span>
                  <span className="flex items-center gap-3">
                    <span className="text-chalk-faint">
                      {t("matchReview.seasonAvg")} <span className="board text-chalk-dim">{row.season}</span>
                    </span>
                    <span
                      className={cn(
                        "board",
                        row.now >= row.season ? "text-pitch" : "text-amber",
                      )}
                    >
                      {row.now}
                    </span>
                  </span>
                </div>
                <div className="relative">
                  <Meter value={(row.now / row.max) * 100} tone={row.now >= row.season ? "pitch" : "amber"} />
                  <span
                    className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-chalk-dim"
                    style={{ left: `${Math.min(100, (row.season / row.max) * 100)}%` }}
                    title={t("matchReview.seasonAvg")}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card>
        <CardHeader
          icon={Flame}
          tint="amber"
          title={t("matchReview.pressureChart")}
          subtitle={t("matchReview.pressureChartSub")}
          action={
            <span className="text-xs text-chalk-faint">
              {varReviews} {t("matchReview.varReview")}
            </span>
          }
        />
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={match.pressureTimeline} margin={{ top: 4, right: 6, bottom: 0, left: -24 }}>
              <defs>
                <linearGradient id="pressure" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={chartColors.red} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={chartColors.red} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={chartColors.grid} vertical={false} />
              <XAxis dataKey="minute" {...axisProps} unit="'" />
              <YAxis domain={[0, 100]} {...axisProps} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: chartColors.grid }} />
              {match.decisions.map((d) => (
                <ReferenceLine
                  key={d.id}
                  x={d.minute}
                  stroke={d.id === active.id ? chartColors.chalk : "var(--line-strong)"}
                  strokeDasharray={d.id === active.id ? undefined : "3 3"}
                />
              ))}
              <Area
                type="monotone"
                dataKey="pressure"
                name={t("matchReview.pressure")}
                stroke={chartColors.red}
                strokeWidth={1.8}
                fill="url(#pressure)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}

function Fact({ label, value, tone = "text-chalk" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-line bg-ink-1 px-2.5 py-2">
      <dt className="text-xs font-medium text-chalk-faint">{label}</dt>
      <dd className={cn("mt-0.5 text-xs font-medium", tone)}>{value}</dd>
    </div>
  );
}
