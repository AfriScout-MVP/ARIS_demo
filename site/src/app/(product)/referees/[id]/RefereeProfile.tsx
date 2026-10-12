"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowLeft, CalendarDays, HeartPulse, IdCard, MapPin, Radar, Radio, Scale, Target, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFormatters, useLocale, useT } from "@/lib/i18n/LocaleProvider";
import { Avatar, Badge, Board, Card, CardHeader, EmptyState, Meter, ScoreRing } from "@/components/ui";
import { SubIndexRadar } from "@/components/charts/SubIndexRadar";
import {
  DEMO_TODAY,
  assessments,
  availabilityFor,
  competitionById,
  countryFlag,
  countryName,
  courses,
  daysBetween,
  fitnessByReferee,
  fixtures,
  getSubIndices,
  licenceStatus,
  licences,
  matchById,
  progressionFor,
  refereeById,
  roleKey,
  weekStarts,
  type AvailabilityState,
} from "@/lib/mock-data";

const availabilityTone: Record<AvailabilityState, string> = {
  available: "bg-pitch/20",
  assigned: "bg-pitch",
  resting: "bg-wash/[0.08]",
  travelling: "bg-var/25",
  unavailable: "bg-card-red/25",
};

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function RefereeProfile({ id }: { id: string }) {
  const t = useT();
  const { locale } = useLocale();
  const fmt = useFormatters();
  const referee = refereeById.get(id);

  const data = useMemo(() => {
    if (!referee) return null;
    const sub = getSubIndices(referee);
    const appointments = fixtures
      .filter((f) => f.crew.some((s) => s.officialId === referee.id))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 6);
    const reports = assessments.filter((a) => a.refereeId === referee.id && a.state === "filed");
    const refLicences = licences.filter((l) => l.refereeId === referee.id);
    const fitness = fitnessByReferee.get(referee.id)!;
    const enrolled = courses.filter((c) => c.refereeIds.includes(referee.id));
    const progression = progressionFor(referee);
    const days = Array.from({ length: 14 }, (_, i) => addDays(weekStarts[1], i));
    return { sub, appointments, reports, refLicences, fitness, enrolled, progression, days };
  }, [referee]);

  if (!referee || !data) {
    return (
      <Card>
        <EmptyState title={t("referees.notFound")} />
      </Card>
    );
  }

  const radar = [
    { metric: t("referees.ras"), value: data.sub.ras },
    { metric: t("referees.cei"), value: data.sub.cei },
    { metric: t("referees.mds"), value: data.sub.mds },
    { metric: t("referees.prs"), value: data.sub.prs },
    { metric: t("referees.ci"), value: data.sub.ci },
  ];

  const up = referee.trend >= 0;

  return (
    <div className="space-y-4 sm:space-y-5">
      <Link
        href="/referees"
        className="inline-flex items-center gap-1.5 text-xs text-chalk-faint hover:text-chalk max-sm:-my-3 max-sm:py-3"
      >
        <ArrowLeft size={14} />
        {t("referees.backToDirectory")}
      </Link>

      <Card>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <Avatar initials={referee.initials} size={64} tone="chalk" className="rounded-2xl" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-[22px] font-semibold text-chalk">{referee.name}</h1>
              <Badge tone="neutral">{referee.level}</Badge>
              {referee.status === "suspended" && <Badge tone="red">{t("common.suspended")}</Badge>}
              {referee.varQualified && <Badge tone="var">VAR</Badge>}
            </div>
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-chalk-faint">
              <MapPin size={12} />
              {countryFlag(referee.countryCode)} {countryName(referee.countryCode, locale)} · {referee.city} ·{" "}
              {referee.age} {locale === "fr" ? "ans" : "yrs"} · {referee.yearsActive}{" "}
              {t("referees.yearsActive").toLowerCase()}
            </p>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-chalk-dim">{referee.bio[locale]}</p>
          </div>
          <div className="flex shrink-0 flex-col items-center gap-1.5">
            <ScoreRing value={referee.arps} size={82} label="ARPS" />
            <span className={cn("flex items-center gap-1 text-xs", up ? "text-pitch" : "text-card-red")}>
              {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {up ? "+" : "−"}
              {Math.abs(referee.trend).toFixed(1)} {t("common.points")}
            </span>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Board
          tone="gold"
          icon={CalendarDays}
          label={t("referees.matchesOfficiated")}
          value={referee.matches}
        />
        <Board icon={Target} label={t("arae.rmcs")} value={referee.rmcsAvg.toFixed(1)} />
        <Board
          tone="var"
          icon={Radio}
          label={t("referees.varAccuracy")}
          value={`${referee.varAccuracy}%`}
        />
        <Board
          icon={HeartPulse}
          label={t("arae.fitness")}
          value={referee.fitness}
          tone={referee.fitness >= 82 ? "pitch" : "amber"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader icon={Radar} tint="var" title={t("referees.subIndices")} subtitle={t("referees.subIndicesSub")} />
          <SubIndexRadar data={radar} />
          <div className="mt-2 grid grid-cols-5 gap-1 text-center">
            {radar.map((d) => (
              <div key={d.metric}>
                <p className="board text-xs text-chalk">{d.value}</p>
                <p className="truncate text-[10px] uppercase text-chalk-faint">{d.metric}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader icon={Scale} tint="gold" title={t("referees.discipline")} subtitle={t("referees.disciplineSub")} />
          <ul className="space-y-2">
            <li className="flex items-center justify-between rounded-xl border border-amber/25 bg-amber/[0.07] px-3 py-2.5">
              <span className="text-sm text-chalk-dim">{t("referees.yellowCards")}</span>
              <span className="board text-base text-amber">{referee.cards.yellow}</span>
            </li>
            <li className="flex items-center justify-between rounded-xl border border-card-red/25 bg-card-red/[0.07] px-3 py-2.5">
              <span className="text-sm text-chalk-dim">{t("referees.redCards")}</span>
              <span className="board text-base text-card-red">{referee.cards.red}</span>
            </li>
            <li className="flex items-center justify-between rounded-xl border border-line bg-ink-1 px-3 py-2.5">
              <span className="text-sm text-chalk-dim">
                {locale === "fr" ? "Cartons par rencontre" : "Cards per match"}
              </span>
              <span className="board text-base text-chalk">
                {((referee.cards.yellow + referee.cards.red) / referee.matches).toFixed(2)}
              </span>
            </li>
          </ul>

          <div className="mt-4">
            <p className="mb-2 text-[11px] uppercase tracking-[0.1em] text-chalk-faint">
              {t("referees.availabilityNext")}
            </p>
            <div className="flex gap-1">
              {data.days.map((day) => {
                const state = availabilityFor(referee.id, day);
                return (
                  <span
                    key={day}
                    title={`${day} — ${state}`}
                    className={cn("h-6 flex-1 rounded-[3px]", availabilityTone[state])}
                  />
                );
              })}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader icon={TrendingUp} tint="pitch" title={t("development.progression")} subtitle={t("development.progressionSub")} />
          {data.progression.nextLevel ? (
            <Badge tone="neutral" className="mb-3">
              {referee.level} → {data.progression.nextLevel}
            </Badge>
          ) : (
            <Badge tone="pitch" className="mb-3">
              {referee.level}
            </Badge>
          )}
          <ul className="space-y-2">
            {data.progression.requirements.map((req) => (
              <li key={req.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full",
                      req.met ? "bg-pitch" : "bg-card-red",
                    )}
                  />
                  <span className="truncate text-chalk-dim">{req.label[locale]}</span>
                </span>
                <span className="board shrink-0 text-chalk">{req.value}</span>
              </li>
            ))}
          </ul>
          <Meter
            className="mt-3"
            value={(data.progression.requirements.filter((r) => r.met).length / data.progression.requirements.length) * 100}
            tone="pitch"
          />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader icon={CalendarDays} tint="pitch" title={t("referees.recentMatches")} subtitle={t("referees.recentMatchesSub")} />
          {data.appointments.length === 0 ? (
            <EmptyState title={t("referees.noneScheduled")} />
          ) : (
            <ul className="space-y-2">
              {data.appointments.map((fixture) => {
                const slot = fixture.crew.find((s) => s.officialId === referee.id)!;
                const match = [...matchById.values()].find(
                  (m) => m.home === fixture.home && m.away === fixture.away,
                );
                return (
                  <li
                    key={fixture.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-line bg-ink-1 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm text-chalk">
                        {fixture.home} — {fixture.away}
                      </p>
                      <p className="truncate text-[11px] text-chalk-faint">
                        {competitionById.get(fixture.competitionId)?.name} · {fmt.date(fixture.date)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge tone="neutral">{t(roleKey[slot.role])}</Badge>
                      {match && <Badge tone="pitch">{match.arpsForMatch}</Badge>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader icon={IdCard} tint="var" title={t("referees.passport")} subtitle={t("referees.passportSub")} />
          <ol className="relative space-y-4 border-l border-line pl-4">
            {data.refLicences
              .slice()
              .sort((a, b) => b.issued.localeCompare(a.issued))
              .map((licence) => {
                const status = licenceStatus(licence);
                return (
                  <li key={licence.id} className="relative">
                    <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-pitch" />
                    <p className="text-xs font-medium text-chalk">{licence.kind}</p>
                    <p className="text-xs text-chalk-faint">
                      {t("development.issued")} {fmt.date(licence.issued)} · {t("development.expires")}{" "}
                      {fmt.date(licence.expires)}
                    </p>
                    <Badge
                      className="mt-1"
                      tone={status.state === "valid" ? "pitch" : status.state === "expiring" ? "amber" : "red"}
                    >
                      {status.state === "valid"
                        ? t("development.valid")
                        : status.state === "expiring"
                          ? t("development.expiresIn", { n: status.days })
                          : t("development.expired")}
                    </Badge>
                  </li>
                );
              })}

            <li className="relative">
              <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-pitch" />
              <p className="text-xs font-medium text-chalk">{t("development.fitnessTitle")}</p>
              <p className="text-xs text-chalk-faint">
                {fmt.date(data.fitness.date)} · {t("development.test1")}{" "}
                {data.fitness.test1.bestSprint}s · {t("development.test2")} {data.fitness.test2.laps}
              </p>
              <Badge
                className="mt-1"
                tone={
                  data.fitness.test1.result === "passed" && data.fitness.test2.result === "passed" ? "pitch" : "red"
                }
              >
                {data.fitness.test1.result === "passed" && data.fitness.test2.result === "passed"
                  ? t("development.passed")
                  : t("development.failed")}
              </Badge>
            </li>

            {data.reports.map((report) => {
              const match = matchById.get(report.matchId);
              return (
                <li key={report.id} className="relative">
                  <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-pitch" />
                  <p className="text-xs font-medium text-chalk">
                    {t("assessments.observer")} — {report.overall.toFixed(1)}
                  </p>
                  <p className="text-xs text-chalk-faint">
                    {match ? `${match.home} — ${match.away}` : ""} · {refereeById.get(report.observerId)?.name}
                  </p>
                </li>
              );
            })}

            {data.enrolled.map((course) => (
              <li key={course.id} className="relative">
                <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-pitch" />
                <p className="text-xs font-medium text-chalk">{course.name[locale]}</p>
                <p className="text-xs text-chalk-faint">
                  {course.provider} · {course.hours}
                  {t("common.hours")} ·{" "}
                  {t(
                    course.state === "completed"
                      ? "development.completed"
                      : course.state === "enrolled"
                        ? "development.enrolled"
                        : "development.notStarted",
                  )}
                </p>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <p className="text-xs text-chalk-faint">
        {locale === "fr" ? "Passeport arrêté au" : "Passport as of"} {fmt.longDate(DEMO_TODAY)} ·{" "}
        {daysBetween(DEMO_TODAY, data.days[13])} {t("common.days")}
      </p>
    </div>
  );
}
