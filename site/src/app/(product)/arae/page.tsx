"use client";

import { useMemo, useState } from "react";
import { BedDouble, Check, Flame, History, ListChecks, Plane, Shield, Sparkles, TrendingUp, UserPlus, Users } from "@/components/icons/glyphs";
import { cn } from "@/lib/utils";
import { useFormatters, useLocale, useT } from "@/lib/i18n/LocaleProvider";
import { useScope } from "@/lib/scope/ScopeProvider";
import { useAppointments } from "@/lib/appointments/AppointmentsProvider";
import { PageHeading } from "@/components/layout/PageHeading";
import { Avatar, Badge, Board, Button, Card, CardHeader, EmptyState, Meter } from "@/components/ui";
import { CrewStrip } from "@/components/officiating/CrewStrip";
import { candidatesForSlot, type Candidate } from "@/lib/assignment";
import {
  competitionById,
  countryFlag,
  fixtures,
  officialById,
  roleKey,
  type CrewRole,
} from "@/lib/mock-data";

export default function AraePage() {
  const t = useT();
  const { locale } = useLocale();
  const fmt = useFormatters();
  const { matches: inScope } = useScope();
  const { crewFor, assign, confirmAll, trace } = useAppointments();

  const queue = useMemo(
    () =>
      fixtures
        .filter((f) => !f.played && inScope(f.countryCode))
        .sort((a, b) => b.importance - a.importance)
        .slice(0, 12),
    [inScope],
  );

  const [fixtureId, setFixtureId] = useState<string | null>(queue[0]?.id ?? null);
  const fixture = queue.find((f) => f.id === fixtureId) ?? queue[0];
  const crew = useMemo(() => (fixture ? crewFor(fixture) : []), [fixture, crewFor]);

  const firstOpen = crew.find((s) => s.role !== "OBS" && (s.state === "empty" || s.state === "declined"))?.role;
  const [role, setRole] = useState<CrewRole | null>(null);
  const activeRole: CrewRole | null = role ?? firstOpen ?? crew[0]?.role ?? null;

  const candidates = useMemo(
    () => (fixture && activeRole ? candidatesForSlot(fixture, activeRole, crew).slice(0, 6) : []),
    [fixture, activeRole, crew],
  );

  const eligible = candidates.filter((c) => c.blockers.length === 0);
  const top = eligible[0];
  const openCount = crew.filter((s) => s.role !== "OBS" && (s.state === "empty" || s.state === "declined")).length;
  const fixtureTrace = trace.filter((entry) => entry.fixtureId === fixture?.id);

  if (!fixture) {
    return (
      <div className="space-y-4">
        <PageHeading titleKey="arae.title" subtitleKey="subtitles.arae" />
        <Card>
          <EmptyState title={t("calendar.noFixtures")} hint={t("calendar.noFixturesHint")} />
        </Card>
      </div>
    );
  }

  const comp = competitionById.get(fixture.competitionId);

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeading titleKey="arae.title" subtitleKey="subtitles.arae" />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Card padded={false} className="h-fit">
          <div className="px-4 py-3">
            <CardHeader icon={ListChecks} tint="var" title={t("arae.queue")} subtitle={t("arae.queueSub")} className="mb-0" />
          </div>
          <div className="chalk-rule" />
          <ul className="max-h-[420px] overflow-y-auto xl:max-h-[620px]">
            {queue.map((item) => {
              const itemCrew = crewFor(item);
              const open = itemCrew.filter((s) => s.role !== "OBS" && (s.state === "empty" || s.state === "declined")).length;
              return (
                <li key={item.id}>
                  <button
                    onClick={() => {
                      setFixtureId(item.id);
                      setRole(null);
                    }}
                    className={cn(
                      "flex w-full flex-col gap-1 border-b border-line px-4 py-2.5 text-left last:border-0 transition-colors",
                      item.id === fixture.id ? "bg-wash/[0.06]" : "hover:bg-wash/[0.03]",
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-chalk">
                        {countryFlag(item.countryCode)} {item.home} — {item.away}
                      </span>
                      <span className={cn("board shrink-0 text-xs", open ? "text-card-red" : "text-pitch")}>
                        {open || "✓"}
                      </span>
                    </span>
                    <span className="truncate text-[11px] text-chalk-faint">
                      {competitionById.get(item.competitionId)?.name} · {fmt.date(item.date)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>

        <div className="space-y-4">
          <Card>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <Badge tone="neutral">{comp?.name}</Badge>
                <h2 className="mt-2 font-display text-[19px] font-semibold text-chalk">
                  {fixture.home} <span className="text-chalk-faint">—</span> {fixture.away}
                </h2>
                <p className="mt-1 text-xs text-chalk-faint">
                  {fixture.venue}, {fixture.city} · {fmt.longDate(fixture.date)} · {fixture.kickoff}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge tone={openCount === 0 ? "pitch" : "amber"}>
                  {openCount === 0 ? t("arae.crewComplete") : t("arae.crewIncomplete", { n: openCount })}
                </Badge>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={openCount > 0}
                  onClick={() => confirmAll(fixture.id)}
                >
                  <Check size={13} />
                  {t("arae.confirmCrew")}
                </Button>
              </div>
            </div>

            <div className="mt-4">
              <p className="mb-2 text-xs font-medium text-chalk-faint">{t("arae.buildCrew")}</p>
              <CrewStrip
                crew={crew}
                size="md"
                activeRole={activeRole ?? undefined}
                onSlotClick={(slot) => setRole(slot.role)}
              />
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-4 2xl:grid-cols-3">
            <Card className="2xl:col-span-2">
              <CardHeader
                title={`${t("arae.candidates")} — ${activeRole ? t(roleKey[activeRole]) : ""}`}
                subtitle={t("arae.candidatesSub")}
                action={
                  <span className="inline-flex items-center gap-1.5 text-xs text-chalk-faint">
                    <Sparkles size={12} className="text-var" />
                    {t("arae.evaluated", { n: candidates.length, ms: "0.4s" })}
                  </span>
                }
              />
              {eligible.length === 0 ? (
                <EmptyState title={t("calendar.ineligible")} hint={t("calendar.noFixturesHint")} />
              ) : (
                <ul className="space-y-2">
                  {candidates.map((candidate, i) => (
                    <CandidateRow
                      key={candidate.id}
                      candidate={candidate}
                      recommended={i === 0 && candidate.blockers.length === 0}
                      selected={crew.find((s) => s.role === activeRole)?.officialId === candidate.id}
                      onAssign={() => {
                        if (!activeRole) return;
                        assign(fixture.id, activeRole, candidate.id, "you");
                      }}
                    />
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <CardHeader icon={Sparkles} tint="pitch" title={t("arae.why")} subtitle={t("arae.whySub")} />
              {top ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2.5">
                    <Avatar initials={top.initials} size={34} />
                    <div className="min-w-0">
                      <p className="truncate text-sm text-chalk">{top.name}</p>
                      <p className="text-[11px] text-chalk-faint">{countryFlag(top.countryCode)}</p>
                    </div>
                    <span className="board ml-auto text-[18px] font-semibold text-chalk">{top.score.toFixed(0)}</span>
                  </div>

                  <Factor
                    icon={<Users size={12} />}
                    label={t("arae.factorRmcs")}
                    value={top.rating.toFixed(0)}
                    pct={top.rating}
                    tone="chalk"
                  />
                  <Factor
                    icon={<BedDouble size={12} />}
                    label={t("arae.factorRest")}
                    value={`${top.rest} ${t("common.days")}`}
                    pct={Math.min(100, top.rest * 10)}
                    tone={top.rest >= 5 ? "pitch" : "amber"}
                  />
                  <Factor
                    icon={<Plane size={12} />}
                    label={t("arae.factorTravel")}
                    value={`${top.travelHours}${t("common.hours")}`}
                    pct={Math.max(0, 100 - top.travelHours * 10)}
                    tone={top.travelHours <= 3 ? "pitch" : "amber"}
                  />
                  <Factor
                    icon={<Shield size={12} />}
                    label={t("arae.factorH2h")}
                    value={`${top.h2h} · ${t(
                      top.frictionRisk === "high" ? "arae.riskHigh" : top.frictionRisk === "medium" ? "arae.riskMedium" : "arae.riskLow",
                    )}`}
                    pct={Math.max(0, 100 - top.h2h * 14)}
                    tone={top.frictionRisk === "low" ? "pitch" : top.frictionRisk === "medium" ? "amber" : "red"}
                  />
                  <Factor
                    icon={<TrendingUp size={12} />}
                    label={t("arae.factorNeutral")}
                    value={locale === "fr" ? "Validé" : "Passed"}
                    pct={100}
                    tone="pitch"
                  />
                </div>
              ) : (
                <EmptyState title={t("calendar.ineligible")} />
              )}
            </Card>
          </div>

          <Card>
            <CardHeader icon={History} tint="gold" title={t("arae.trace")} subtitle={t("arae.traceSub")} />
            <ol className="space-y-2">
              <TraceLine
                at="—"
                text={`${t("arae.evaluated", { n: candidates.length, ms: "0.4s" })} · ${
                  activeRole ? t(roleKey[activeRole]) : ""
                }`}
              />
              {top && (
                <TraceLine
                  at="—"
                  tone="var"
                  text={`${t("arae.recommended")}: ${top.name} — ${t("arae.rmcs")} ${top.rating.toFixed(
                    0,
                  )}, ${t("arae.rest")} ${top.rest}${t("common.days").slice(0, 1)}, ${t("arae.travel")} ${
                    top.travelHours
                  }${t("common.hours")}`}
                />
              )}
              {fixtureTrace.map((entry) => {
                const official = entry.officialId ? officialById(entry.officialId) : null;
                return (
                  <TraceLine
                    key={entry.id}
                    at={entry.at}
                    tone={entry.actor === "engine" ? "var" : "chalk"}
                    text={
                      official
                        ? `${entry.actor === "engine" ? t("arae.recommended") : t("common.assigned")}: ${t(
                            roleKey[entry.role],
                          )} — ${official.name}`
                        : `${t("calendar.clearSlot")}: ${t(roleKey[entry.role])}`
                    }
                  />
                );
              })}
              {openCount === 0 && <TraceLine at="—" tone="pitch" text={t("arae.crewConfirmed")} />}
            </ol>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Board tone="var" icon={ListChecks} label={t("arae.queue")} value={queue.length} />
        <Board
          icon={UserPlus}
          label={t("calendar.slotsOpen")}
          value={openCount}
          tone={openCount ? "amber" : "pitch"}
        />
        <Board tone="pitch" icon={Users} label={t("arae.candidates")} value={eligible.length} />
        <Board
          icon={Flame}
          label={t("calendar.importance")}
          value={fixture.importance}
          tone={fixture.importance > 88 ? "red" : "gold"}
        />
      </div>
    </div>
  );
}

function CandidateRow({
  candidate,
  recommended,
  selected,
  onAssign,
}: {
  candidate: Candidate;
  recommended: boolean;
  selected: boolean;
  onAssign: () => void;
}) {
  const t = useT();
  const blocked = candidate.blockers.length > 0;

  return (
    <li
      className={cn(
        "flex flex-col gap-3 rounded-[10px] border px-3 py-2.5 sm:flex-row sm:items-center",
        blocked ? "border-line opacity-50" : "border-line bg-ink-1 lift",
        recommended && "border-line-strong bg-wash/[0.04]",
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <Avatar initials={candidate.initials} size={32} />
        <div className="min-w-0">
          <p className="truncate text-sm text-chalk">
            {countryFlag(candidate.countryCode)} {candidate.name}
          </p>
          <p className="text-[11px] text-chalk-faint">
            {recommended && !blocked ? (
              <span className="inline-flex items-center gap-1 text-var">
                <Sparkles size={10} />
                {t("arae.recommended")}
              </span>
            ) : blocked ? (
              t("calendar.ineligible")
            ) : candidate.cover ? (
              <span className="text-var">{t("calendar.coverNote")}</span>
            ) : (
              `${t("arae.rmcs")} ${candidate.rating.toFixed(0)}`
            )}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:w-[240px]">
        <Cell label={t("arae.travel")} value={`${candidate.travelHours}${t("common.hours")}`} />
        <Cell label={t("arae.rest")} value={`${candidate.rest}${t("common.days").slice(0, 1)}`} />
        <Cell label={t("arae.friction")} value={t(
          candidate.frictionRisk === "high" ? "arae.riskHigh" : candidate.frictionRisk === "medium" ? "arae.riskMedium" : "arae.riskLow",
        )} />
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:w-[110px] sm:justify-end">
        <span className="board text-base font-semibold text-chalk">{blocked ? "—" : candidate.score.toFixed(0)}</span>
        {selected ? (
          <Badge tone="pitch">
            <Check size={11} />
            {t("common.assigned")}
          </Badge>
        ) : (
          <Button size="sm" variant={recommended ? "primary" : "secondary"} disabled={blocked} onClick={onAssign}>
            {t("common.assign")}
          </Button>
        )}
      </div>
    </li>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-ink-2 px-2 py-1">
      <p className="truncate text-xs font-medium text-chalk-faint">{label}</p>
      <p className="board text-xs text-chalk">{value}</p>
    </div>
  );
}

function Factor({
  icon,
  label,
  value,
  pct,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  pct: number;
  tone: "chalk" | "pitch" | "amber" | "red";
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
        <span className="flex min-w-0 items-center gap-1.5 text-chalk-faint">
          <span className="text-chalk-faint">{icon}</span>
          <span className="truncate">{label}</span>
        </span>
        <span className="board shrink-0 text-chalk">{value}</span>
      </div>
      <Meter value={pct} tone={tone} />
    </div>
  );
}

function TraceLine({ at, text, tone = "chalk" }: { at: string; text: string; tone?: "chalk" | "var" | "pitch" }) {
  return (
    <li className="flex gap-3 text-xs">
      <span className="board w-16 shrink-0 text-chalk-faint">{at}</span>
      <span
        className={cn(
          tone === "var" ? "text-var" : tone === "pitch" ? "text-pitch" : "text-chalk-dim",
        )}
      >
        {text}
      </span>
    </li>
  );
}
