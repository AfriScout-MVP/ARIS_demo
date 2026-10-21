"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlarmClock, ArrowUpRight, BarChart3, ClipboardCheck, ClipboardList, Clock, Film, Gauge, Quote, Star } from "@/components/icons/glyphs";
import { cn } from "@/lib/utils";
import { useFormatters, useLocale, useT } from "@/lib/i18n/LocaleProvider";
import { useScope } from "@/lib/scope/ScopeProvider";
import { PageHeading } from "@/components/layout/PageHeading";
import { Badge, Board, Card, CardHeader, EmptyState, Meter, Segmented } from "@/components/ui";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { pickLocalized } from "@/lib/i18n/localized";
import { assessments, competitionById, matchById, refereeById, refereeHref, type Assessment } from "@/lib/store";

const markKeys = [
  ["positioning", "assessments.kpiPositioning"],
  ["decisions", "assessments.kpiDecisions"],
  ["gameManagement", "assessments.kpiGameManagement"],
  ["teamwork", "assessments.kpiTeamwork"],
  ["discipline", "assessments.kpiDiscipline"],
  ["fitness", "assessments.kpiFitness"],
] as const;

const stateTone: Record<Assessment["state"], "pitch" | "amber" | "red"> = {
  filed: "pitch",
  draft: "amber",
  overdue: "red",
};

const stateKey: Record<Assessment["state"], "assessments.filed" | "assessments.draft" | "assessments.overdue"> = {
  filed: "assessments.filed",
  draft: "assessments.draft",
  overdue: "assessments.overdue",
};

export default function AssessmentsPage() {
  const t = useT();
  const fmt = useFormatters();
  const { matches: inScope } = useScope();
  const [filter, setFilter] = useState<"all" | "overdue">("all");

  const scoped = useMemo(
    () =>
      assessments.filter((a) => {
        const match = matchById.get(a.matchId);
        return match && refereeById.has(a.refereeId) && inScope(match.countryCode);
      }),
    [inScope],
  );

  const list = filter === "all" ? scoped : scoped.filter((a) => a.state !== "filed");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = list.find((a) => a.id === selectedId) ?? list[0];

  const filed = scoped.filter((a) => a.state === "filed");
  const avg = filed.length ? filed.reduce((s, a) => s + a.overall, 0) / filed.length : 0;
  const onTime = filed.filter((a) => (a.filedHoursAfter ?? 99) <= 48).length;

  // Where the corps is collectively strong and weak — the single most useful
  // read a development officer gets out of a season of reports.
  const criterionAverages = useMemo(() => {
    if (filed.length === 0) return [];
    return markKeys
      .map(([key, labelKey]) => ({
        key,
        labelKey,
        value: filed.reduce((sum, a) => sum + a.marks[key], 0) / filed.length,
      }))
      .sort((a, b) => b.value - a.value);
  }, [filed]);

  const weakest = criterionAverages[criterionAverages.length - 1];
  const spread = filed.slice().sort((a, b) => b.overall - a.overall);

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeading titleKey="assessments.title" subtitleKey="subtitles.assessments" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Board
          primary
          tone="gold"
          icon={Star}
          label={t("assessments.averageMark")}
          value={avg ? avg.toFixed(1) : "—"}
          unit="/ 10"
        />
        <Board
          tone="pitch"
          icon={ClipboardCheck}
          label={t("assessments.reportsFiled")}
          value={`${filed.length}/${scoped.length}`}
        />
        <Board
          icon={AlarmClock}
          label={t("assessments.overdue")}
          value={scoped.filter((a) => a.state === "overdue").length}
          tone={scoped.some((a) => a.state === "overdue") ? "red" : "pitch"}
        />
        <Board
          tone="var"
          icon={Clock}
          label={t("assessments.onTime")}
          value={filed.length ? `${Math.round((onTime / filed.length) * 100)}%` : "—"}
        />
      </div>

      <Segmented
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: t("assessments.filterAll") },
          { value: "overdue", label: t("assessments.filterOverdue") },
        ]}
      />

      {list.length === 0 ? (
        <Card>
          <EmptyState title={t("assessments.noReport")} hint={t("assessments.noReportHint")} />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
          <Card padded={false} className="h-fit">
            <div className="px-4 py-3">
              <CardHeader icon={ClipboardList} tint="var" title={t("assessments.queue")} subtitle={t("assessments.queueSub")} className="mb-0" />
            </div>
            <div className="chalk-rule" />
            <ul>
              {list.map((report) => {
                const match = matchById.get(report.matchId)!;
                const referee = refereeById.get(report.refereeId)!;
                return (
                  <li key={report.id}>
                    <button
                      onClick={() => setSelectedId(report.id)}
                      className={cn(
                        "flex w-full flex-col gap-1 border-b border-line px-4 py-3 text-left last:border-0 transition-colors",
                        selected?.id === report.id ? "bg-wash/[0.06]" : "hover:bg-wash/[0.03]",
                      )}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs text-chalk">
                          <CountryFlag code={match.countryCode} /> {match.home} — {match.away}
                        </span>
                        <Badge tone={stateTone[report.state]}>{t(stateKey[report.state])}</Badge>
                      </span>
                      <span className="flex items-center justify-between gap-2 text-[11px] text-chalk-faint">
                        <span className="truncate">
                          {referee.name} · {fmt.date(match.date)}
                        </span>
                        {report.state === "filed" && (
                          <span className="board text-xs text-chalk">{report.overall.toFixed(1)}</span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>

          {selected && <ReportDetail report={selected} />}
        </div>
      )}

      {filed.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader
              icon={BarChart3}
              tint="pitch"
              title={t("assessments.criterionAverages")}
              subtitle={t("assessments.criterionAveragesSub")}
              action={
                weakest ? (
                  <Badge tone="amber">
                    {t("assessments.weakest")}: {t(weakest.labelKey)}
                  </Badge>
                ) : undefined
              }
            />
            <ul className="space-y-3">
              {criterionAverages.map((row) => (
                <li key={row.key}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-chalk-dim">{t(row.labelKey)}</span>
                    <span className="board text-chalk">{row.value.toFixed(1)}</span>
                  </div>
                  <Meter
                    value={row.value * 10}
                    tone={row.value >= 8.5 ? "pitch" : row.value >= 7.5 ? "chalk" : "amber"}
                  />
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader icon={Star} tint="gold" title={t("assessments.markSpread")} subtitle={t("assessments.markSpreadSub")} />
            <ul className="space-y-1.5">
              {spread.map((report) => {
                const match = matchById.get(report.matchId)!;
                const referee = refereeById.get(report.refereeId)!;
                return (
                  <li key={report.id}>
                    <Link
                      href={refereeHref(referee.id)}
                      className="flex items-center gap-3 rounded-[10px] border border-line bg-ink-1 px-3 py-2.5 lift"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs text-chalk">
                          <CountryFlag code={referee.countryCode} /> {referee.name}
                        </span>
                        <span className="block truncate text-[10.5px] text-chalk-faint">
                          {match.home} — {match.away}
                        </span>
                      </span>
                      <span className="w-24 shrink-0">
                        <Meter
                          value={report.overall * 10}
                          tone={report.overall >= 8.5 ? "pitch" : report.overall >= 7.5 ? "chalk" : "amber"}
                        />
                      </span>
                      <span className="board w-8 shrink-0 text-right text-xs text-chalk">
                        {report.overall.toFixed(1)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}

function ReportDetail({ report }: { report: Assessment }) {
  const t = useT();
  const { locale } = useLocale();
  const fmt = useFormatters();
  const match = matchById.get(report.matchId)!;
  const referee = refereeById.get(report.refereeId)!;
  const observer = refereeById.get(report.observerId);

  if (report.state === "overdue") {
    return (
      <Card>
        <CardHeader
          title={`${match.home} — ${match.away}`}
          subtitle={`${competitionById.get(match.competitionId)?.name} · ${fmt.longDate(match.date)}`}
        />
        <EmptyState
          title={t("assessments.noReport")}
          hint={t("assessments.noReportHint")}
          action={
            <Badge tone="red">
              <Clock size={11} />
              {t("assessments.overdue")}
            </Badge>
          }
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <Badge tone={stateTone[report.state]}>{t(stateKey[report.state])}</Badge>
            <h2 className="mt-2 font-display text-[18px] font-semibold text-chalk">
              {match.home} <span className="board text-chalk-dim">{match.score}</span> {match.away}
            </h2>
            <p className="mt-1 text-xs text-chalk-faint">
              {competitionById.get(match.competitionId)?.name} · {fmt.longDate(match.date)}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <Link href={refereeHref(referee.id)} className="inline-flex items-center gap-1 text-chalk-dim hover:text-chalk">
                {t("common.referee")}: {referee.name}
                <ArrowUpRight size={11} />
              </Link>
              {observer && (
                <span className="text-chalk-faint">
                  {t("assessments.observer")}: {observer.name}
                </span>
              )}
              {report.filedHoursAfter !== null && (
                <span className="text-chalk-faint">
                  {t("assessments.filed")} +{report.filedHoursAfter}
                  {t("common.hours")}
                </span>
              )}
            </div>
          </div>
          <div className="shrink-0">
            <Board primary label={t("assessments.overall")} value={report.overall.toFixed(1)} unit="/ 10" />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader icon={Gauge} tint="var" title={t("assessments.kpis")} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {markKeys.map(([key, labelKey]) => {
            const value = report.marks[key];
            return (
              <div key={key}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-chalk-dim">{t(labelKey)}</span>
                  <span className="board text-chalk">{value.toFixed(1)}</span>
                </div>
                <Meter
                  value={value * 10}
                  tone={value >= 8.5 ? "pitch" : value >= 7.5 ? "chalk" : value >= 6.5 ? "amber" : "red"}
                />
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <CardHeader icon={Quote} tint="gold" title={t("assessments.notes")} />
        <p className="text-sm leading-relaxed text-chalk-dim">{pickLocalized(report.notes, locale)}</p>

        {report.clips.length > 0 && (
          <>
            <p className="mb-2 mt-4 text-xs font-medium text-chalk-faint">
              {t("assessments.clips")}
            </p>
            <ul className="space-y-1.5">
              {report.clips.map((clip) => (
                <li
                  key={clip.minute}
                  className="flex items-center gap-2.5 rounded-[10px] border border-line bg-ink-1 px-3 py-2"
                >
                  <Film size={13} className="shrink-0 text-var" />
                  <span className="board w-9 shrink-0 text-xs text-chalk-faint">{clip.minute}&apos;</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-chalk-dim">{pickLocalized(clip.label, locale)}</span>
                  <Link href="/decision-engine" className="shrink-0 text-xs text-chalk-faint hover:text-chalk">
                    {t("common.open")}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}
