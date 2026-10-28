"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Compass, Gauge, Map, Pencil, Route, Ruler, Video, Zap } from "@/components/icons/glyphs";
import { cn } from "@/lib/utils";
import { useFormatters, useT } from "@/lib/i18n/LocaleProvider";
import { PageHeading } from "@/components/layout/PageHeading";
import { Badge, Board, Button, Card, CardHeader, EmptyState, Meter } from "@/components/ui";
import { DiagonalCorridor, HeatField, Pitch, corridorY, heatLegend } from "@/components/pitch/Pitch";
import { axisProps, barCursor, chartColors, tooltipStyle } from "@/components/charts/theme";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { getMatch, listEventTypes, listMatches } from "@/lib/api/assessments";
import { listCompetitions } from "@/lib/api/competitions";
import { getOfficial } from "@/lib/api/officials";
import { PositioningDialog } from "@/components/matches/PositioningDialog";
import { hasPhysical } from "@/lib/matches/positioning";
import { useResource } from "@/lib/admin/hooks";
import { eventTypeLabel } from "@/lib/matches/eventTypes";
import { useLocale } from "@/lib/i18n/LocaleProvider";

export default function PositioningPage() {
  const t = useT();
  const { locale } = useLocale();
  const fmt = useFormatters();
  const { data: eventTypes } = useResource("event-types", (signal) => listEventTypes(signal));
  const { data: list } = useResource("positioning:matches", (signal) => listMatches({ limit: 100 }, signal));
  const [matchId, setMatchId] = useState<string | null>(null);
  const activeId = matchId ?? list?.[0]?.id ?? null;
  const {
    data: match,
    loading: matchLoading,
    reload: reloadMatch,
  } = useResource(`positioning:match:${activeId}`, (signal) => getMatch(activeId!, signal), !!activeId);
  const { data: competitions } = useResource("positioning:competitions", (signal) => listCompetitions(undefined, signal));
  const { data: referee } = useResource(`positioning:referee:${match?.refereeId}`, (signal) => getOfficial(match!.refereeId, signal), !!match?.refereeId);
  const [recording, setRecording] = useState(false);

  if (list && list.length === 0) {
    return (
      <div className="space-y-4">
        <PageHeading titleKey="positioning.title" subtitleKey="subtitles.positioning" />
        <Card>
          <EmptyState title={t("calendar.noFixtures")} hint={t("calendar.noFixturesHint")} />
        </Card>
      </div>
    );
  }

  if (!list || matchLoading || !match) {
    return (
      <div className="space-y-4">
        <PageHeading titleKey="positioning.title" subtitleKey="subtitles.positioning" />
        <Card>
          <EmptyState title={t("admin.common.loading")} />
        </Card>
      </div>
    );
  }

  const points = match.heatPoints ?? [];
  const physical = match.physical;
  const hasPhys = hasPhysical(match);
  const decisions = match.decisions ?? [];
  const competition = competitions?.find((c) => c.id === match.competitionId);
  const distances = decisions.map((d) => ({
    minute: `${d.minute}'`,
    distance: d.distance,
    overturned: d.finalCall === "overturned",
  }));
  const farCalls = decisions.filter((d) => d.distance > 20).length;

  // Each decision is placed off the referee's own corridor by exactly the
  // distance the panel quotes, so the sight line on the map is the metric.
  const spots = decisions.map((d) => {
    const refX = 6 + ((d.minute * 1.9) % 92);
    const refY = corridorY(refX);
    const roomUp = refY - 4;
    const roomDown = 64 - refY;
    const fits = d.distance * 0.909 <= Math.min(roomUp, roomDown);
    const side = fits ? (d.minute % 2 === 0 ? -1 : 1) : roomDown > roomUp ? 1 : -1;
    return {
      d,
      refX,
      refY,
      x: Math.max(2, Math.min(103, refX - 0.416 * side * d.distance)),
      y: Math.max(3, Math.min(65, refY + 0.909 * side * d.distance)),
    };
  });

  const matchTitle = `${match.home} ${match.score} ${match.away}`;

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeading titleKey="positioning.title" subtitleKey="subtitles.positioning" />

      <Card>
        <CardHeader
          icon={Video}
          tint="var"
          title={t("positioning.selectMatch")}
          subtitle={referee?.official.name}
          action={
            <Button size="sm" variant="secondary" onClick={() => setRecording(true)}>
              <Pencil size={13} />
              {t("positioning.form.open")}
            </Button>
          }
        />
        <div className="scroll-x -mx-1 px-1">
          <div className="flex gap-2">
            {list.map((m) => (
              <button
                key={m.id}
                onClick={() => setMatchId(m.id)}
                className={cn(
                  "shrink-0 rounded-lg border px-3 py-1.5 text-xs transition-colors max-sm:min-h-10",
                  m.id === match.id
                    ? "border-red-600 bg-red-600 text-white"
                    : "border-line bg-ink-1 text-chalk-dim hover:border-line-strong hover:text-chalk",
                )}
              >
                <CountryFlag code={m.countryCode} /> {m.home}, {m.away}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {!hasPhys ? (
        <Card>
          <EmptyState title={t("positioning.form.noneYet")} />
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Board primary tone="var" icon={Route} label={t("positioning.distance")} value={physical.distanceKm ?? 0} unit={t("positioning.km")} />
          <Board tone="pitch" icon={Zap} label={t("positioning.sprints")} value={physical.sprints ?? 0} />
          <Board tone="gold" icon={Gauge} label={t("positioning.topSpeed")} value={physical.topSpeed ?? 0} unit={t("positioning.kmh")} />
          <Board icon={Ruler} label={t("positioning.avgDistanceToBall")} value={physical.avgDistanceToBall ?? 0} unit={t("positioning.metres")} />
          <Board
            icon={Compass}
            label={t("positioning.diagonal")}
            value={`${physical.diagonalAdherence ?? 0}%`}
            tone={(physical.diagonalAdherence ?? 0) >= 85 ? "pitch" : (physical.diagonalAdherence ?? 0) >= 78 ? "amber" : "red"}
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            icon={Map}
            tint="pitch"
            title={t("positioning.heatmap")}
            subtitle={t("positioning.heatmapSub")}
            action={
              <span className="text-xs text-chalk-faint">
                {competition?.name} · {fmt.date(match.date)}
              </span>
            }
          />
          {points.length === 0 ? (
            <EmptyState title={t("positioning.form.noneYet")} />
          ) : (
            <div className="aspect-[111/74] w-full overflow-hidden rounded-[10px] border border-line bg-[#0b1524]">
              <Pitch>
                <HeatField points={points} />
                <DiagonalCorridor />
                {spots.map(({ d, refX, refY, x, y }) => {
                  const severe = d.eventType === "penalty_decision" || (d.eventType === "card" && (d.subEvent === "red" || d.subEvent === "second_yellow"));
                  const cautioned = d.eventType === "card" && d.subEvent === "yellow";
                  const colour = severe ? "#ef4444" : cautioned ? "#eab308" : d.varReview ? "#38bdf8" : "#f1f5f9";
                  return (
                    <g key={d.id}>
                      {/* The sight line: referee position to the decision. */}
                      <line
                        x1={refX}
                        y1={refY}
                        x2={x}
                        y2={y}
                        stroke={colour}
                        strokeOpacity="0.35"
                        strokeWidth="0.28"
                        strokeDasharray="1.4 1.4"
                      />
                      <circle cx={refX} cy={refY} r="0.8" fill="#0b1524" stroke={colour} strokeOpacity="0.6" strokeWidth="0.3" />
                      <circle cx={x} cy={y} r="2.4" fill={colour} fillOpacity="0.16" />
                      <circle cx={x} cy={y} r="1.15" fill={colour} />
                    </g>
                  );
                })}
              </Pitch>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-chalk-faint">
            <span className="inline-flex items-center gap-1.5">
              {t("positioning.presence")}
              <span className="flex overflow-hidden rounded-full">
                {heatLegend.map((fill) => (
                  <span key={fill} className="h-2 w-5" style={{ background: fill }} />
                ))}
              </span>
              {t("positioning.presenceHigh")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-card-red" />
              {t("positioning.legendRed")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber" />
              {t("positioning.legendYellow")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-var" />
              {t("matchReview.varReview")}
            </span>
          </div>
          <p className="mt-2 text-xs leading-snug text-chalk-faint">
            {t("positioning.sightLineNote", { n: farCalls })}
          </p>
        </Card>

        <Card>
          <CardHeader icon={Compass} tint="gold" title={t("positioning.diagonal")} subtitle={t("positioning.diagonalSub")} />
          {!hasPhys ? (
            <EmptyState title={t("positioning.form.noneYet")} />
          ) : (
            <div className="space-y-3">
              <div>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-chalk-dim">{t("positioning.inChannel")}</span>
                  <span className="board text-chalk">{physical.diagonalAdherence}%</span>
                </div>
                <Meter value={physical.diagonalAdherence!} tone={physical.diagonalAdherence! >= 85 ? "pitch" : "amber"} />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-chalk-dim">{t("positioning.outOfChannel")}</span>
                  <span className="board text-chalk">{100 - physical.diagonalAdherence!}%</span>
                </div>
                <Meter value={100 - physical.diagonalAdherence!} tone="red" />
              </div>
            </div>
          )}

          <p className="mt-4 text-xs leading-relaxed text-chalk-faint">
            {t("positioning.diagonalNote")}
          </p>

          {decisions.length > 0 && (
            <div className="mt-4 space-y-1.5">
              {decisions
                .slice()
                .sort((a, b) => b.distance - a.distance)
                .slice(0, 3)
                .map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-ink-1 px-2.5 py-1.5">
                    <span className="board w-8 text-xs text-chalk-faint">{d.minute}&apos;</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-chalk-dim">{eventTypeLabel(eventTypes, d.eventType, locale)}</span>
                    <Badge tone={d.distance > 25 ? "red" : d.distance > 18 ? "amber" : "neutral"}>{d.distance} m</Badge>
                  </div>
                ))}
            </div>
          )}
        </Card>
      </div>

      {decisions.length > 0 && (
        <Card>
          <CardHeader icon={Ruler} tint="var" title={t("positioning.decisionPoints")} subtitle={t("positioning.decisionPointsSub")} />
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distances} margin={{ top: 4, right: 6, bottom: 0, left: -24 }}>
                <CartesianGrid stroke={chartColors.grid} vertical={false} />
                <XAxis dataKey="minute" {...axisProps} />
                <YAxis {...axisProps} unit=" m" />
                <Tooltip contentStyle={tooltipStyle} cursor={barCursor} />
                <Bar dataKey="distance" name={t("positioning.decisionPoints")} radius={[3, 3, 0, 0]}>
                  {distances.map((d, i) => (
                    <Cell key={i} fill={d.overturned ? chartColors.amber : chartColors.chalkDim} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-chalk-faint">
            {t("positioning.amberNote")}
          </p>
        </Card>
      )}

      {recording && (
        <PositioningDialog
          match={match}
          title={matchTitle}
          onClose={() => setRecording(false)}
          onDone={() => {
            setRecording(false);
            reloadMatch();
          }}
        />
      )}
    </div>
  );
}
