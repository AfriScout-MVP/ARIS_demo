"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlarmClock, ArrowUpRight, BarChart3, ClipboardCheck, ClipboardList, Clock, Eye, Film, Gauge, LockKeyhole, Pencil, Plus, Quote, Send, Star } from "@/components/icons/glyphs";
import { cn } from "@/lib/utils";
import { useFormatters, useLocale, useT } from "@/lib/i18n/LocaleProvider";
import { useScope } from "@/lib/scope/ScopeProvider";
import { PageHeading } from "@/components/layout/PageHeading";
import { Badge, Board, Button, Card, CardHeader, EmptyState, Meter, Segmented } from "@/components/ui";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { Dialog } from "@/components/admin/Dialog";
import { SelectField } from "@/components/admin/fields";
import { ReportDialog } from "@/components/assessments/ReportDialog";
import { publishReport, type AssessmentRow } from "@/lib/api/assessments";
import { useDataset } from "@/lib/dataset/DatasetProvider";
import { useToast } from "@/lib/toast/ToastProvider";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { pickLocalized } from "@/lib/i18n/localized";
import { assessments, CAF, competitionById, criteria, matchById, matches, refereeById, refereeHref, type Assessment } from "@/lib/store";

/** The snapshot's report as the dialogs take it (the live row has the same fields). */
const asRow = (a: Assessment): AssessmentRow => ({
  ...a,
  state: a.state,
  published: a.published ?? false,
  countryCode: matchById.get(a.matchId)?.countryCode ?? null,
  filedAt: null,
});

const markTone = (v: number) => (v >= 8.5 ? "pitch" : v >= 7.5 ? "chalk" : v >= 6.5 ? "amber" : "red");

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
  const { locale } = useLocale();
  const { refresh } = useDataset();
  const { matches: inScope } = useScope();
  const [filter, setFilter] = useState<"all" | "overdue">("all");
  const [picking, setPicking] = useState(false);
  const [filing, setFiling] = useState<string | null>(null);

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
    return criteria
      .map((c) => {
        const marked = filed.filter((a) => typeof a.marks[c.key] === "number");
        return { key: c.key, label: pickLocalized(c.label, locale), value: marked.length ? marked.reduce((sum, a) => sum + a.marks[c.key], 0) / marked.length : 0 };
      })
      .filter((row) => row.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [filed, locale]);

  const weakest = criterionAverages[criterionAverages.length - 1];
  const spread = filed.slice().sort((a, b) => b.overall - a.overall);

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeading
        titleKey="assessments.title"
        subtitleKey="subtitles.assessments"
        action={
          <Button variant="primary" onClick={() => setPicking(true)} disabled={criteria.length === 0}>
            <Plus size={16} />
            {t("assessments.form.new")}
          </Button>
        }
      />

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

          {selected && <ReportDetail report={selected} onFile={() => setFiling(selected.matchId)} />}
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
                    {t("assessments.weakest")}: {weakest.label}
                  </Badge>
                ) : undefined
              }
            />
            <ul className="space-y-3">
              {criterionAverages.map((row) => (
                <li key={row.key}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-chalk-dim">{row.label}</span>
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

      {picking && (
        <PickMatchDialog
          inScope={inScope}
          onClose={() => setPicking(false)}
          onPick={(id) => {
            setPicking(false);
            setFiling(id);
          }}
        />
      )}
      {filing && matchById.get(filing) && (
        <ReportDialog
          mode={{ kind: "new", matchId: filing, pickObserver: { country: observerCountry(filing) } }}
          grid={criteria}
          title={matchTitle(filing, fmt.date)}
          onClose={() => setFiling(null)}
          onDone={() => {
            setFiling(null);
            void refresh();
          }}
        />
      )}
    </div>
  );
}

/** Observers come from the match's own country; for a CAF match an administrator may pick anyone. */
const observerCountry = (matchId: string) => {
  const code = matchById.get(matchId)?.countryCode;
  return code && code !== CAF ? code : undefined;
};

const matchTitle = (matchId: string, date: (d: string) => string) => {
  const m = matchById.get(matchId);
  return m ? `${m.home} — ${m.away} · ${date(m.date)}` : "";
};

/** Played matches in scope that have no filed report yet, most recent first. */
function PickMatchDialog({ inScope, onClose, onPick }: { inScope: (code: string) => boolean; onClose: () => void; onPick: (matchId: string) => void }) {
  const t = useT();
  const fmt = useFormatters();
  const options = useMemo(() => {
    const done = new Set(assessments.filter((a) => a.state === "filed").map((a) => a.matchId));
    return matches
      .filter((m) => inScope(m.countryCode) && !done.has(m.id))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 150)
      .map((m) => ({ value: m.id, label: `${fmt.date(m.date)} · ${m.home} — ${m.away}` }));
  }, [inScope, fmt]);
  const [value, setValue] = useState("");
  return (
    <Dialog
      size="sm"
      title={t("assessments.form.new")}
      description={t("assessments.form.pickHint")}
      onClose={onClose}
      onSubmit={() => value && onPick(value)}
      footer={
        <>
          <Button type="button" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" variant="primary" disabled={!value}>
            {t("assessments.form.continue")}
          </Button>
        </>
      }
    >
      {options.length === 0 ? (
        <EmptyState title={t("assessments.form.noMatch")} />
      ) : (
        <SelectField label={t("assessments.form.match")} value={value} onChange={setValue} options={options} placeholder={t("assessments.form.chooseMatch")} required />
      )}
    </Dialog>
  );
}

function ReportDetail({ report, onFile }: { report: Assessment; onFile: () => void }) {
  const t = useT();
  const { locale } = useLocale();
  const fmt = useFormatters();
  const toast = useToast();
  const { refresh } = useDataset();
  const [editing, setEditing] = useState(false);
  const [releasing, setReleasing] = useState(false);
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
            <div className="flex flex-col items-center gap-2">
              <Badge tone="red">
                <Clock size={11} />
                {t("assessments.overdue")}
              </Badge>
              <Button variant="primary" size="sm" onClick={onFile} disabled={criteria.length === 0}>
                <Plus size={13} />
                {t("assessments.form.fileForObserver")}
              </Button>
            </div>
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
            <span className="flex flex-wrap gap-1.5">
              <Badge tone={stateTone[report.state]}>{t(stateKey[report.state])}</Badge>
              {report.state === "filed" &&
                (report.published ? (
                  <Badge tone="var">
                    <Eye size={11} />
                    {t("assessments.published")}
                  </Badge>
                ) : (
                  <Badge tone="neutral">
                    <LockKeyhole size={11} />
                    {t("assessments.confidential")}
                  </Badge>
                ))}
            </span>
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
          <div className="flex shrink-0 flex-col items-stretch gap-2">
            <Board primary label={t("assessments.overall")} value={report.overall.toFixed(1)} unit="/ 10" />
            {report.state === "filed" && !report.published && (
              <Button variant="primary" size="sm" onClick={() => setReleasing(true)}>
                <Send size={13} />
                {t("assessments.release")}
              </Button>
            )}
            {criteria.length > 0 && (
              <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                <Pencil size={13} />
                {t(report.state === "filed" ? "assessments.form.correct" : "assessments.form.continueDraft")}
              </Button>
            )}
          </div>
        </div>
      </Card>

      {releasing && (
        <ConfirmDialog
          title={t("assessments.releaseTitle")}
          confirmLabel={t("assessments.release")}
          perform={() => publishReport(report.id)}
          onCancel={() => setReleasing(false)}
          onDone={() => {
            setReleasing(false);
            toast.push("success", t("assessments.released", { name: referee.name }));
            void refresh();
          }}
        >
          <p>{t("assessments.releaseBody", { name: referee.name })}</p>
        </ConfirmDialog>
      )}
      {editing && (
        <ReportDialog
          mode={report.state === "filed" ? { kind: "correct", report: asRow(report) } : { kind: "draft", report: asRow(report) }}
          grid={criteria}
          title={`${match.home} — ${match.away} · ${fmt.date(match.date)}`}
          onClose={() => setEditing(false)}
          onDone={() => {
            setEditing(false);
            void refresh();
          }}
        />
      )}

      <Card>
        <CardHeader icon={Gauge} tint="var" title={t("assessments.kpis")} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {criteria.map((c) => {
            const value = report.marks[c.key];
            const marked = typeof value === "number";
            return (
              <div key={c.key}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-chalk-dim">{pickLocalized(c.label, locale)}</span>
                  <span className="board text-chalk">{marked ? value.toFixed(1) : "—"}</span>
                </div>
                <Meter value={marked ? value * 10 : 0} tone={marked ? markTone(value) : "chalk"} />
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
