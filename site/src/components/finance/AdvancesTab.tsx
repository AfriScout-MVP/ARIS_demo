"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlarmClock, Banknote, Plus } from "@/components/icons/glyphs";
import { Badge, Board, Button, Card, EmptyState, Td, Th } from "@/components/ui";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { Dialog } from "@/components/admin/Dialog";
import { FormError, TextAreaField, TextField } from "@/components/admin/fields";
import { OfficialPicker } from "@/components/admin/OfficialPicker";
import { ErrorState, ListSkeleton, ResultsLive } from "@/components/admin/states";
import { listCountries } from "@/lib/api/admin";
import { ADVANCE_STATUSES, decideAdvance, listAdvances, requestAdvance, type Advance, type AdvanceStatus } from "@/lib/api/finance";
import { useAction, useActor, useResource } from "@/lib/admin/hooks";
import { ADVANCE_NEXT, ADVANCE_TONE, advanceStatusKey, advanceTotals } from "@/lib/finance/rules";
import { refereeHref } from "@/lib/store";
import { useScope } from "@/lib/scope/ScopeProvider";
import { useFormatters, useT } from "@/lib/i18n/LocaleProvider";
import { useToast } from "@/lib/toast/ToastProvider";
import { cn } from "@/lib/utils";
import { useMoney } from "./PaymentDialogs";

type View = AdvanceStatus | "all";
type Decision = Exclude<AdvanceStatus, "requested">;

export function AdvancesTab() {
  const t = useT();
  const fmt = useFormatters();
  const money = useMoney();
  const toast = useToast();
  const { scope, matches, lockedTo } = useScope();
  const country = lockedTo ?? (scope.kind === "country" ? scope.code : undefined);

  const list = useResource(`advances|${country ?? ""}`, (signal) => listAdvances({ country }, signal));
  const [view, setView] = useState<View>("requested");
  const [creating, setCreating] = useState(false);
  const [deciding, setDeciding] = useState<{ a: Advance; status: Decision } | null>(null);

  const rows = useMemo(() => (list.data ?? []).filter((a) => matches(a.countryCode)), [list.data, matches]);
  const shown = useMemo(() => (view === "all" ? rows : rows.filter((a) => a.status === view)), [rows, view]);
  const totals = useMemo(() => advanceTotals(rows), [rows]);
  const count = (v: View) => (v === "all" ? rows.length : rows.filter((a) => a.status === v).length);
  const lead = totals[0];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid flex-1 grid-cols-2 gap-3 sm:max-w-xl">
          <Board tone={count("requested") ? "amber" : "chalk"} icon={AlarmClock} label={t("finance.advances.kpi.requested")} value={count("requested")} hint={lead ? money(lead.requested, lead.currency) : undefined} />
          <Board tone="var" icon={Banknote} label={t("finance.advances.kpi.outstanding")} value={lead ? money(lead.outstanding, lead.currency) : "—"} hint={t("finance.advances.kpi.outstandingHint")} />
        </div>
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Plus size={16} />
          {t("finance.advances.new")}
        </Button>
      </div>

      <div className="scroll-x -mx-4 px-4 lg:mx-0 lg:px-0">
        <div role="group" aria-label={t("finance.views.label")} className="flex w-max gap-1.5">
          {([...ADVANCE_STATUSES, "all"] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={cn(
                "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors",
                view === v ? "border-red-600 bg-red-600 text-white" : "border-field bg-ink-2 text-chalk-dim hover:text-chalk",
              )}
            >
              {v === "all" ? t("finance.views.all") : t(advanceStatusKey(v))}
              <span className={cn("tnum rounded-full px-1.5 text-xs", view === v ? "bg-white/20" : "bg-ink-3 text-chalk-faint")}>{count(v)}</span>
            </button>
          ))}
        </div>
      </div>

      {list.loading ? (
        <ListSkeleton />
      ) : list.error ? (
        <ErrorState onRetry={list.reload} />
      ) : shown.length === 0 ? (
        <Card>
          <EmptyState title={t("finance.advances.empty")} hint={t("finance.advances.emptyHint")} />
        </Card>
      ) : (
        <>
          <ResultsLive count={shown.length} />
          <Card padded={false}>
            <div className="scroll-x">
              <table className="w-full border-collapse">
                <caption className="sr-only">{t("finance.tabs.advances")}</caption>
                <thead>
                  <tr className="border-b border-line">
                    <Th>{t("finance.advances.fields.requestedAt")}</Th>
                    <Th>{t("finance.advances.fields.official")}</Th>
                    <Th className="text-end">{t("finance.advances.fields.amount")}</Th>
                    <Th>{t("finance.advances.fields.justification")}</Th>
                    <Th>{t("finance.advances.fields.status")}</Th>
                    <Th>
                      <span className="sr-only">{t("admin.common.actions")}</span>
                    </Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {shown.map((a) => (
                    <tr key={a.id}>
                      <Td className="tnum">{fmt.date(a.requestedAt.slice(0, 10))}</Td>
                      <Td>
                        <Link href={refereeHref(a.officialId)} className="font-medium text-chalk underline-offset-2 hover:underline">
                          {a.officialName}
                        </Link>
                      </Td>
                      <Td className="tnum text-end font-semibold">{money(a.amount, a.currency)}</Td>
                      <Td className="whitespace-normal">
                        <span className="line-clamp-2 max-w-md text-sm">{a.justification}</span>
                      </Td>
                      <Td>
                        <Badge tone={ADVANCE_TONE[a.status]}>{t(advanceStatusKey(a.status))}</Badge>
                      </Td>
                      <Td className="text-end">
                        <span className="inline-flex flex-wrap justify-end gap-1.5">
                          {ADVANCE_NEXT[a.status].map((s) => (
                            <Button key={s} size="sm" variant={s === "rejected" ? "danger" : s === ADVANCE_NEXT[a.status][0] ? "primary" : "secondary"} onClick={() => setDeciding({ a, status: s })}>
                              {t(`finance.advances.decide.${s}`)}
                            </Button>
                          ))}
                        </span>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {creating && (
        <AdvanceDialog
          country={lockedTo}
          onClose={() => setCreating(false)}
          onDone={() => {
            setCreating(false);
            setView("requested");
            list.reload();
          }}
        />
      )}
      {deciding && (
        <ConfirmDialog
          title={t(`finance.advances.confirm.${deciding.status}`, { amount: money(deciding.a.amount, deciding.a.currency), name: deciding.a.officialName })}
          confirmLabel={t(`finance.advances.decide.${deciding.status}`)}
          danger={deciding.status === "rejected"}
          perform={() => decideAdvance(deciding.a.id, deciding.status)}
          onCancel={() => setDeciding(null)}
          onDone={() => {
            toast.push("success", t("finance.advances.toast.decided", { status: t(advanceStatusKey(deciding.status)) }));
            setDeciding(null);
            list.reload();
          }}
        >
          <p className="text-sm text-chalk-dim">{deciding.a.justification}</p>
          <p className="mt-2 text-xs text-chalk-faint">{t("finance.advances.confirm.hint")}</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

/** Staff enter an advance for an official of their country (a referee asks from their own space). */
function AdvanceDialog({ country, onClose, onDone }: { country: string | null; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const toast = useToast();
  const actor = useActor();
  const { busy, error, run } = useAction();
  const countries = useResource("countries|active", (signal) => listCountries(false, signal), !country);
  const [officialId, setOfficialId] = useState("");
  const [amount, setAmount] = useState("");
  const [justification, setJustification] = useState("");
  const [tried, setTried] = useState(false);
  const amountBad = !/^\d{1,8}$/.test(amount.trim()) || Number(amount) < 1;
  const justBad = justification.trim().length < 5;

  async function submit() {
    setTried(true);
    if (!officialId || amountBad || justBad) return;
    const res = await run(() => requestAdvance({ officialId, amount: Number(amount), justification: justification.trim() }));
    if (res.ok) {
      toast.push("success", t("finance.advances.toast.requested"));
      onDone();
    }
  }

  return (
    <Dialog
      size="lg"
      title={t("finance.advances.form.title")}
      description={t("finance.advances.form.hint")}
      onClose={onClose}
      onSubmit={() => void submit()}
      busy={busy}
      footer={
        <>
          <Button type="button" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? t("admin.common.working") : t("finance.advances.form.submit")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <OfficialPicker
          value={officialId}
          onChange={setOfficialId}
          country={country ?? actor?.country ?? undefined}
          countries={countries.data}
          error={tried && !officialId ? t("admin.errors.pickOfficial") : undefined}
        />
        <TextField
          label={t("finance.advances.form.amount")}
          value={amount}
          onChange={setAmount}
          inputMode="numeric"
          required
          error={tried && amountBad ? t("finance.errors.amountPositive") : undefined}
        />
        <TextAreaField
          label={t("finance.advances.form.justification")}
          value={justification}
          onChange={setJustification}
          required
          maxLength={500}
          hint={t("finance.advances.form.justificationHint")}
          error={tried && justBad ? t("finance.errors.justification") : undefined}
        />
        <FormError error={error} />
      </div>
    </Dialog>
  );
}
