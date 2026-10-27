"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  BadgeCheck,
  Banknote,
  Check,
  Download,
  ListChecks,
  Send,
  Wand2,
  X,
} from "@/components/icons/glyphs";
import { Badge, Board, Button, Card, CardHeader, EmptyState, Td, Th } from "@/components/ui";
import { TextField } from "@/components/admin/fields";
import { ErrorState, ListSkeleton, ResultsLive } from "@/components/admin/states";
import { SearchBox } from "@/components/admin/Toolbar";
import { adjustPayment, generatePayments, listPayments, validatePayment, type CrewRole, type GenerateResult, type Payment } from "@/lib/api/finance";
import { useResource } from "@/lib/admin/hooks";
import {
  billingGaps,
  bulkTargets,
  CHECKS,
  countByView,
  filterPayments,
  missingChecks,
  PAYMENT_TONE,
  paymentStatusKey,
  toCsv,
  totalsByCurrency,
  type PaymentFilter,
  type PaymentView,
} from "@/lib/finance/rules";
import { downloadText } from "@/lib/finance/download";
import { CAF, competitionById, fixtures, roleKey, type Fixture } from "@/lib/store";
import { useScope } from "@/lib/scope/ScopeProvider";
import { useDataset } from "@/lib/dataset/DatasetProvider";
import { useFormatters, useT } from "@/lib/i18n/LocaleProvider";
import { useToast } from "@/lib/toast/ToastProvider";
import { cn } from "@/lib/utils";
import { AdjustDialog, CancelDialog, PayDialog, PaymentPanel, ResolveDialog, useMoney, type PaymentModal } from "./PaymentDialogs";

const LIMIT = 500;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const shift = (days: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return iso(d);
};

interface Report {
  fixture: Fixture;
  result: GenerateResult;
}

type Modal = { kind: PaymentModal; lines: Payment[] };

export function PaymentsTab({ initialView, onOpenScales }: { initialView?: PaymentView; onOpenScales: () => void }) {
  const t = useT();
  const fmt = useFormatters();
  const money = useMoney();
  const toast = useToast();
  const { version } = useDataset();
  const { scope, matches, lockedTo, isAll } = useScope();
  const country = lockedTo ?? (scope.kind === "country" ? scope.code : undefined);

  const [range, setRange] = useState({ from: shift(-60), to: shift(30) });
  const validRange = /^\d{4}-\d{2}-\d{2}$/.test(range.from) && /^\d{4}-\d{2}-\d{2}$/.test(range.to) && range.from <= range.to;
  const [query, setQuery] = useState(range);
  if (validRange && (query.from !== range.from || query.to !== range.to)) setQuery(range);

  const list = useResource(`payments|${country ?? ""}|${query.from}|${query.to}`, (signal) =>
    listPayments({ country, from: query.from, to: query.to, limit: LIMIT }, signal),
  );
  const [filter, setFilter] = useState<PaymentFilter>({ q: "", view: initialView ?? "open" });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [modal, setModal] = useState<Modal | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [generating, setGenerating] = useState<{ done: number; total: number } | null>(null);
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);

  // a line belongs to the country paying it; continental lines (CAF) only in the continental view, as for fixtures
  const rows = useMemo(
    () => (list.data ?? []).filter((p) => (p.countryCode === CAF ? isAll && !lockedTo : matches(p.countryCode))),
    [list.data, matches, isAll, lockedTo],
  );
  const shown = useMemo(() => filterPayments(rows, filter), [rows, filter]);
  const counts = useMemo(() => countByView(rows), [rows]);
  const totals = useMemo(() => totalsByCurrency(rows), [rows]);
  const picked = useMemo(() => shown.filter((p) => selected.has(p.id)), [shown, selected]);

  // matches validated in the period whose confirmed officials have no line yet; continental ties only for a continental view
  const gaps = useMemo(() => {
    void version;
    const inScope = fixtures.filter(
      (f) => f.date >= query.from && f.date <= query.to && (f.countryCode === CAF ? isAll && !lockedTo : matches(f.countryCode)),
    );
    return billingGaps(inScope, list.data ?? []);
  }, [version, query, isAll, lockedTo, matches, list.data]);

  const refresh = () => {
    list.reload();
    setTick((n) => n + 1);
  };

  async function generate(targets: Fixture[]) {
    const out: Report[] = [];
    let created = 0;
    let failed = 0;
    setGenerating({ done: 0, total: targets.length });
    for (const [i, f] of targets.entries()) {
      try {
        const result = await generatePayments(f.id);
        created += result.created;
        if (result.missingScale.length || result.currencyMismatch.length || result.defaultScaleUsed.length || result.heldByPrevious.length || result.reissued.length) {
          out.push({ fixture: f, result });
        }
      } catch {
        failed += 1;
      }
      setGenerating({ done: i + 1, total: targets.length });
    }
    setGenerating(null);
    setReports(out);
    if (failed) toast.push("error", t("finance.bulk.done", { ok: targets.length - failed, failed, skipped: 0 }));
    else toast.push("success", t("finance.toast.generated", { n: created }));
    list.reload();
  }

  async function runBulk(action: "check" | "validate") {
    const { ok: targets, skipped } = bulkTargets(picked, action);
    let ok = 0;
    let failed = 0;
    setBulk({ done: 0, total: targets.length });
    for (const [i, p] of targets.entries()) {
      try {
        if (action === "check") await adjustPayment(p.id, Object.fromEntries(missingChecks(p).map((c) => [c, true])));
        else await validatePayment(p.id);
        ok += 1;
      } catch {
        failed += 1;
      }
      setBulk({ done: i + 1, total: targets.length });
    }
    setBulk(null);
    toast.push(failed ? "error" : "success", t("finance.bulk.done", { ok, failed, skipped }));
    setSelected(new Set());
    refresh();
  }

  function exportCsv() {
    const header = ["date", "home", "away", "competition", "role", "official", "officialId", "country", "base", "transport", "lodging", "meals", "bonus", "deduction", "total", "currency", "status", "presenceConfirmed", "matchValidated", "expensesVerified", "reference", "paidAt"];
    const body = shown.map((p) => [
      p.date, p.home, p.away, competitionById.get(p.competitionId)?.name ?? p.competitionId, p.role, p.officialName, p.officialId, p.countryCode,
      p.base, p.transport, p.lodging, p.meals, p.bonus, p.deduction, p.total, p.currency, p.status,
      p.presenceConfirmed, p.matchValidated, p.expensesVerified, p.paymentRef, p.paidAt,
    ]);
    downloadText(`${t("finance.exportName")}-${query.from}-${query.to}.csv`, toCsv(header, body), "text/csv;charset=utf-8");
    toast.push("success", t("finance.toast.exported", { n: shown.length }));
  }

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allPicked = shown.length > 0 && shown.every((p) => selected.has(p.id));
  const toggleAll = () => setSelected(allPicked ? new Set() : new Set(shown.map((p) => p.id)));

  const views: PaymentView[] = ["open", "due", "validated", "contested", "paid", "cancelled", "all"];
  const lead = totals[0];
  const roleList = (roles: CrewRole[]) => roles.map((r) => t(roleKey[r])).join(", ");

  const done = (kind: "adjust" | "resolve" | "cancel") => {
    setModal(null);
    refresh();
    if (kind === "cancel") setOpenId(null);
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Board tone="amber" icon={Banknote} label={t("finance.kpi.outstanding")} value={lead ? money(lead.outstanding, lead.currency) : "—"} hint={t("finance.kpi.outstandingHint", { n: counts.open })} primary />
        <Board tone="var" icon={BadgeCheck} label={t("finance.kpi.toPay")} value={lead ? money(lead.validated, lead.currency) : "—"} hint={t("finance.kpi.toPayHint")} />
        <Board tone="pitch" icon={Check} label={t("finance.kpi.paid")} value={lead ? money(lead.paid, lead.currency) : "—"} hint={t("finance.kpi.paidHint")} />
        <Board tone={counts.contested ? "red" : "chalk"} icon={AlertTriangle} label={t("finance.kpi.contested")} value={counts.contested} hint={t("finance.kpi.contestedHint")} />
      </div>
      {totals.length > 1 && (
        <p className="text-xs text-chalk-faint">
          {t("finance.kpi.otherCurrencies")} :{" "}
          {totals
            .slice(1)
            .map((x) => `${money(x.outstanding, x.currency)} (${x.lines})`)
            .join(" · ")}
        </p>
      )}

      <Card tint={gaps.length ? "amber" : undefined}>
        <CardHeader
          title={t("finance.ready.title")}
          subtitle={t("finance.ready.hint")}
          icon={Wand2}
          tint="amber"
          action={
            gaps.length > 1 ? (
              <Button variant="primary" onClick={() => void generate(gaps.map((g) => g.fixture))} disabled={generating !== null}>
                <Wand2 size={15} />
                {generating ? t("finance.ready.generating", generating) : t("finance.ready.generateAll")}
              </Button>
            ) : undefined
          }
        />
        {list.loading ? null : gaps.length === 0 ? (
          <p className="text-sm text-chalk-dim">{t("finance.ready.empty")}</p>
        ) : (
          <ul className="divide-y divide-line">
            {gaps.slice(0, 12).map(({ fixture: f, roles }) => (
              <li key={f.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <span className="tnum w-16 shrink-0 text-xs text-chalk-faint">{fmt.date(f.date)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-chalk">
                    {f.home} – {f.away}
                  </span>
                  <span className="block truncate text-xs text-chalk-faint">
                    {competitionById.get(f.competitionId)?.name ?? f.competitionId} · {t("finance.ready.roles", { roles: roleList(roles) })}
                  </span>
                </span>
                <Button size="sm" onClick={() => void generate([f])} disabled={generating !== null}>
                  {t("finance.ready.generate")}
                </Button>
              </li>
            ))}
            {gaps.length > 12 && <li className="pt-2.5 text-xs text-chalk-faint">{t("finance.ready.count", { n: gaps.length })}</li>}
          </ul>
        )}
      </Card>

      {reports.length > 0 && (
        <Card tint="var">
          <CardHeader
            title={t("finance.report.title")}
            icon={ListChecks}
            tint="var"
            action={
              <span className="flex gap-2">
                <Button size="sm" onClick={onOpenScales}>
                  {t("finance.report.openScales")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setReports([])}>
                  {t("finance.report.dismiss")}
                </Button>
              </span>
            }
          />
          <ul className="space-y-3 text-sm">
            {reports.map(({ fixture: f, result: r }) => (
              <li key={f.id}>
                <p className="font-medium text-chalk">
                  {fmt.date(f.date)} · {f.home} – {f.away} · {r.created ? t("finance.report.created", { n: r.created }) : t("finance.report.nothing")}
                </p>
                <ul className="mt-1 space-y-0.5 text-chalk-dim">
                  {r.missingScale.length > 0 && <li className="text-card-red">{t("finance.report.missingScale", { roles: roleList(r.missingScale) })}</li>}
                  {r.currencyMismatch.length > 0 && <li className="text-card-red">{t("finance.report.currencyMismatch", { roles: roleList(r.currencyMismatch) })}</li>}
                  {r.heldByPrevious.length > 0 && <li className="text-amber">{t("finance.report.heldByPrevious", { roles: roleList(r.heldByPrevious) })}</li>}
                  {r.reissued.length > 0 && <li>{t("finance.report.reissued", { roles: roleList(r.reissued) })}</li>}
                  {r.defaultScaleUsed.length > 0 && <li>{t("finance.report.defaultScaleUsed", { roles: roleList(r.defaultScaleUsed) })}</li>}
                </ul>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <SearchBox value={filter.q} onChange={(q) => setFilter((f) => ({ ...f, q }))} placeholder={t("finance.searchPlaceholder")} />
          <fieldset className="flex items-end gap-2">
            <legend className="sr-only">{t("finance.range.label")}</legend>
            <TextField type="date" label={t("finance.range.from")} value={range.from} max={range.to} onChange={(from) => setRange((r) => ({ ...r, from }))} className="w-40" />
            <TextField type="date" label={t("finance.range.to")} value={range.to} min={range.from} onChange={(to) => setRange((r) => ({ ...r, to }))} className="w-40" />
          </fieldset>
          <Button onClick={exportCsv} disabled={shown.length === 0}>
            <Download size={15} />
            {t("finance.export")}
          </Button>
        </div>
        <div className="scroll-x -mx-4 px-4 lg:mx-0 lg:px-0">
          <div role="group" aria-label={t("finance.views.label")} className="flex w-max gap-1.5">
            {views.map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={filter.view === v}
                onClick={() => setFilter((f) => ({ ...f, view: v }))}
                className={cn(
                  "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors",
                  filter.view === v ? "border-red-600 bg-red-600 text-white" : "border-field bg-ink-2 text-chalk-dim hover:text-chalk",
                )}
              >
                {v === "open" || v === "all" ? t(`finance.views.${v}`) : t(paymentStatusKey(v))}
                <span className={cn("tnum rounded-full px-1.5 text-xs", filter.view === v ? "bg-white/20" : "bg-ink-3 text-chalk-faint")}>{counts[v]}</span>
              </button>
            ))}
          </div>
        </div>
        {(list.data?.length ?? 0) >= LIMIT && <p className="text-xs text-amber">{t("finance.truncated", { n: LIMIT })}</p>}
      </div>

      {picked.length > 0 && (
        <div role="region" aria-label={t("finance.bulk.selected", { n: picked.length })} className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-[12px] border border-line-strong bg-ink-3 px-4 py-3 shadow-lg">
          <span className="me-2 text-sm font-semibold text-chalk">{t("finance.bulk.selected", { n: picked.length })}</span>
          {bulk ? (
            <span className="text-sm text-chalk-dim" aria-live="polite">
              {t("finance.bulk.running", bulk)}
            </span>
          ) : (
            <>
              <Button size="sm" onClick={() => void runBulk("check")} disabled={bulkTargets(picked, "check").ok.length === 0}>
                <ListChecks size={14} />
                {t("finance.bulk.check")}
              </Button>
              <Button size="sm" onClick={() => void runBulk("validate")} disabled={bulkTargets(picked, "validate").ok.length === 0}>
                <BadgeCheck size={14} />
                {t("finance.bulk.validate")}
              </Button>
              <Button size="sm" variant="primary" onClick={() => setModal({ kind: "pay", lines: bulkTargets(picked, "pay").ok })} disabled={bulkTargets(picked, "pay").ok.length === 0}>
                <Send size={14} />
                {t("finance.bulk.pay")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                <X size={14} />
                {t("finance.bulk.clear")}
              </Button>
            </>
          )}
        </div>
      )}

      {list.loading ? (
        <ListSkeleton />
      ) : list.error ? (
        <ErrorState onRetry={list.reload} />
      ) : shown.length === 0 ? (
        <Card>
          <EmptyState title={rows.length === 0 ? t("finance.empty") : t("admin.common.noMatch")} hint={rows.length === 0 ? t("finance.emptyHint") : t("admin.common.noMatchHint")} />
        </Card>
      ) : (
        <>
          <ResultsLive count={shown.length} />
          <ul className="space-y-2 lg:hidden">
            {shown.map((p) => (
              <li key={p.id}>
                <Card className="p-4 sm:p-4">
                  <div className="flex items-start gap-3">
                    <input type="checkbox" className="mt-1 h-4 w-4 accent-red-600" checked={selected.has(p.id)} onChange={() => toggle(p.id)} aria-label={t("finance.bulk.selectRow", { name: p.officialName })} />
                    <button type="button" onClick={() => setOpenId(p.id)} className="min-w-0 flex-1 text-start">
                      <span className="flex items-start justify-between gap-2">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-chalk">{p.officialName}</span>
                          <span className="block truncate text-xs text-chalk-faint">
                            {fmt.date(p.date)} · {p.home} – {p.away} · {t(roleKey[p.role])}
                          </span>
                        </span>
                        <span className="tnum shrink-0 text-sm font-semibold text-chalk">{money(p.total, p.currency)}</span>
                      </span>
                      <span className="mt-2 flex flex-wrap items-center gap-1.5">
                        <Badge tone={PAYMENT_TONE[p.status]}>{t(paymentStatusKey(p.status))}</Badge>
                        <ChecksDots p={p} />
                      </span>
                    </button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
          <Card padded={false} className="hidden lg:block">
            <div className="scroll-x">
              <table className="w-full border-collapse">
                <caption className="sr-only">{t("finance.tabs.payments")}</caption>
                <thead>
                  <tr className="border-b border-line">
                    <Th className="w-10">
                      <input type="checkbox" className="h-4 w-4 accent-red-600" checked={allPicked} onChange={toggleAll} aria-label={t("finance.bulk.selectAll")} />
                    </Th>
                    <Th>{t("finance.fields.date")}</Th>
                    <Th>{t("finance.fields.match")}</Th>
                    <Th>{t("finance.fields.official")}</Th>
                    <Th>{t("finance.fields.role")}</Th>
                    <Th className="text-end">{t("finance.fields.total")}</Th>
                    <Th>{t("finance.fields.checks")}</Th>
                    <Th>{t("finance.fields.status")}</Th>
                    <Th>
                      <span className="sr-only">{t("admin.common.actions")}</span>
                    </Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {shown.map((p) => (
                    <tr key={p.id} className={cn("cursor-pointer hover:bg-red-500/[0.03]", selected.has(p.id) && "bg-red-500/[0.05]")} onClick={() => setOpenId(p.id)}>
                      <Td>
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-red-600"
                          checked={selected.has(p.id)}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => toggle(p.id)}
                          aria-label={t("finance.bulk.selectRow", { name: p.officialName })}
                        />
                      </Td>
                      <Td className="tnum">{fmt.date(p.date)}</Td>
                      <Td>
                        <span className="block max-w-60 truncate">
                          {p.home} – {p.away}
                        </span>
                        <span className="block max-w-60 truncate text-xs text-chalk-faint">{competitionById.get(p.competitionId)?.name ?? p.competitionId}</span>
                      </Td>
                      <Td>
                        <span className="block max-w-48 truncate font-medium text-chalk">{p.officialName}</span>
                      </Td>
                      <Td>{t(roleKey[p.role])}</Td>
                      <Td className="tnum text-end font-semibold">{money(p.total, p.currency)}</Td>
                      <Td>
                        <ChecksDots p={p} />
                      </Td>
                      <Td>
                        <Badge tone={PAYMENT_TONE[p.status]}>{t(paymentStatusKey(p.status))}</Badge>
                      </Td>
                      <Td className="text-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={t("finance.actions.open", { name: p.officialName })}
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
        <PaymentPanel id={openId} tick={tick} onClose={() => setOpenId(null)} onAction={(kind, p) => setModal({ kind, lines: [p] })} onChanged={list.reload} />
      )}
      {modal?.kind === "adjust" && <AdjustDialog payment={modal.lines[0]} onClose={() => setModal(null)} onDone={() => done("adjust")} />}
      {modal?.kind === "resolve" && <ResolveDialog payment={modal.lines[0]} onClose={() => setModal(null)} onDone={() => done("resolve")} />}
      {modal?.kind === "cancel" && <CancelDialog payment={modal.lines[0]} onClose={() => setModal(null)} onDone={() => done("cancel")} />}
      {modal?.kind === "pay" && (
        <PayDialog
          lines={modal.lines}
          onClose={() => setModal(null)}
          onDone={({ ok, failed }) => {
            setModal(null);
            if (modal.lines.length === 1) toast.push("success", t("finance.toast.paid"));
            else toast.push(failed ? "error" : "success", t("finance.bulk.done", { ok, failed, skipped: picked.length - modal.lines.length }));
            setSelected(new Set());
            refresh();
          }}
        />
      )}
    </div>
  );
}

/** The three checks as three dots, with the count for screen readers. */
function ChecksDots({ p }: { p: Payment }) {
  const t = useT();
  const done = CHECKS.filter((c) => p[c]).length;
  return (
    <span className="inline-flex items-center gap-1" title={CHECKS.map((c) => `${p[c] ? "✓" : "·"} ${t(`finance.checks.${c}`)}`).join("\n")}>
      {CHECKS.map((c) => (
        <span key={c} aria-hidden className={cn("h-2 w-2 rounded-full", p[c] ? "bg-pitch" : "bg-ink-3 ring-1 ring-line-strong")} />
      ))}
      <span className="sr-only">{t("finance.checks.done", { n: done })}</span>
    </span>
  );
}
