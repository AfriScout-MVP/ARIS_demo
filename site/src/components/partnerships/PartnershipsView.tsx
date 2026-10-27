"use client";

import { useMemo, useState } from "react";
import {
  AlarmClock,
  ArrowUpRight,
  CalendarCheck,
  Handshake,
  Mail,
  MessageSquare,
  Pencil,
  Phone,
  Plus,
  Rocket,
  Users,
} from "@/components/icons/glyphs";
import { Badge, Board, Button, Card, EmptyState, Td, Th } from "@/components/ui";
import { AdminPage } from "@/components/admin/AdminPage";
import { Dialog } from "@/components/admin/Dialog";
import { Switch } from "@/components/admin/fields";
import { ErrorState, ListSkeleton, ResultsLive, Skeleton } from "@/components/admin/states";
import { SearchBox } from "@/components/admin/Toolbar";
import { listCountries, listUsers } from "@/lib/api/admin";
import { getPartnership, listPartnerships, type Partnership, type PartnershipEvent, type Stage } from "@/lib/api/partnerships";
import { useActor, useResource } from "@/lib/admin/hooks";
import { countryLabel } from "@/lib/admin/labels";
import {
  BOARD_STAGES,
  daysUntil,
  filterPartnerships,
  isLive,
  pipelineSummary,
  PRIORITY_TONE,
  priorityKey,
  STAGE_TONE,
  stageKey,
  type PipelineFilter,
} from "@/lib/partnerships/rules";
import { useFormatters, useLocale, useT } from "@/lib/i18n/LocaleProvider";
import { cn } from "@/lib/utils";
import { LogDialog, OnboardDialog, PartnershipFormDialog, StageDialog } from "./PartnershipDialogs";

const todayIso = () => new Date().toISOString().slice(0, 10);

type Modal =
  | { kind: "new" }
  | { kind: "edit"; p: Partnership }
  | { kind: "stage"; p: Partnership; moves: Stage[] }
  | { kind: "log"; p: Partnership }
  | { kind: "onboard"; p: Partnership };

export function PartnershipsView() {
  const t = useT();
  const { locale } = useLocale();
  const actor = useActor();
  const actorId = actor?.id ?? "";

  const list = useResource("partnerships", (signal) => listPartnerships(signal));
  const countries = useResource("countries|all", (signal) => listCountries(true, signal));
  const admins = useResource("users|admin", (signal) => listUsers({ role: "admin" }, signal));

  const [filter, setFilter] = useState<PipelineFilter>({ q: "", stage: "live", mine: null });
  const [openId, setOpenId] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal | null>(null);
  const [detailTick, setDetailTick] = useState(0);

  const rows = useMemo(() => list.data?.partnerships ?? [], [list.data]);
  const shown = useMemo(() => filterPartnerships(rows, filter), [rows, filter]);
  const summary = useMemo(() => pipelineSummary(rows), [rows]);
  const countryByCode = useMemo(() => new Map((countries.data ?? []).map((c) => [c.code, c])), [countries.data]);
  const taken = useMemo(() => {
    const set = new Set<string>();
    for (const c of countries.data ?? []) if (c.federation) set.add(c.code);
    for (const p of rows) if (p.stage !== "declined") set.add(p.country);
    return set;
  }, [countries.data, rows]);

  const changed = (p: Partnership) => {
    setModal(null);
    list.reload();
    setDetailTick((n) => n + 1);
    setOpenId(p.id);
  };

  const stageFilters: Array<{ value: PipelineFilter["stage"]; label: string; count: number }> = [
    { value: "live", label: t("partnerships.filters.live"), count: summary.live },
    ...BOARD_STAGES.map((s) => ({ value: s as PipelineFilter["stage"], label: t(stageKey(s)), count: list.data?.stages[s]?.count ?? 0 })),
    { value: "on_hold", label: t(stageKey("on_hold")), count: list.data?.stages.on_hold?.count ?? 0 },
    { value: "onboarded", label: t(stageKey("onboarded")), count: list.data?.stages.onboarded?.count ?? 0 },
    { value: "declined", label: t(stageKey("declined")), count: list.data?.stages.declined?.count ?? 0 },
    { value: "all", label: t("common.all"), count: rows.length },
  ];

  return (
    <AdminPage
      titleKey="partnerships.title"
      subtitleKey="partnerships.subtitle"
      action={
        <Button variant="primary" onClick={() => setModal({ kind: "new" })} disabled={!countries.data || !admins.data}>
          <Plus size={16} />
          {t("partnerships.new")}
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Board tone="var" icon={Handshake} label={t("partnerships.kpi.live")} value={summary.live} />
        <Board tone={summary.overdue ? "red" : "chalk"} icon={AlarmClock} label={t("partnerships.kpi.overdue")} value={summary.overdue} hint={t("partnerships.kpi.overdueHint")} />
        <Board tone="gold" icon={CalendarCheck} label={t("partnerships.kpi.signed")} value={summary.signed} hint={t("partnerships.kpi.signedHint")} />
        <Board tone="pitch" icon={Rocket} label={t("partnerships.kpi.onboarded")} value={summary.onboarded} />
        <Board tone="chalk" icon={Users} label={t("partnerships.kpi.officials")} value={summary.officialsInPlay.toLocaleString(locale)} hint={t("partnerships.kpi.officialsHint")} className="col-span-2 lg:col-span-1" />
      </div>

      <Funnel stages={list.data?.stages} onPick={(s) => setFilter((f) => ({ ...f, stage: s }))} active={filter.stage} />

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <SearchBox value={filter.q} onChange={(q) => setFilter((f) => ({ ...f, q }))} placeholder={t("partnerships.searchPlaceholder")} />
          <label className="inline-flex min-h-10 items-center gap-2 text-sm text-chalk-dim">
            <Switch checked={filter.mine !== null} onChange={(on) => setFilter((f) => ({ ...f, mine: on ? actorId : null }))} label={t("partnerships.filters.mine")} />
            {t("partnerships.filters.mine")}
          </label>
        </div>
        <div className="scroll-x -mx-4 px-4 lg:mx-0 lg:px-0">
          <div role="group" aria-label={t("partnerships.filters.stage")} className="flex w-max gap-1.5">
            {stageFilters.map((s) => (
              <button
                key={s.value}
                type="button"
                aria-pressed={filter.stage === s.value}
                onClick={() => setFilter((f) => ({ ...f, stage: s.value }))}
                className={cn(
                  "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors",
                  filter.stage === s.value ? "border-red-600 bg-red-600 text-white" : "border-field bg-ink-2 text-chalk-dim hover:text-chalk",
                )}
              >
                {s.label}
                <span className={cn("tnum rounded-full px-1.5 text-xs", filter.stage === s.value ? "bg-white/20" : "bg-ink-3 text-chalk-faint")}>{s.count}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {list.loading ? (
        <ListSkeleton />
      ) : list.error ? (
        <ErrorState onRetry={list.reload} />
      ) : shown.length === 0 ? (
        <Card>
          <EmptyState
            title={rows.length === 0 ? t("partnerships.empty") : t("admin.common.noMatch")}
            hint={rows.length === 0 ? t("partnerships.emptyHint") : t("admin.common.noMatchHint")}
            action={
              rows.length === 0 ? (
                <Button variant="primary" onClick={() => setModal({ kind: "new" })} disabled={!countries.data || !admins.data}>
                  <Plus size={16} />
                  {t("partnerships.new")}
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <>
          <ResultsLive count={shown.length} />
          <ul className="space-y-2 lg:hidden">
            {shown.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => setOpenId(p.id)} className="block w-full text-start">
                  <Card className="p-4 transition-colors hover:border-line-strong sm:p-4">
                    <div className="flex items-start gap-3">
                      <span aria-hidden className="text-2xl leading-none">{p.flag || "🏳️"}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-chalk">{p.federationName}</p>
                        <p className="text-xs text-chalk-faint">{countryLabel({ code: p.country, name: p.countryName, nameFr: p.countryNameFr }, locale, p.country)}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <Badge tone={STAGE_TONE[p.stage]}>{t(stageKey(p.stage))}</Badge>
                          {p.priority !== "normal" && <Badge tone={PRIORITY_TONE[p.priority]}>{t(priorityKey(p.priority))}</Badge>}
                        </div>
                        <NextStep p={p} className="mt-2" />
                      </div>
                    </div>
                  </Card>
                </button>
              </li>
            ))}
          </ul>
          <Card padded={false} className="hidden lg:block">
            <div className="scroll-x">
              <table className="w-full border-collapse">
                <caption className="sr-only">{t("partnerships.title")}</caption>
                <thead>
                  <tr className="border-b border-line">
                    <Th>{t("partnerships.fields.federation")}</Th>
                    <Th>{t("partnerships.fields.stage")}</Th>
                    <Th>{t("partnerships.fields.contact")}</Th>
                    <Th>{t("partnerships.fields.nextStep")}</Th>
                    <Th>{t("partnerships.fields.owner")}</Th>
                    <Th className="text-end">{t("partnerships.fields.officials")}</Th>
                    <Th>
                      <span className="sr-only">{t("admin.common.actions")}</span>
                    </Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {shown.map((p) => (
                    <tr key={p.id} className="cursor-pointer hover:bg-red-500/[0.03]" onClick={() => setOpenId(p.id)}>
                      <Td>
                        <span className="inline-flex items-center gap-3">
                          <span aria-hidden className="text-xl leading-none">{p.flag || "🏳️"}</span>
                          <span className="min-w-0">
                            <span className="block max-w-64 truncate font-semibold text-chalk">{p.federationName}</span>
                            <span className="block text-xs text-chalk-faint">
                              {countryLabel({ code: p.country, name: p.countryName, nameFr: p.countryNameFr }, locale, p.country)}
                              {p.federationCode ? ` · ${p.federationCode}` : ""}
                            </span>
                          </span>
                        </span>
                      </Td>
                      <Td>
                        <span className="flex flex-wrap gap-1.5">
                          <Badge tone={STAGE_TONE[p.stage]}>{t(stageKey(p.stage))}</Badge>
                          {p.priority === "high" && <Badge tone="red">{t(priorityKey("high"))}</Badge>}
                        </span>
                      </Td>
                      <Td>
                        <span className="block max-w-48 truncate">{p.contactName ?? "—"}</span>
                        {p.contactRole && <span className="block max-w-48 truncate text-xs text-chalk-faint">{p.contactRole}</span>}
                      </Td>
                      <Td>
                        <NextStep p={p} />
                      </Td>
                      <Td>{p.ownerName ?? <span className="text-chalk-faint">{t("partnerships.unowned")}</span>}</Td>
                      <Td className="text-end tnum">{p.officialsEstimate === null ? "—" : p.officialsEstimate.toLocaleString(locale)}</Td>
                      <Td className="text-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={t("partnerships.openFor", { name: p.federationName })}
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenId(p.id);
                          }}
                        >
                          <ArrowUpRight size={15} />
                        </Button>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {openId && !modal && (
        <PartnershipPanel
          id={openId}
          tick={detailTick}
          onClose={() => setOpenId(null)}
          onEdit={(p) => setModal({ kind: "edit", p })}
          onMove={(p, moves) => setModal({ kind: "stage", p, moves })}
          onLog={(p) => setModal({ kind: "log", p })}
          onOnboard={(p) => setModal({ kind: "onboard", p })}
        />
      )}

      {modal?.kind === "new" && countries.data && admins.data && (
        <PartnershipFormDialog countries={countries.data} admins={admins.data.filter((a) => a.active)} actorId={actorId} takenCountries={taken} onClose={() => setModal(null)} onDone={changed} />
      )}
      {modal?.kind === "edit" && (
        <PartnershipFormDialog
          partnership={modal.p}
          countries={countries.data ?? []}
          admins={(admins.data ?? []).filter((a) => a.active)}
          actorId={actorId}
          takenCountries={taken}
          onClose={() => setModal(null)}
          onDone={changed}
        />
      )}
      {modal?.kind === "stage" && <StageDialog partnership={modal.p} moves={modal.moves} onClose={() => setModal(null)} onDone={changed} />}
      {modal?.kind === "log" && <LogDialog partnership={modal.p} onClose={() => setModal(null)} onDone={changed} />}
      {modal?.kind === "onboard" && <OnboardDialog partnership={modal.p} country={countryByCode.get(modal.p.country)} onClose={() => setModal(null)} onDone={changed} />}
    </AdminPage>
  );
}

/** The four working stages as a strip, each with its count and the officials it represents. */
function Funnel({ stages, onPick, active }: { stages?: Record<Stage, { count: number; officials: number }>; onPick: (s: Stage) => void; active: PipelineFilter["stage"] }) {
  const t = useT();
  const { locale } = useLocale();
  if (!stages) return <Skeleton className="h-20 w-full" />;
  return (
    <ol aria-label={t("partnerships.funnel")} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {BOARD_STAGES.map((s, i) => (
        <li key={s}>
          <button
            type="button"
            aria-pressed={active === s}
            onClick={() => onPick(s)}
            className={cn(
              "panel flex h-full w-full flex-col gap-1 rounded-[12px] border bg-ink-1 px-4 py-3 text-start transition-colors hover:border-line-strong",
              active === s ? "border-red-600" : "border-line",
            )}
          >
            <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-chalk-faint">
              <span className="board tnum text-chalk-faint">{i + 1}</span>
              {t(stageKey(s))}
            </span>
            <span className="board tnum text-2xl text-chalk">{stages[s].count}</span>
            <span className="text-xs text-chalk-faint">{t("partnerships.funnelOfficials", { count: stages[s].officials.toLocaleString(locale) })}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

function NextStep({ p, className }: { p: Partnership; className?: string }) {
  const t = useT();
  const fmt = useFormatters();
  if (!isLive(p.stage)) {
    return <span className={cn("block text-xs text-chalk-faint", className)}>{p.stage === "declined" ? p.declinedReason : p.agreementReference}</span>;
  }
  if (!p.nextStep && !p.nextStepDue) return <span className={cn("block text-xs text-chalk-faint", className)}>{t("partnerships.noNextStep")}</span>;
  const days = p.nextStepDue ? daysUntil(p.nextStepDue, todayIso()) : null;
  return (
    <span className={cn("block max-w-64", className)}>
      {p.nextStep && <span className="block truncate text-sm text-chalk">{p.nextStep}</span>}
      {p.nextStepDue && (
        <span className={cn("block text-xs", p.overdue ? "font-semibold text-card-red" : days !== null && days <= 3 ? "text-amber" : "text-chalk-faint")}>
          {fmt.date(p.nextStepDue)} ·{" "}
          {days === null ? "" : days < 0 ? t("partnerships.daysLate", { n: -days }) : days === 0 ? t("partnerships.dueToday") : t("partnerships.daysLeft", { n: days })}
        </span>
      )}
    </span>
  );
}

const EVENT_ICON = { call: Phone, email: Mail, meeting: Users, note: MessageSquare, stage: ArrowUpRight } as const;

/** One relationship: who, where it stands, what to do next, and everything that happened. */
function PartnershipPanel({
  id,
  tick,
  onClose,
  onEdit,
  onMove,
  onLog,
  onOnboard,
}: {
  id: string;
  tick: number;
  onClose: () => void;
  onEdit: (p: Partnership) => void;
  onMove: (p: Partnership, moves: Stage[]) => void;
  onLog: (p: Partnership) => void;
  onOnboard: (p: Partnership) => void;
}) {
  const t = useT();
  const fmt = useFormatters();
  const { locale } = useLocale();
  const detail = useResource(`partnership|${id}|${tick}`, (signal) => getPartnership(id, signal));
  const p = detail.data?.partnership;

  return (
    <Dialog size="lg" title={p?.federationName ?? t("admin.common.loading")} description={p ? countryLabel({ code: p.country, name: p.countryName, nameFr: p.countryNameFr }, locale, p.country) : undefined} onClose={onClose}>
      {detail.loading ? (
        <div className="space-y-3" aria-busy>
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : detail.error || !p || !detail.data ? (
        <ErrorState onRetry={detail.reload} />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STAGE_TONE[p.stage]}>{t(stageKey(p.stage))}</Badge>
            <Badge tone={PRIORITY_TONE[p.priority]}>{t(priorityKey(p.priority))}</Badge>
            {p.federationCode && <Badge tone="chalk">{p.federationCode}</Badge>}
            {!p.countryActive && p.stage !== "onboarded" && <Badge tone="neutral">{t("partnerships.countryInactive")}</Badge>}
          </div>

          {isLive(p.stage) && (
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => onLog(p)}>
                <MessageSquare size={15} />
                {t("partnerships.actions.log")}
              </Button>
              {detail.data.moves.length > 0 && (
                <Button onClick={() => onMove(p, detail.data!.moves)}>
                  <ArrowUpRight size={15} />
                  {t("partnerships.actions.move")}
                </Button>
              )}
              <Button onClick={() => onEdit(p)}>
                <Pencil size={15} />
                {t("partnerships.actions.edit")}
              </Button>
              {p.stage === "agreement_signed" && (
                <Button variant="primary" onClick={() => onOnboard(p)}>
                  <Rocket size={15} />
                  {t("partnerships.actions.onboard")}
                </Button>
              )}
            </div>
          )}

          {p.overdue && (
            <p role="status" className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-chalk">
              <AlarmClock size={16} className="shrink-0 text-card-red" />
              {t("partnerships.overdueBanner", { step: p.nextStep ?? t("partnerships.fields.nextStep"), date: p.nextStepDue ? fmt.date(p.nextStepDue) : "—" })}
            </p>
          )}

          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <Fact label={t("partnerships.fields.contact")}>
              {p.contactName ?? "—"}
              {p.contactRole && <span className="block text-xs text-chalk-faint">{p.contactRole}</span>}
            </Fact>
            <Fact label={t("partnerships.fields.reach")}>
              {p.contactEmail ? (
                <a className="block text-red-600 underline-offset-2 hover:underline dark:text-red-400" href={`mailto:${p.contactEmail}`}>
                  {p.contactEmail}
                </a>
              ) : null}
              {p.contactPhone ? (
                <a className="block text-red-600 underline-offset-2 hover:underline dark:text-red-400" href={`tel:${p.contactPhone.replace(/[^\d+]/g, "")}`}>
                  {p.contactPhone}
                </a>
              ) : null}
              {!p.contactEmail && !p.contactPhone && "—"}
            </Fact>
            <Fact label={t("partnerships.fields.owner")}>{p.ownerName ?? t("partnerships.unowned")}</Fact>
            <Fact label={t("partnerships.fields.officialsEstimate")}>{p.officialsEstimate === null ? "—" : p.officialsEstimate.toLocaleString(locale)}</Fact>
            <Fact label={t("partnerships.fields.nextStep")}>
              <NextStep p={p} />
            </Fact>
            <Fact label={t("partnerships.fields.lastContact")}>{p.lastContactOn ? fmt.date(p.lastContactOn) : t("partnerships.never")}</Fact>
            {p.agreementReference && (
              <Fact label={t("partnerships.fields.agreement")}>
                {p.agreementReference}
                {p.agreementSignedOn && <span className="block text-xs text-chalk-faint">{t("partnerships.signedOn", { date: fmt.date(p.agreementSignedOn) })}</span>}
              </Fact>
            )}
            {p.declinedReason && <Fact label={t("partnerships.fields.declinedReason")}>{p.declinedReason}</Fact>}
          </dl>

          <section aria-labelledby="pp-timeline">
            <h3 id="pp-timeline" className="mb-3 text-sm font-semibold text-chalk">
              {t("partnerships.timeline")}
            </h3>
            {detail.data.events.length === 0 ? (
              <p className="text-sm text-chalk-faint">{t("partnerships.noEvents")}</p>
            ) : (
              <ol className="relative space-y-4 border-s border-line ps-5">
                {detail.data.events.map((e) => (
                  <TimelineItem key={e.id} e={e} />
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
    </Dialog>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold text-chalk-faint">{label}</dt>
      <dd className="mt-0.5 break-words text-chalk">{children}</dd>
    </div>
  );
}

function TimelineItem({ e }: { e: PartnershipEvent }) {
  const t = useT();
  const fmt = useFormatters();
  const Icon = EVENT_ICON[e.kind];
  return (
    <li className="relative">
      <span aria-hidden className="absolute -start-[1.95rem] top-0 inline-flex h-6 w-6 items-center justify-center rounded-full border border-line bg-ink-2 text-chalk-dim">
        <Icon size={12} />
      </span>
      <p className="text-xs text-chalk-faint">
        {fmt.date(e.occurredOn)} · {t(`partnerships.kinds.${e.kind}`)}
        {e.actorName ? ` · ${e.actorName}` : ""}
      </p>
      {e.kind === "stage" && e.toStage && (
        <p className="mt-0.5 text-sm text-chalk">
          {e.fromStage ? t("partnerships.movedFromTo", { from: t(stageKey(e.fromStage)), to: t(stageKey(e.toStage)) }) : t("partnerships.openedAs", { stage: t(stageKey(e.toStage)) })}
        </p>
      )}
      {e.body && <p className="mt-0.5 whitespace-pre-line text-sm text-chalk-dim">{e.body}</p>}
    </li>
  );
}

