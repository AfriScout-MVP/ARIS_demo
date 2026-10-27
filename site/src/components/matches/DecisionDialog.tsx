"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { Dialog } from "@/components/admin/Dialog";
import { fieldMessage, FormError, SelectField, Switch, TextAreaField, TextField } from "@/components/admin/fields";
import { listEventTypes, logDecision } from "@/lib/api/assessments";
import type { EventType } from "@/lib/store/types";
import { useAction, useResource } from "@/lib/admin/hooks";
import {
  emptyDecision,
  finalCallOptions,
  toDecisionBody,
  validateDecision,
  withEventType,
  withSubEvent,
  type DecisionErrors,
  type DecisionField,
  type DecisionValues,
} from "@/lib/matches/decisions";
import { eventTypeLabel, resolveEventFlow, subEventLabel, outcomeLabel } from "@/lib/matches/eventTypes";
import { useLocale, useT } from "@/lib/i18n/LocaleProvider";
import { useToast } from "@/lib/toast/ToastProvider";

/** Logs one refereeing decision of a played match: event → sub-event → outcome, whether the VAR looked at it, what stood. */
export function DecisionDialog({ matchId, title, onClose, onDone }: { matchId: string; title: string; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const { locale } = useLocale();
  const toast = useToast();
  const { busy, error, serverFields, run } = useAction();
  const { data: eventTypes, loading: taxonomyLoading } = useResource("event-types", (signal) => listEventTypes(signal));
  const [values, setValues] = useState<DecisionValues>(emptyDecision());
  // the taxonomy arrives after the first render; seed the event/sub-event/outcome fields the moment it does,
  // the once-only way React recommends for state derived from data that just loaded (not an effect: see react-hooks/set-state-in-effect)
  const [seededWith, setSeededWith] = useState<EventType[] | null>(null);
  if (eventTypes && !seededWith) {
    setSeededWith(eventTypes);
    setValues(emptyDecision(eventTypes));
  }
  const ready = !!seededWith;
  const [errors, setErrors] = useState<DecisionErrors>({});

  const types = eventTypes ?? [];
  const flow = resolveEventFlow(types, values.eventType, values.subEvent || undefined, values.outcome || undefined);

  const set = <K extends DecisionField>(key: K, value: DecisionValues[K]) => {
    setValues((v) => ({ ...v, [key]: value, ...(key === "varReview" && !value ? { finalCall: "confirmed" as const } : {}) }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };
  const msg = (f: DecisionField) => fieldMessage(t, errors, serverFields, f);

  async function submit() {
    const found = validateDecision(types, values);
    setErrors(found);
    if (Object.values(found).some(Boolean)) return;
    const res = await run(() => logDecision(matchId, toDecisionBody(values, locale)));
    if (res.ok) {
      toast.push("success", t("matchReview.log.done", { minute: values.minute.trim() }));
      onDone();
    }
  }

  return (
    <Dialog
      size="md"
      title={t("matchReview.log.title")}
      description={title}
      onClose={onClose}
      onSubmit={() => void submit()}
      busy={busy}
      footer={
        <>
          <Button type="button" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" variant="primary" disabled={busy || !ready}>
            {busy ? t("admin.common.working") : t("matchReview.log.submit")}
          </Button>
        </>
      }
    >
      <FormError error={error} />
      <TextField label={t("matchReview.minute")} inputMode="numeric" value={values.minute} onChange={(v) => set("minute", v)} maxLength={3} error={msg("minute")} required autoFocus />

      <fieldset className="grid gap-3">
        <legend className="mb-1 text-xs font-semibold text-chalk-dim">{t("matchReview.log.flow")}</legend>
        <SelectField
          label={t("matchReview.log.eventType")}
          value={values.eventType}
          onChange={(v) => setValues((cur) => withEventType(types, cur, v))}
          options={types.map((e) => ({ value: e.key, label: eventTypeLabel(types, e.key, locale) }))}
          placeholder={taxonomyLoading ? t("admin.common.loading") : undefined}
          disabled={taxonomyLoading}
          error={msg("eventType")}
          required
        />
        {flow.needsSubEvent && (
          <SelectField
            label={t("matchReview.log.subEvent")}
            value={values.subEvent}
            onChange={(v) => setValues((cur) => withSubEvent(types, cur, v))}
            options={flow.subEvents.map((s) => ({ value: s.key, label: subEventLabel(types, values.eventType, s.key, locale) }))}
            required
          />
        )}
        {flow.needsOutcome && (
          <SelectField
            label={t("matchReview.log.outcome")}
            value={values.outcome}
            onChange={(v) => set("outcome", v)}
            options={flow.outcomes.map((o) => ({ value: o.key, label: outcomeLabel(types, values.eventType, values.subEvent, o.key, locale) }))}
            required
          />
        )}
      </fieldset>

      <TextAreaField
        label={t("matchReview.log.description")}
        value={values.description}
        onChange={(v) => set("description", v)}
        rows={3}
        maxLength={300}
        hint={t("matchReview.log.descriptionHint")}
        error={msg("description")}
        required
      />
      <SelectField
        label={t("matchReview.initialCall")}
        value={values.initialCall}
        onChange={(v) => set("initialCall", v as DecisionValues["initialCall"])}
        options={[
          { value: "given", label: t("matchReview.given") },
          { value: "not-given", label: t("matchReview.notGiven") },
        ]}
      />
      {/* ds-allow-hardcode:start, pre-existing radius, unchanged by this edit */}
      <div className="flex items-center justify-between gap-4 rounded-[10px] border border-line bg-ink-1 px-3 py-2.5">
        <div>
          <p className="text-sm text-chalk">{t("matchReview.varReview")}</p>
          <p className="text-xs text-chalk-faint">{t("matchReview.log.varHint")}</p>
        </div>
        <Switch checked={values.varReview} onChange={(v) => set("varReview", v)} label={t("matchReview.varReview")} />
      </div>
      {/* ds-allow-hardcode:end */}
      {values.varReview && (
        <SelectField
          label={t("matchReview.finalCall")}
          value={values.finalCall}
          onChange={(v) => set("finalCall", v as DecisionValues["finalCall"])}
          options={finalCallOptions(true).map((c) => ({ value: c, label: t(c === "confirmed" ? "matchReview.confirmedCall" : "matchReview.overturnedCall") }))}
        />
      )}
      <fieldset>
        <legend className="mb-2 text-xs font-semibold text-chalk-dim">{t("matchReview.log.measures")}</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          <TextField label={`${t("matchReview.confidence")} (%)`} inputMode="decimal" value={values.confidence} onChange={(v) => set("confidence", v)} maxLength={5} error={msg("confidence")} />
          <TextField label={t("matchReview.pressure")} inputMode="decimal" value={values.pressureIndex} onChange={(v) => set("pressureIndex", v)} maxLength={5} error={msg("pressureIndex")} hint="0-100" />
          <TextField label={t("matchReview.log.distance")} inputMode="decimal" value={values.distance} onChange={(v) => set("distance", v)} maxLength={5} error={msg("distance")} />
        </div>
        <p className="mt-2 text-[11px] text-chalk-faint">{/* ds-allow-hardcode: pre-existing font size, unchanged by this edit */}{t("matchReview.log.measuresHint")}</p>
      </fieldset>
      <TextField
        label={t("matchReview.playersInvolved")}
        value={values.players}
        onChange={(v) => set("players", v)}
        maxLength={400}
        hint={t("matchReview.log.playersHint")}
        error={msg("players")}
      />
    </Dialog>
  );
}
