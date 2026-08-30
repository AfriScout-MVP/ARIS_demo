"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { ArrowUpRight, CalendarDays, ClipboardList, RefreshCcw, ShieldAlert, Timer } from "lucide-react";
import { useLocale, useT } from "@/lib/i18n/LocaleProvider";
import { useFormatters } from "@/lib/i18n/LocaleProvider";
import { useScope } from "@/lib/scope/ScopeProvider";
import { PageHeading } from "@/components/layout/PageHeading";
import { Badge, Board, Card, CardHeader, Dot, EmptyState, Meter, ScoreRing } from "@/components/ui";
import { CrewStrip } from "@/components/officiating/CrewStrip";
import { axisProps, chartColors, decisionColors, tooltipStyle } from "@/components/charts/theme";
import {
  DEMO_TODAY,
  arpsTrend,
  assessments,
  competitionById,
  countries,
  countryFlag,
  crewIsComplete,
  daysBetween,
  decisionsBreakdown,
  fixtures,
  licenceStatus,
  licences,
  matchById,
  openSlots,
  referees,
  weekStarts,
  workloadFor,
  WORKLOAD_HEAVY,
  zoneDistribution,
} from "@/lib/mock-data";

const decisionLabels: Record<string, { en: string; fr: string }> = {
  correct: { en: "Correct on the field", fr: "Correcte sur le terrain" },
  "correct-var": { en: "Correct after VAR", fr: "Correcte après VAR" },
  overturned: { en: "Overturned", fr: "Annulée" },
  missed: { en: "Missed", fr: "Non vue" },
};

export default function OverviewPage() {
  const t = useT();
  const { locale } = useLocale();
  const fmt = useFormatters();
  const { matches: inScope, codes } = useScope();

  const data = useMemo(() => {
    const scoped = fixtures.filter((f) => inScope(f.countryCode));
    const thisWeek = scoped.filter(
      (f) => f.date >= weekStarts[1] && f.date <= weekStarts[2] && !f.played,
    );
    const complete = thisWeek.filter(crewIsComplete).length;
    const corps = referees.filter((r) => codes.includes(r.countryCode));

    const needsCrew = thisWeek
      .filter((f) => openSlots(f) > 0)
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 5);

    const overdueReports = assessments.filter((a) => {
      const match = matchById.get(a.matchId);
      return a.state !== "filed" && match && inScope(match.countryCode);
    });

    const expiring = licences.filter((l) => {
      const referee = referees.find((r) => r.id === l.refereeId);
      if (!referee || !codes.includes(referee.countryCode)) return false;
      const status = licenceStatus(l);
      return status.state === "expired" || (status.state === "expiring" && status.days <= 45);
    });

    const staleFeeds = countries.filter((c) => codes.includes(c.code) && c.syncHealth !== "healthy");
    const suspended = corps.filter((r) => r.status === "suspended");

    const workload = workloadFor(codes);
    const heavy = workload.filter((w) => w.appointments >= WORKLOAD_HEAVY).slice(0, 5);
    const idle = workload.filter((w) => w.appointments === 0).slice(0, 5);
    const busiest = workload[0]?.appointments ?? 0;

    return {
      thisWeek,
      complete,
      corps,
      needsCrew,
      overdueReports,
      expiring,
      staleFeeds,
      suspended,
      avgArps: corps.length
        ? Math.round((corps.reduce((s, r) => s + r.arps, 0) / corps.length) * 10) / 10
        : 0,
      openSlotTotal: thisWeek.reduce((s, f) => s + openSlots(f), 0),
      top: corps.slice().sort((a, b) => b.arps - a.arps).slice(0, 5),
      heavy,
      idle,
      busiest,
    };
  }, [inScope, codes]);

  const coveragePct = data.thisWeek.length
    ? Math.round((data.complete / data.thisWeek.length) * 100)
    : 100;

  const alerts = [
    data.openSlotTotal > 0 && {
      id: "slots",
      tone: "red" as const,
      icon: Timer,
      href: "/calendar",
      label: locale === "fr" ? "Postes vides cette semaine" : "Empty slots this week",
      value: data.openSlotTotal,
    },
    data.overdueReports.length > 0 && {
      id: "reports",
      tone: "amber" as const,
      icon: ClipboardList,
      href: "/assessments",
      label: locale === "fr" ? "Rapports d'observateur en attente" : "Observer reports outstanding",
      value: data.overdueReports.length,
    },
    data.expiring.length > 0 && {
      id: "licences",
      tone: "amber" as const,
      icon: ShieldAlert,
      href: "/development",
      label: locale === "fr" ? "Licences à renouveler" : "Licences to renew",
      value: data.expiring.length,
    },
    data.staleFeeds.length > 0 && {
      id: "sync",
      tone: "var" as const,
      icon: RefreshCcw,
      href: "/federations",
      label: locale === "fr" ? "Calendriers non synchronisés" : "Calendar feeds out of date",
      value: data.staleFeeds.length,
    },
    data.suspended.length > 0 && {
      id: "suspended",
      tone: "red" as const,
      icon: ShieldAlert,
      href: "/referees",
      label: locale === "fr" ? "Officiels suspendus" : "Officials suspended",
      value: data.suspended.length,
    },
  ].filter(Boolean) as Array<{
    id: string;
    tone: "red" | "amber" | "var";
    icon: typeof Timer;
    href: string;
    label: string;
    value: number;
  }>;

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeading titleKey="nav.overview" subtitleKey="subtitles.overview" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Board
          primary
          label={t("overview.kpiCoverage")}
          value={`${data.complete}/${data.thisWeek.length}`}
          hint={`${coveragePct}% ${t("overview.coverageNote")}`}
          tone={coveragePct >= 80 ? "pitch" : coveragePct >= 55 ? "amber" : "red"}
        />
        <Board
          label={t("overview.kpiUnassigned")}
          value={data.openSlotTotal}
          tone={data.openSlotTotal > 0 ? "amber" : "pitch"}
          hint={t("calendar.slotsOpen")}
        />
        <Board label={t("overview.kpiReferees")} value={data.corps.length} hint={`${codes.length} ${t("common.countries").toLowerCase()}`} />
        <Board label={t("overview.kpiArps")} value={data.avgArps.toFixed(1)} delta={1.8} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title={t("overview.weekBoard")}
            subtitle={t("overview.weekBoardSub")}
            action={
              <Link
                href="/calendar"
                className="inline-flex items-center gap-1 text-[12px] text-chalk-dim hover:text-chalk"
              >
                {t("overview.openCalendar")}
                <ArrowUpRight size={12} />
              </Link>
            }
          />
          {data.needsCrew.length === 0 ? (
            <EmptyState title={t("calendar.noGaps")} hint={t("calendar.noGapsHint")} />
          ) : (
            <ul className="space-y-2">
              {data.needsCrew.map((fixture) => {
                const comp = competitionById.get(fixture.competitionId);
                const days = daysBetween(DEMO_TODAY, fixture.date);
                return (
                  <li key={fixture.id}>
                    <Link
                      href="/calendar"
                      className="flex flex-col gap-2.5 rounded-lg border border-line bg-ink-1 p-3 lift sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] font-medium text-chalk">
                          {fixture.home} <span className="text-chalk-faint">—</span> {fixture.away}
                        </p>
                        <p className="mt-0.5 truncate text-[11.5px] text-chalk-faint">
                          {countryFlag(fixture.countryCode)} {comp?.name} · {fmt.longDate(fixture.date)} · {fixture.kickoff}
                        </p>
                      </div>
                      <div className="flex min-w-0 items-center gap-3">
                        <CrewStrip crew={fixture.crew} />
                        <Badge tone={days <= 3 ? "red" : "amber"} className="shrink-0">
                          {days}
                          {locale === "fr" ? "j" : "d"}
                        </Badge>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title={t("overview.attention")} subtitle={t("overview.attentionSub")} />
          {alerts.length === 0 ? (
            <EmptyState title={t("overview.noAttention")} hint={t("overview.noAttentionHint")} />
          ) : (
            <ul className="space-y-1.5">
              {alerts.map((alert) => (
                <li key={alert.id}>
                  <Link
                    href={alert.href}
                    className="flex items-center gap-2.5 rounded-lg border border-line bg-ink-1 px-3 py-2.5 lift"
                  >
                    <alert.icon
                      size={15}
                      className={
                        alert.tone === "red" ? "text-card-red" : alert.tone === "amber" ? "text-amber" : "text-var"
                      }
                    />
                    <span className="min-w-0 flex-1 text-[12.5px] text-chalk-dim">{alert.label}</span>
                    <span className="board text-[15px] font-semibold text-chalk">{alert.value}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title={t("overview.workload")} subtitle={t("overview.workloadSub")} />
        {data.heavy.length === 0 && data.idle.length === 0 ? (
          <EmptyState title={t("overview.workloadEven")} />
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.1em] text-chalk-faint">
                <Dot tone="amber" />
                {t("overview.workloadHeavy")}
              </p>
              {data.heavy.length === 0 ? (
                <p className="text-[12.5px] text-chalk-faint">{t("overview.workloadEven")}</p>
              ) : (
                <ul className="space-y-1.5">
                  {data.heavy.map((row) => (
                    <li key={row.officialId} className="rounded-lg border border-line bg-ink-1 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-[12.5px] text-chalk">
                          {countryFlag(row.countryCode)} {row.name}
                        </span>
                        <span className="board shrink-0 text-[13px] text-amber">{row.appointments}</span>
                      </div>
                      <Meter
                        className="mt-1.5"
                        value={(row.appointments / Math.max(1, data.busiest)) * 100}
                        tone="amber"
                      />
                      <p className="mt-1 text-[10.5px] text-chalk-faint">
                        {row.asReferee} {t("roles.R").toLowerCase()} ·{" "}
                        {row.nextInDays === null
                          ? t("overview.noNext")
                          : t("overview.nextIn", { n: row.nextInDays })}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <p className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.1em] text-chalk-faint">
                <Dot tone="red" />
                {t("overview.workloadIdle")}
              </p>
              {data.idle.length === 0 ? (
                <p className="text-[12.5px] text-chalk-faint">{t("overview.workloadEven")}</p>
              ) : (
                <ul className="space-y-1.5">
                  {data.idle.map((row) => (
                    <li
                      key={row.officialId}
                      className="flex items-center justify-between gap-2 rounded-lg border border-line bg-ink-1 px-3 py-2.5"
                    >
                      <span className="min-w-0 truncate text-[12.5px] text-chalk">
                        {countryFlag(row.countryCode)} {row.name}
                      </span>
                      <span className="shrink-0 text-[11px] text-chalk-faint">
                        0 {t("overview.appointments")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={t("overview.arpsTrend")} subtitle={t("overview.arpsTrendSub")} />
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={arpsTrend} margin={{ top: 4, right: 6, bottom: 0, left: -22 }}>
                <defs>
                  <linearGradient id="arps" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chartColors.pitch} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={chartColors.pitch} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={chartColors.grid} vertical={false} />
                <XAxis dataKey="month" {...axisProps} />
                <YAxis domain={[76, 88]} {...axisProps} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: chartColors.grid }} />
                <Area
                  type="monotone"
                  dataKey="score"
                  name="ARPS"
                  stroke={chartColors.pitch}
                  strokeWidth={2}
                  fill="url(#arps)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title={t("overview.decisions")} subtitle={t("overview.decisionsSub")} />
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={decisionsBreakdown} dataKey="value" nameKey="id" innerRadius={40} outerRadius={62} paddingAngle={2}>
                  {decisionsBreakdown.map((d) => (
                    <Cell key={d.id} fill={decisionColors[d.id]} stroke="none" />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-3 space-y-1.5">
            {decisionsBreakdown.map((d) => (
              <li key={d.id} className="flex items-center justify-between text-[12px]">
                <span className="flex items-center gap-2 text-chalk-faint">
                  <span className="h-2 w-2 rounded-[2px]" style={{ background: decisionColors[d.id] }} />
                  {decisionLabels[d.id][locale]}
                </span>
                <span className="tnum text-chalk">{d.value}%</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={t("overview.zoneSpread")} subtitle={t("overview.zoneSpreadSub")} />
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={zoneDistribution} margin={{ top: 4, right: 6, bottom: 0, left: -22 }}>
                <CartesianGrid stroke={chartColors.grid} vertical={false} />
                <XAxis dataKey="zone" {...axisProps} interval={0} angle={-12} textAnchor="end" height={44} />
                <YAxis {...axisProps} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                <Bar dataKey="avgArps" name={t("federations.avgArps")} fill={chartColors.chalkDim} radius={[3, 3, 0, 0]} />
                <Bar dataKey="referees" name={t("common.referees")} fill={chartColors.pitch} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader
            title={t("overview.topReferees")}
            subtitle={t("overview.topRefereesSub")}
            action={
              <Link href="/rankings" className="inline-flex items-center gap-1 text-[12px] text-chalk-dim hover:text-chalk">
                {t("overview.fullRanking")}
                <ArrowUpRight size={12} />
              </Link>
            }
          />
          {data.top.length === 0 ? (
            <EmptyState title={t("common.empty")} />
          ) : (
            <ul className="space-y-1.5">
              {data.top.map((referee, i) => (
                <li key={referee.id}>
                  <Link
                    href={`/referees/${referee.id}`}
                    className="flex items-center gap-3 rounded-lg border border-line bg-ink-1 px-3 py-2 lift"
                  >
                    <span className="board w-4 text-[12px] text-chalk-faint">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-chalk">{referee.name}</span>
                      <span className="block text-[11px] text-chalk-faint">
                        {countryFlag(referee.countryCode)} {referee.level}
                      </span>
                    </span>
                    <ScoreRing value={referee.arps} size={34} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3">
            <div className="mb-1.5 flex items-center justify-between text-[11px] text-chalk-faint">
              <span className="inline-flex items-center gap-1.5">
                <Dot tone="pitch" />
                {t("overview.coverageNote")}
              </span>
              <span className="tnum text-chalk">{coveragePct}%</span>
            </div>
            <Meter value={coveragePct} tone={coveragePct >= 80 ? "pitch" : "amber"} />
          </div>
        </Card>
      </div>

      <p className="flex items-center gap-2 pt-1 text-[11.5px] text-chalk-faint">
        <CalendarDays size={13} />
        {locale === "fr"
          ? `Semaine de démonstration — ${fmt.longDate(weekStarts[1])} au ${fmt.longDate(weekStarts[2])}`
          : `Demo week — ${fmt.longDate(weekStarts[1])} to ${fmt.longDate(weekStarts[2])}`}
      </p>
    </div>
  );
}
