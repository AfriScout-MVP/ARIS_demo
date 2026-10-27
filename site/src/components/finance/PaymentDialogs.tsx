"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, BadgeCheck, Banknote, Check, FileText, Pencil, Send, Trash2, X } from "@/components/icons/glyphs";
import { Badge, Button } from "@/components/ui";
import { Dialog } from "@/components/admin/Dialog";
import { FormError, SelectField, Switch, TextAreaField, TextField } from "@/components/admin/fields";
import { ErrorState, Skeleton } from "@/components/admin/states";
import { mediaSrc } from "@/lib/api/admin";
import {
  adjustPayment,
  cancelPayment,
  getPayment,
  payPayment,
  resolvePayment,
  validatePayment,
  type CheckField,
  type MoneyField,
  type Payment,
} from "@/lib/api/finance";
import { useAction, useResource } from "@/lib/admin/hooks";
import { CHECKS, checkKey, MONEY, moneyKey, PAYMENT_TONE, paymentActions, paymentStatusKey, totalsByCurrency, totalWith } from "@/lib/finance/rules";
import { competitionById, refereeHref, roleKey } from "@/lib/store";
import { useFormatters, useT } from "@/lib/i18n/LocaleProvider";
import { useToast } from "@/lib/toast/ToastProvider";
import { cn } from "@/lib/utils";

/** "12 500 XOF" in the reader's number format. */
export function useMoney() {
  const fmt = useFormatters();
  return (n: number, currency: string) => `${fmt.number(n)} ${currency}`;
}

function Footer({ busy, onClose, submit, danger = false, disabled = false }: { busy: boolean; onClose: () => void; submit: string; danger?: boolean; disabled?: boolean }) {
  const t = useT();
  return (
    <>
      <Button type="button" onClick={onClose} disabled={busy}>
        {t("common.cancel")}
      </Button>
      <Button type="submit" variant={danger ? "danger" : "primary"} disabled={busy || disabled}>
        {busy ? t("admin.common.working") : submit}
      </Button>
    </>
  );
}

const isWhole = (s: string) => /^\d{1,9}$/.test(s.trim());
const isoDay = (ts: string | null) => (ts ? ts.slice(0, 10) : "");

/* ------------------------------------------------------------- the line */

export type PaymentModal = "adjust" | "pay" | "resolve" | "cancel";

/** One line: what it pays, the three checks, the receipts, and what can be done to it now. */
export function PaymentPanel({
  id,
  tick,
  onClose,
  onAction,
  onChanged,
}: {
  id: string;
  tick: number;
  onClose: () => void;
  onAction: (kind: PaymentModal, p: Payment) => void;
  onChanged: () => void;
}) {
  const t = useT();
  const fmt = useFormatters();
  const money = useMoney();
  const toast = useToast();
  const detail = useResource(`payment|${id}|${tick}`, (signal) => getPayment(id, signal));
  const check = useAction();
  const validate = useAction();
  const p = detail.data;
  const actions = p ? paymentActions(p) : [];

  async function toggle(field: CheckField, value: boolean) {
    const res = await check.run(() => adjustPayment(id, { [field]: value }));
    if (res.ok) {
      toast.push("success", t("finance.toast.checked"));
      detail.reload();
      onChanged();
    }
  }

  async function doValidate() {
    const res = await validate.run(() => validatePayment(id));
    if (res.ok) {
      toast.push("success", t("finance.toast.validated"));
      detail.reload();
      onChanged();
    }
  }

  return (
    <Dialog
      size="lg"
      title={p ? `${p.home} – ${p.away}` : t("admin.common.loading")}
      description={p ? `${fmt.longDate(p.date)}${p.city ? ` · ${p.city}` : ""} · ${competitionById.get(p.competitionId)?.name ?? p.competitionId}` : undefined}
      onClose={onClose}
      busy={check.busy || validate.busy}
    >
      {detail.loading ? (
        <div className="space-y-3" aria-busy>
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : detail.error || !p ? (
        <ErrorState onRetry={detail.reload} />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={PAYMENT_TONE[p.status]}>{t(paymentStatusKey(p.status))}</Badge>
            <Badge tone="neutral">{t(roleKey[p.role])}</Badge>
            <Link href={refereeHref(p.officialId)} className="text-sm font-semibold text-chalk underline-offset-2 hover:underline">
              {p.officialName}
            </Link>
          </div>

          {actions.some((a) => a !== "check") && (
            <div className="flex flex-wrap gap-2">
              {actions.includes("validate") && (
                <Button variant="primary" onClick={() => void doValidate()} disabled={validate.busy}>
                  <BadgeCheck size={15} />
                  {validate.busy ? t("admin.common.working") : t("finance.actions.validate")}
                </Button>
              )}
              {actions.includes("pay") && (
                <Button variant="primary" onClick={() => onAction("pay", p)}>
                  <Send size={15} />
                  {t("finance.actions.pay")}
                </Button>
              )}
              {actions.includes("resolve") && (
                <Button variant="primary" onClick={() => onAction("resolve", p)}>
                  <Check size={15} />
                  {t("finance.actions.resolve")}
                </Button>
              )}
              {actions.includes("adjust") && (
                <Button onClick={() => onAction("adjust", p)}>
                  <Pencil size={15} />
                  {t("finance.actions.adjust")}
                </Button>
              )}
              {actions.includes("cancel") && (
                <Button variant="danger" onClick={() => onAction("cancel", p)}>
                  <Trash2 size={15} />
                  {t("finance.actions.cancel")}
                </Button>
              )}
            </div>
          )}
          <FormError error={validate.error ?? check.error} />

          {p.status === "contested" && p.contestNote && (
            <div role="status" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm">
              <p className="flex items-center gap-2 font-semibold text-chalk">
                <AlertTriangle size={15} className="text-card-red" />
                {t("finance.panel.contestNote")}
              </p>
              <p className="mt-1 whitespace-pre-line text-chalk-dim">{p.contestNote}</p>
            </div>
          )}
          {p.status === "paid" && (
            <p className="flex items-center gap-2 text-sm text-pitch">
              <Banknote size={15} />
              {t("finance.panel.paidOn", { date: fmt.date(isoDay(p.paidAt)), ref: p.paymentRef ?? "—" })}
            </p>
          )}
          {p.status === "validated" && p.validatedAt && <p className="text-sm text-chalk-dim">{t("finance.panel.validatedOn", { date: fmt.date(isoDay(p.validatedAt)) })}</p>}
          {(p.status === "paid" || p.status === "cancelled") && <p className="text-xs text-chalk-faint">{t("finance.panel.closed")}</p>}

          <div className="grid gap-5 sm:grid-cols-2">
            <section aria-labelledby="pay-breakdown">
              <h3 id="pay-breakdown" className="mb-2 text-sm font-semibold text-chalk">
                {t("finance.panel.breakdown")}
              </h3>
              <dl className="divide-y divide-line rounded-lg border border-line text-sm">
                {(["base", ...MONEY] as Array<"base" | MoneyField>).map((k) => (
                  <div key={k} className="flex items-center justify-between gap-3 px-3 py-2">
                    <dt className="text-chalk-dim">{t(k === "base" ? "finance.money.base" : moneyKey(k))}</dt>
                    <dd className={cn("tnum", p[k] === 0 ? "text-chalk-faint" : "text-chalk")}>
                      {k === "deduction" && p[k] > 0 ? "− " : ""}
                      {money(p[k], p.currency)}
                    </dd>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-3 bg-ink-3 px-3 py-2 font-semibold">
                  <dt className="text-chalk">{t("finance.money.total")}</dt>
                  <dd className="tnum text-chalk">{money(p.total, p.currency)}</dd>
                </div>
              </dl>
            </section>

            <section aria-labelledby="pay-checks">
              <h3 id="pay-checks" className="mb-1 text-sm font-semibold text-chalk">
                {t("finance.checks.title")}
              </h3>
              <p className="mb-2 text-xs text-chalk-faint">{t("finance.checks.hint")}</p>
              <ul className="space-y-2">
                {CHECKS.map((c) => (
                  <li key={c} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2">
                    <span className="flex items-center gap-2 text-sm text-chalk">
                      {p[c] ? <Check size={14} className="text-pitch" /> : <X size={14} className="text-chalk-faint" />}
                      {t(checkKey(c))}
                    </span>
                    <Switch checked={p[c]} disabled={!actions.includes("check") || check.busy} onChange={(v) => void toggle(c, v)} label={t(checkKey(c))} />
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <section aria-labelledby="pay-receipts">
            <h3 id="pay-receipts" className="mb-2 text-sm font-semibold text-chalk">
              {t("finance.panel.receipts")}
            </h3>
            {p.receipts.length === 0 ? (
              <p className="text-sm text-chalk-faint">{t("finance.panel.noReceipts")}</p>
            ) : (
              <ul className="space-y-1.5">
                {p.receipts.map((r) => (
                  <li key={r.id}>
                    <a href={mediaSrc(r.url) ?? r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-red-600 underline-offset-2 hover:underline dark:text-red-400">
                      <FileText size={14} />
                      {r.filename}
                      <span className="text-xs text-chalk-faint">· {fmt.date(isoDay(r.createdAt))}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Dialog>
  );
}

/* --------------------------------------------------------------- adjust */

export function AdjustDialog({ payment, onClose, onDone }: { payment: Payment; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const money = useMoney();
  const toast = useToast();
  const { busy, error, run } = useAction();
  const [values, setValues] = useState<Record<MoneyField, string>>(() => Object.fromEntries(MONEY.map((k) => [k, String(payment[k])])) as Record<MoneyField, string>);
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);

  const bad = MONEY.filter((k) => !isWhole(values[k]));
  const changed = MONEY.filter((k) => !bad.includes(k) && Number(values[k]) !== payment[k]);
  const patch = Object.fromEntries(changed.map((k) => [k, Number(values[k])])) as Partial<Record<MoneyField, number>>;
  const total = totalWith(payment, patch);
  const reasonBad = reason.trim().length < 3;

  async function submit() {
    setTried(true);
    if (bad.length || total < 0 || changed.length === 0 || reasonBad) return;
    const res = await run(() => adjustPayment(payment.id, { ...patch, reason: reason.trim() }));
    if (res.ok) {
      toast.push("success", t("finance.toast.adjusted"));
      onDone();
    }
  }

  return (
    <Dialog
      title={t("finance.adjust.title")}
      description={`${payment.officialName} · ${payment.home} – ${payment.away}`}
      onClose={onClose}
      onSubmit={() => void submit()}
      busy={busy}
      footer={<Footer busy={busy} onClose={onClose} submit={t("common.save")} />}
    >
      <div className="space-y-4">
        <p className="text-sm text-chalk-dim">{t("finance.adjust.hint")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {MONEY.map((k) => (
            <TextField
              key={k}
              label={`${t(moneyKey(k))} (${payment.currency})`}
              value={values[k]}
              inputMode="numeric"
              onChange={(v) => setValues((s) => ({ ...s, [k]: v }))}
              error={tried && bad.includes(k) ? t("finance.errors.amount") : undefined}
            />
          ))}
        </div>
        <p className={cn("rounded-lg border px-3 py-2 text-sm font-semibold tnum", total < 0 ? "border-red-500/30 bg-red-500/10 text-card-red" : "border-line bg-ink-3 text-chalk")} aria-live="polite">
          {total < 0 ? t("finance.adjust.negative") : t("finance.adjust.newTotal", { total: money(total, payment.currency) })}
        </p>
        <TextAreaField
          label={t("finance.adjust.reason")}
          value={reason}
          onChange={setReason}
          required
          hint={t("finance.adjust.reasonHint")}
          error={tried && reasonBad ? t("finance.errors.short") : undefined}
          maxLength={300}
        />
        {payment.status === "validated" && <p className="text-xs text-amber">{t("finance.adjust.sendsBack")}</p>}
        {tried && changed.length === 0 && !bad.length && <p className="text-xs text-chalk-faint">{t("finance.adjust.noChange")}</p>}
        <FormError error={error} />
      </div>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ pay */

/** Records one transfer for one line or for a whole selection; every line gets the same reference. */
export function PayDialog({ lines, onClose, onDone }: { lines: Payment[]; onClose: () => void; onDone: (r: { ok: number; failed: number }) => void }) {
  const t = useT();
  const money = useMoney();
  const { busy, error, run } = useAction();
  const [reference, setReference] = useState("");
  const [tried, setTried] = useState(false);
  const [progress, setProgress] = useState(0);
  const refBad = reference.trim().length < 3;
  const single = lines.length === 1;
  const totals = totalsByCurrency(lines)
    .map((x) => money(x.outstanding, x.currency))
    .join(" + ");

  async function submit() {
    setTried(true);
    if (refBad) return;
    const ref = reference.trim();
    if (single) {
      const res = await run(() => payPayment(lines[0].id, ref));
      if (res.ok) onDone({ ok: 1, failed: 0 });
      return;
    }
    let ok = 0;
    let failed = 0;
    await run(async () => {
      for (const [i, line] of lines.entries()) {
        try {
          await payPayment(line.id, ref);
          ok += 1;
        } catch {
          failed += 1;
        }
        setProgress(i + 1);
      }
    });
    onDone({ ok, failed });
  }

  return (
    <Dialog
      size="sm"
      title={single ? t("finance.pay.title") : t("finance.pay.bulkTitle", { n: lines.length })}
      description={single ? `${lines[0].officialName} · ${money(lines[0].total, lines[0].currency)}` : t("finance.pay.bulkHint", { total: totals })}
      onClose={onClose}
      onSubmit={() => void submit()}
      busy={busy}
      footer={
        <>
          <Button type="button" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? (single ? t("admin.common.working") : t("finance.bulk.running", { done: progress, total: lines.length })) : t("finance.pay.submit")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-chalk-dim">{t("finance.pay.hint")}</p>
        <TextField
          label={t("finance.pay.reference")}
          value={reference}
          onChange={setReference}
          required
          maxLength={80}
          autoComplete="off"
          hint={t("finance.pay.referenceHint")}
          error={tried && refBad ? t("finance.errors.short") : undefined}
        />
        <FormError error={error} />
      </div>
    </Dialog>
  );
}

/* -------------------------------------------------------------- resolve */

export function ResolveDialog({ payment, onClose, onDone }: { payment: Payment; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const toast = useToast();
  const { busy, error, run } = useAction();
  const [outcome, setOutcome] = useState<"due" | "cancelled">("due");
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const noteBad = note.trim().length < 3;

  async function submit() {
    setTried(true);
    if (noteBad) return;
    const res = await run(() => resolvePayment(payment.id, outcome, note.trim()));
    if (res.ok) {
      toast.push("success", t("finance.toast.resolved"));
      onDone();
    }
  }

  return (
    <Dialog
      title={t("finance.resolve.title")}
      description={`${payment.officialName} · ${payment.home} – ${payment.away}`}
      onClose={onClose}
      onSubmit={() => void submit()}
      busy={busy}
      footer={<Footer busy={busy} onClose={onClose} submit={t("finance.resolve.submit")} danger={outcome === "cancelled"} />}
    >
      <div className="space-y-4">
        <p className="text-sm text-chalk-dim">{t("finance.resolve.hint")}</p>
        {payment.contestNote && <blockquote className="border-s-2 border-red-500/50 ps-3 text-sm italic text-chalk-dim">{payment.contestNote}</blockquote>}
        <SelectField
          label={t("finance.resolve.outcome")}
          value={outcome}
          onChange={(v) => setOutcome(v as "due" | "cancelled")}
          options={[
            { value: "due", label: t("finance.resolve.keep") },
            { value: "cancelled", label: t("finance.resolve.drop") },
          ]}
        />
        <TextAreaField label={t("finance.resolve.note")} value={note} onChange={setNote} required maxLength={500} error={tried && noteBad ? t("finance.errors.short") : undefined} />
        <FormError error={error} />
      </div>
    </Dialog>
  );
}

/* --------------------------------------------------------------- cancel */

export function CancelDialog({ payment, onClose, onDone }: { payment: Payment; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const money = useMoney();
  const toast = useToast();
  const { busy, error, run } = useAction();
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const noteBad = note.trim().length < 3;

  async function submit() {
    setTried(true);
    if (noteBad) return;
    const res = await run(() => cancelPayment(payment.id, note.trim()));
    if (res.ok) {
      toast.push("success", t("finance.toast.cancelled"));
      onDone();
    }
  }

  return (
    <Dialog
      size="sm"
      title={t("finance.cancel.title")}
      description={`${payment.officialName} · ${money(payment.total, payment.currency)}`}
      onClose={onClose}
      onSubmit={() => void submit()}
      busy={busy}
      footer={<Footer busy={busy} onClose={onClose} submit={t("finance.cancel.submit")} danger />}
    >
      <div className="space-y-4">
        <p className="text-sm text-chalk-dim">{t("finance.cancel.hint")}</p>
        <TextAreaField label={t("finance.cancel.note")} value={note} onChange={setNote} required maxLength={300} error={tried && noteBad ? t("finance.errors.short") : undefined} />
        <FormError error={error} />
      </div>
    </Dialog>
  );
}
