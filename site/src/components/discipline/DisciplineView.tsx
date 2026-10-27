"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, CalendarDays, ClipboardList, Plus, ShieldAlert, ShieldCheck } from "@/components/icons/glyphs";
import { Badge, Board, Button, Card, EmptyState, Segmented, Td, Th } from "@/components/ui";
import { PageHeading } from "@/components/layout/PageHeading";
import { ErrorState, ListSkeleton, ResultsLive } from "@/components/admin/states";
import { SearchBox } from "@/components/admin/Toolbar";
import { listCases, listIncidents, type AffectedDesignation, type DisciplinaryCase, type Incident } from "@/lib/api/discipline";
import { useResource } from "@/lib/admin/hooks";
import { CASE_TONE, disciplineSummary, INCIDENT_TONE, isActiveCase, matchesText, SANCTION_TONE, SEVERITY_TONE, type CaseAction } from "@/lib/discipline/rules";
import { today } from "@/lib/store";
import { useScope } from "@/lib/scope/ScopeProvider";
import { useFormatters, useT } from "@/lib/i18n/LocaleProvider";
import { cn } from "@/lib/utils";
import { AppealDialog, CaseDialog, CloseDialog, DecideDialog, HearingDialog, IncidentDialog, OpenCaseDialog, ReportDialog } from "./DisciplineDialogs";

const TABS = ["incidents", "cases"] as const;
type Tab = (typeof TABS)[number];
type IncidentView = "active" | "open" | "reviewing" | "closed" | "all";
type CaseView = "active" | "opened" | "hearing_scheduled" | "decided" | "appealed" | "closed" | "all";

type Modal =
  | { kind: "report" }
  | { kind: "incident"; incident: Incident }
  | { kind: "open"; incident?: Incident }
  | { kind: "case"; kase: DisciplinaryCase }
  | { kind: CaseAction; kase: DisciplinaryCase };

export function DisciplineView() {
  const t = useT();
  const fmt = useFormatters();
  const router = useRouter();
  const params = useSearchParams();
  const { scope, matches, lockedTo } = useScope();
  const country = lockedTo ?? (scope.kind === "country" ? scope.code : undefined);
  const [tab, setTab] = useState<Tab>(params.get("tab") === "cases" ? "cases" : "incidents");
  const [tick, setTick] = useState(0);
  const incidents = useResource(`incidents|${country ?? ""}|${tick}`, (signal) => listIncidents({ country }, signal));
  const cases = useResource(`cases|${country ?? ""}|${tick}`, (signal) => listCases({ country }, signal));
  const [q, setQ] = useState("");
  const [incidentView, setIncidentView] = useState<IncidentView>("active");
  const [caseView, setCaseView] = useState<CaseView>("active");
  const [modal, setModal] = useState<Modal | null>(null);
  const [affected, setAffected] = useState<{ name: string; rows: AffectedDesignation[] } | null>(null);

  const allIncidents = useMemo(() => (incidents.data ?? []).filter((i) => matches(i.countryCode)), [incidents.data, matches]);
  const allCases = useMemo(() => (cases.data ?? []).filter((c) => matches(c.countryCode)), [cases.data, matches]);
  const summary = useMemo(() => disciplineSummary(allIncidents, allCases, today()), [allIncidents, allCases]);

  const shownIncidents = allIncidents.filter(
    (i) => (incidentView === "all" ? true : incidentView === "active" ? i.status !== "closed" : i.status === incidentView) && matchesText(q, i.officialName, i.description),
  );
  const shownCases = allCases.filter(
    (c) => (caseView === "all" ? true : caseView === "active" ? isActiveCase(c) || c.status === "decided" : c.status === caseView) && matchesText(q, c.officialName, c.summary, c.decisionRef),
  );

  const pick = (next: Tab) => {
    setTab(next);
    router.replace(next === "incidents" ? "/discipline" : "/discipline?tab=cases", { scroll: false });
  };
  const changed = () => {
    setModal(null);
    setTick((n) => n + 1);
  };

  const incidentViews: IncidentView[] = ["active", "open", "reviewing", "closed", "all"];
  const caseViews: CaseView[] = ["active", "opened", "hearing_scheduled", "decided", "appealed", "closed", "all"];
  const incidentCount = (v: IncidentView) => allIncidents.filter((i) => (v === "all" ? true : v === "active" ? i.status !== "closed" : i.status === v)).length;
  const caseCount = (v: CaseView) => allCases.filter((c) => (v === "all" ? true : v === "active" ? isActiveCase(c) || c.status === "decided" : c.status === v)).length;
  const viewLabel = (v: IncidentView | CaseView) =>
    v === "all"
      ? t("discipline.views.all")
      : v === "active"
        ? t("discipline.views.active")
        : tab === "incidents"
          ? t(`discipline.incidentStatus.${v as Exclude<IncidentView, "all" | "active">}`)
          : t(`discipline.caseStatus.${v as Exclude<CaseView, "all" | "active">}`);

  const loading = tab === "incidents" ? incidents.loading : cases.loading;
  const failed = tab === "incidents" ? incidents.error : cases.error;

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeading
        titleKey="discipline.title"
        subtitleKey="discipline.subtitle"
        action={
          <span className="flex flex-wrap gap-2">
            <Button onClick={() => setModal({ kind: "report" })}>
              <ClipboardList size={16} />
              {t("discipline.report.button")}
            </Button>
            <Button variant="primary" onClick={() => setModal({ kind: "open" })}>
              <Plus size={16} />
              {t("discipline.open.button")}
            </Button>
          </span>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Board tone={summary.openIncidents ? "amber" : "chalk"} icon={ClipboardList} label={t("discipline.kpi.openIncidents")} value={summary.openIncidents} hint={t("discipline.kpi.openIncidentsHint")} />
        <Board tone="var" icon={ShieldAlert} label={t("discipline.kpi.activeCases")} value={summary.activeCases} hint={t("discipline.kpi.activeCasesHint")} />
        <Board tone={summary.suspended ? "red" : "pitch"} icon={summary.suspended ? AlertTriangle : ShieldCheck} label={t("discipline.kpi.suspended")} value={summary.suspended} hint={t("discipline.kpi.suspendedHint")} />
        <Board tone="gold" icon={CalendarDays} label={t("discipline.kpi.hearings")} value={summary.hearings} hint={t("discipline.kpi.hearingsHint")} />
      </div>

      {affected && affected.rows.length > 0 && (
        <div role="alert" className="flex flex-wrap items-start gap-3 rounded-[12px] border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-card-red" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-chalk">{t("discipline.decide.affected", { name: affected.name, n: affected.rows.length })}</p>
            <ul className="mt-1 text-chalk-dim">
              {affected.rows.map((r) => (
                <li key={`${r.fixtureId}|${r.role}`}>
                  {fmt.date(r.date)} · {r.home} – {r.away} · {t(`roles.${r.role}` as never)}
                </li>
              ))}
            </ul>
          </div>
          <span className="flex gap-2">
            <Link href="/calendar" className="inline-flex min-h-9 items-center rounded-lg bg-red-600 px-3 text-sm font-medium text-white hover:bg-red-700">
              {t("discipline.decide.toCalendar")}
            </Link>
            <Button size="sm" variant="ghost" onClick={() => setAffected(null)}>
              {t("finance.report.dismiss")}
            </Button>
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Segmented value={tab} onChange={pick} options={TABS.map((x) => ({ value: x, label: t(`discipline.tabs.${x}`) }))} />
        <SearchBox value={q} onChange={setQ} placeholder={t("discipline.searchPlaceholder")} />
      </div>
      <div className="scroll-x -mx-4 px-4 lg:mx-0 lg:px-0">
        <div role="group" aria-label={t("discipline.views.label")} className="flex w-max gap-1.5">
          {(tab === "incidents" ? incidentViews : caseViews).map((v) => {
            const active = tab === "incidents" ? incidentView === v : caseView === v;
            const count = tab === "incidents" ? incidentCount(v as IncidentView) : caseCount(v as CaseView);
            return (
              <button
                key={v}
                type="button"
                aria-pressed={active}
                onClick={() => (tab === "incidents" ? setIncidentView(v as IncidentView) : setCaseView(v as CaseView))}
                className={cn(
                  "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors",
                  active ? "border-red-600 bg-red-600 text-white" : "border-field bg-ink-2 text-chalk-dim hover:text-chalk",
                )}
              >
                {viewLabel(v)}
                <span className={cn("tnum rounded-full px-1.5 text-xs", active ? "bg-white/20" : "bg-ink-3 text-chalk-faint")}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div role="tabpanel" aria-label={t(`discipline.tabs.${tab}`)}>
        {loading ? (
          <ListSkeleton />
        ) : failed ? (
          <ErrorState onRetry={tab === "incidents" ? incidents.reload : cases.reload} />
        ) : tab === "incidents" ? (
          shownIncidents.length === 0 ? (
            <Card>
              <EmptyState title={t("discipline.empty.incidents")} hint={t("discipline.empty.incidentsHint")} />
            </Card>
          ) : (
            <>
              <ResultsLive count={shownIncidents.length} />
              <Card padded={false}>
                <div className="scroll-x">
                  <table className="w-full min-w-[760px] border-collapse">
                    <caption className="sr-only">{t("discipline.tabs.incidents")}</caption>
                    <thead>
                      <tr className="border-b border-line">
                        <Th>{t("discipline.fields.reportedAt")}</Th>
                        <Th>{t("discipline.fields.official")}</Th>
                        <Th>{t("discipline.fields.kind")}</Th>
                        <Th>{t("discipline.fields.description")}</Th>
                        <Th>{t("discipline.fields.status")}</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {shownIncidents.map((i) => (
                        <tr key={i.id} className="cursor-pointer hover:bg-red-500/[0.03]" onClick={() => setModal({ kind: "incident", incident: i })}>
                          <Td className="tnum">{fmt.date(i.reportedAt.slice(0, 10))}</Td>
                          <Td>
                            <button type="button" className="font-medium text-chalk hover:underline" onClick={(e) => (e.stopPropagation(), setModal({ kind: "incident", incident: i }))}>
                              {i.officialName}
                            </button>
                          </Td>
                          <Td>
                            <span className="flex flex-wrap gap-1.5">
                              <Badge tone="neutral">{t(`discipline.kinds.${i.kind}`)}</Badge>
                              {i.severity !== "minor" && <Badge tone={SEVERITY_TONE[i.severity]}>{t(`discipline.severity.${i.severity}`)}</Badge>}
                            </span>
                          </Td>
                          <Td className="whitespace-normal">
                            <span className="line-clamp-2 max-w-md">{i.description}</span>
                            {i.justified !== null && <span className="text-xs text-chalk-faint">{t(i.justified ? "discipline.justified.yes" : "discipline.justified.no")}</span>}
                          </Td>
                          <Td>
                            <Badge tone={INCIDENT_TONE[i.status]}>{t(`discipline.incidentStatus.${i.status}`)}</Badge>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )
        ) : shownCases.length === 0 ? (
          <Card>
            <EmptyState title={t("discipline.empty.cases")} hint={t("discipline.empty.casesHint")} />
          </Card>
        ) : (
          <>
            <ResultsLive count={shownCases.length} />
            <Card padded={false}>
              <div className="scroll-x">
                <table className="w-full min-w-[760px] border-collapse">
                  <caption className="sr-only">{t("discipline.tabs.cases")}</caption>
                  <thead>
                    <tr className="border-b border-line">
                      <Th>{t("discipline.fields.openedAt")}</Th>
                      <Th>{t("discipline.fields.official")}</Th>
                      <Th>{t("discipline.fields.summary")}</Th>
                      <Th>{t("discipline.fields.status")}</Th>
                      <Th>{t("discipline.fields.sanction")}</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {shownCases.map((c) => (
                      <tr key={c.id} className="cursor-pointer hover:bg-red-500/[0.03]" onClick={() => setModal({ kind: "case", kase: c })}>
                        <Td className="tnum">{fmt.date(c.openedAt.slice(0, 10))}</Td>
                        <Td>
                          <button type="button" className="font-medium text-chalk hover:underline" onClick={(e) => (e.stopPropagation(), setModal({ kind: "case", kase: c }))}>
                            {c.officialName}
                          </button>
                        </Td>
                        <Td className="whitespace-normal">
                          <span className="line-clamp-2 max-w-md">{c.summary}</span>
                          {c.status === "hearing_scheduled" && c.hearingAt && (
                            <span className="text-xs text-var">{t("discipline.timeline.hearing", { date: fmt.date(c.hearingAt.slice(0, 10)) })}</span>
                          )}
                        </Td>
                        <Td>
                          <Badge tone={CASE_TONE[c.status]}>{t(`discipline.caseStatus.${c.status}`)}</Badge>
                        </Td>
                        <Td>
                          {c.sanction ? (
                            <span>
                              <Badge tone={SANCTION_TONE[c.sanction]}>{t(`discipline.sanctions.${c.sanction}`)}</Badge>
                              {c.suspensionFrom && c.suspensionTo && (
                                <span className="mt-0.5 block text-xs text-chalk-faint">
                                  {fmt.date(c.suspensionFrom)} → {fmt.date(c.suspensionTo)}
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-chalk-faint">—</span>
                          )}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </div>

      {modal?.kind === "report" && <ReportDialog onClose={() => setModal(null)} onDone={changed} />}
      {modal?.kind === "incident" && <IncidentDialog incident={modal.incident} onClose={() => setModal(null)} onDone={changed} onOpenCase={(incident) => setModal({ kind: "open", incident })} />}
      {modal?.kind === "open" && (
        <OpenCaseDialog
          incident={modal.incident}
          onClose={() => setModal(null)}
          onDone={(kase) => {
            setTick((n) => n + 1);
            pick("cases");
            setModal({ kind: "case", kase });
          }}
        />
      )}
      {modal?.kind === "case" && <CaseDialog kase={modal.kase} onClose={() => setModal(null)} onAction={(a, kase) => setModal({ kind: a, kase })} />}
      {modal?.kind === "hearing" && <HearingDialog kase={modal.kase} onClose={() => setModal(null)} onDone={changed} />}
      {modal?.kind === "decide" && (
        <DecideDialog
          kase={modal.kase}
          onClose={() => setModal(null)}
          onDone={(rows) => {
            setAffected({ name: modal.kase.officialName, rows });
            changed();
          }}
        />
      )}
      {modal?.kind === "appeal" && <AppealDialog kase={modal.kase} onClose={() => setModal(null)} onDone={changed} />}
      {modal?.kind === "close" && <CloseDialog kase={modal.kase} onClose={() => setModal(null)} onDone={changed} />}
    </div>
  );
}
