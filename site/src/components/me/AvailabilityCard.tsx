"use client";

import { useState } from "react";
import { CalendarOff, Trash2 } from "@/components/icons/glyphs";
import { Badge, Button, Card, CardHeader } from "@/components/ui";
import { FormError, SelectField, TextField } from "@/components/admin/fields";
import { declareDays, listDeclaredDays, withdrawDay, type DayReason, type DayState, type DeclaredDay } from "@/lib/api/me";
import { useAction, useResource } from "@/lib/admin/hooks";
import { canWithdrawDay, datesBetween, shiftDay } from "@/lib/me/rules";
import { useFormatters, useT } from "@/lib/i18n/LocaleProvider";
import { useToast } from "@/lib/toast/ToastProvider";
import { CardError, CardSkeleton, Nothing } from "./CardStates";

const isoToday = () => new Date().toISOString().slice(0, 10);

const STATE_KEY = { unavailable: "me.stateUnavailable", travelling: "me.stateTravelling", resting: "me.stateResting" } as const;
const REASON_KEY = { leave: "me.reasonLeave", work: "me.reasonWork", injury: "me.reasonInjury", other: "me.reasonOther" } as const;
const STATE_TONE = { unavailable: "red", travelling: "var", resting: "amber" } as const;

/** Days off: declare a range, see what is on file for the year ahead, take a day back. */
export function AvailabilityCard({ officialId }: { officialId: string }) {
  const t = useT();
  const fmt = useFormatters();
  const toast = useToast();
  const today = isoToday();
  const [tick, setTick] = useState(0);
  const list = useResource(`my-days|${officialId}|${tick}`, (signal) => listDeclaredDays(officialId, today, shiftDay(today, 365), signal));
  const save = useAction();
  const remove = useAction();
  const [removing, setRemoving] = useState<string | null>(null);

  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [state, setState] = useState<DayState>("unavailable");
  const [reason, setReason] = useState<DayReason>("leave");
  const rangeBad = !from || !to || to < from || from < today;

  async function declare(e: React.FormEvent) {
    e.preventDefault();
    if (rangeBad) return;
    const dates = datesBetween(from, to);
    const res = await save.run(() => declareDays(officialId, { dates, state, reason: state === "unavailable" ? reason : undefined }));
    if (res.ok) {
      toast.push("success", t("me.declared", { n: res.value.declared }));
      if (res.value.conflicts.length) toast.push("error", t("me.clash", { n: res.value.conflicts.length }));
      setTick((n) => n + 1);
    }
  }

  async function withdraw(day: DeclaredDay) {
    setRemoving(day.date);
    const res = await remove.run(() => withdrawDay(officialId, day.date));
    setRemoving(null);
    if (res.ok) {
      toast.push("success", t("selfService.availability.withdrawn", { date: fmt.longDate(day.date) }));
      setTick((n) => n + 1);
    }
  }

  return (
    <Card>
      <CardHeader title={t("me.availability")} subtitle={t("selfService.availability.hint")} icon={CalendarOff} tint="slate" />
      <form onSubmit={(e) => void declare(e)} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
        <TextField
          type="date"
          label={t("me.from")}
          required
          value={from}
          min={today}
          onChange={(v) => {
            setFrom(v);
            if (v > to) setTo(v);
          }}
        />
        <TextField type="date" label={t("me.to")} required value={to} min={from} onChange={setTo} error={to < from ? t("selfService.availability.rangeBad") : undefined} />
        <SelectField
          label={t("me.state")}
          value={state}
          onChange={(v) => setState(v as DayState)}
          options={(Object.keys(STATE_KEY) as DayState[]).map((s) => ({ value: s, label: t(STATE_KEY[s]) }))}
        />
        <SelectField
          label={t("me.reason")}
          value={reason}
          disabled={state !== "unavailable"}
          onChange={(v) => setReason(v as DayReason)}
          options={(Object.keys(REASON_KEY) as DayReason[]).map((r) => ({ value: r, label: t(REASON_KEY[r]) }))}
        />
        <Button type="submit" variant="primary" disabled={save.busy || rangeBad} aria-busy={save.busy}>
          {save.busy ? t("admin.common.working") : t("me.declare")}
        </Button>
      </form>
      <FormError error={save.error} />

      <h3 className="mb-2 mt-5 text-sm font-semibold text-chalk">{t("selfService.availability.onFile")}</h3>
      {list.loading ? (
        <CardSkeletonRows />
      ) : list.error || !list.data ? (
        <CardError title={t("selfService.availability.onFile")} error={list.error} onRetry={list.reload} />
      ) : list.data.length === 0 ? (
        <Nothing>{t("selfService.availability.none")}</Nothing>
      ) : (
        <ul className="divide-y divide-line">
          {list.data.map((d) => (
            <li key={d.date} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="text-sm text-chalk">{fmt.longDate(d.date)}</span>
                <Badge tone={STATE_TONE[d.state]}>{t(STATE_KEY[d.state])}</Badge>
                {d.reason && <span className="text-xs text-chalk-faint">{t(REASON_KEY[d.reason])}</span>}
              </div>
              {canWithdrawDay(d.date, today) && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={remove.busy}
                  aria-label={t("selfService.availability.withdrawFor", { date: fmt.longDate(d.date) })}
                  onClick={() => void withdraw(d)}
                >
                  <Trash2 size={14} />
                  {removing === d.date ? t("admin.common.working") : t("selfService.availability.withdraw")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <FormError error={remove.error} />
    </Card>
  );
}

/** Placeholder rows inside a card that is already showing its header. */
function CardSkeletonRows() {
  return <CardSkeleton title="" rows={2} />;
}
