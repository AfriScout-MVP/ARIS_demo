"use client";

import { useState } from "react";
import { Plane } from "@/components/icons/glyphs";
import { Badge, Button, Card, CardHeader } from "@/components/ui";
import { FormError, SelectField, TextAreaField, TextField } from "@/components/admin/fields";
import { listAdvances, requestAdvance } from "@/lib/api/finance";
import { useAction, useResource } from "@/lib/admin/hooks";
import { ADVANCE_TONE, advanceStatusKey } from "@/lib/finance/rules";
import { useFormatters, useT } from "@/lib/i18n/LocaleProvider";
import { useToast } from "@/lib/toast/ToastProvider";
import { useMoney } from "./PaymentDialogs";

/** A referee's own advances, and the form to ask for one before a trip. */
export function MyAdvances({ trips }: { trips: Array<{ fixtureId: string; label: string }> }) {
  const t = useT();
  const fmt = useFormatters();
  const money = useMoney();
  const toast = useToast();
  const [tick, setTick] = useState(0);
  const list = useResource(`my-advances|${tick}`, (signal) => listAdvances({}, signal));
  const { busy, error, run, reset } = useAction();
  const [open, setOpen] = useState(false);
  const [fixtureId, setFixtureId] = useState("");
  const [amount, setAmount] = useState("");
  const [justification, setJustification] = useState("");
  const [tried, setTried] = useState(false);
  const amountBad = !/^\d{1,8}$/.test(amount.trim()) || Number(amount) < 1;
  const justBad = justification.trim().length < 5;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    if (amountBad || justBad) return;
    const res = await run(() => requestAdvance({ amount: Number(amount), justification: justification.trim(), ...(fixtureId ? { fixtureId } : {}) }));
    if (res.ok) {
      toast.push("success", t("finance.advances.toast.requested"));
      setOpen(false);
      setAmount("");
      setJustification("");
      setFixtureId("");
      setTried(false);
      setTick((n) => n + 1);
    }
  }

  const rows = list.data ?? [];
  return (
    <Card>
      <CardHeader
        title={t("finance.mine.title")}
        subtitle={t("finance.mine.hint")}
        icon={Plane}
        tint="var"
        action={
          !open ? (
            <Button size="sm" onClick={() => setOpen(true)}>
              {t("finance.mine.request")}
            </Button>
          ) : undefined
        }
      />
      {open && (
        <form onSubmit={(e) => void submit(e)} className="mb-4 space-y-3 rounded-[10px] border border-line bg-ink-1 p-3">
          {trips.length > 0 && (
            <SelectField
              label={t("finance.fields.match")}
              value={fixtureId}
              onChange={setFixtureId}
              placeholder="—"
              options={trips.map((x) => ({ value: x.fixtureId, label: x.label }))}
            />
          )}
          <TextField label={t("finance.advances.form.amount")} value={amount} onChange={setAmount} inputMode="numeric" required error={tried && amountBad ? t("finance.errors.amountPositive") : undefined} />
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
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              onClick={() => {
                setOpen(false);
                reset();
              }}
              disabled={busy}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? t("admin.common.working") : t("finance.mine.submit")}
            </Button>
          </div>
        </form>
      )}
      {!list.data ? null : rows.length === 0 ? (
        <p className="text-sm text-chalk-dim">{t("finance.mine.empty")}</p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-chalk">{money(a.amount, a.currency)}</p>
                <p className="line-clamp-1 text-xs text-chalk-dim">
                  {fmt.date(a.requestedAt.slice(0, 10))} · {a.justification}
                </p>
              </div>
              <Badge tone={ADVANCE_TONE[a.status]}>{t(advanceStatusKey(a.status))}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
