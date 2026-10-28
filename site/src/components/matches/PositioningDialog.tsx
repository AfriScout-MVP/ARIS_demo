"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { Dialog } from "@/components/admin/Dialog";
import { fieldMessage, FormError, TextAreaField, TextField } from "@/components/admin/fields";
import { recordPositioning } from "@/lib/api/positioning";
import { useAction } from "@/lib/admin/hooks";
import {
  PHYSICAL_FIELDS,
  positioningValues,
  toPositioningBody,
  validatePositioning,
  type PositioningErrors,
  type PositioningField,
  type PositioningValues,
} from "@/lib/matches/positioning";
import type { MatchRecord } from "@/lib/store/types";
import { useT, type TKey } from "@/lib/i18n/LocaleProvider";
import { useToast } from "@/lib/toast/ToastProvider";

const FIELD_LABEL: Record<(typeof PHYSICAL_FIELDS)[number], TKey> = {
  distanceKm: "positioning.distance",
  sprints: "positioning.sprints",
  topSpeed: "positioning.topSpeed",
  avgDistanceToBall: "positioning.avgDistanceToBall",
  diagonalAdherence: "positioning.diagonal",
};
const FIELD_UNIT: Partial<Record<(typeof PHYSICAL_FIELDS)[number], TKey>> = {
  distanceKm: "positioning.km",
  topSpeed: "positioning.kmh",
  avgDistanceToBall: "positioning.metres",
};

/** Records a match's positioning by hand, when there is no tracking feed: physical load, heat points, pressure, weather. */
export function PositioningDialog({ match, title, onClose, onDone }: { match: MatchRecord; title: string; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const toast = useToast();
  const { busy, error, run } = useAction();
  const [values, setValues] = useState<PositioningValues>(() => positioningValues(match));
  const [errors, setErrors] = useState<PositioningErrors>({});

  const set = <K extends PositioningField>(key: K, value: PositioningValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };
  const msg = (f: PositioningField) => fieldMessage(t, errors, {}, f);

  async function submit() {
    const found = validatePositioning(values);
    setErrors(found);
    if (Object.values(found).some(Boolean)) return;
    const res = await run(() => recordPositioning(match.id, match.refereeId, toPositioningBody(values)));
    if (res.ok) {
      toast.push("success", t("positioning.form.saved"));
      onDone();
    }
  }

  return (
    <Dialog
      size="lg"
      title={t("positioning.form.title")}
      description={title}
      onClose={onClose}
      onSubmit={() => void submit()}
      busy={busy}
      footer={
        <>
          <Button type="button" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? t("admin.common.working") : t("positioning.form.submit")}
          </Button>
        </>
      }
    >
      <FormError error={error} />

      <fieldset className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <legend className="col-span-full mb-1 text-xs font-semibold text-chalk-dim">{t("positioning.metrics")}</legend>
        {PHYSICAL_FIELDS.map((f) => (
          <TextField
            key={f}
            label={t(FIELD_LABEL[f])}
            hint={FIELD_UNIT[f] ? t(FIELD_UNIT[f]!) : undefined}
            inputMode="decimal"
            value={values[f]}
            onChange={(v) => set(f, v)}
            error={msg(f)}
          />
        ))}
      </fieldset>

      <TextAreaField
        label={t("positioning.form.heat")}
        hint={t("positioning.form.heatHint")}
        value={values.heat}
        onChange={(v) => set("heat", v)}
        rows={4}
        error={msg("heat")}
      />

      <TextAreaField
        label={t("positioning.form.timeline")}
        hint={t("positioning.form.timelineHint")}
        value={values.timeline}
        onChange={(v) => set("timeline", v)}
        rows={4}
        error={msg("timeline")}
      />

      <fieldset className="grid grid-cols-3 gap-3">
        <legend className="col-span-full mb-1 text-xs font-semibold text-chalk-dim">{t("positioning.form.weather")}</legend>
        <TextField
          className="col-span-3 sm:col-span-1"
          label={t("positioning.form.condition")}
          value={values.weatherCondition}
          onChange={(v) => set("weatherCondition", v)}
          maxLength={40}
          error={msg("weatherCondition")}
        />
        <TextField label={t("positioning.form.temperature")} inputMode="decimal" value={values.temperature} onChange={(v) => set("temperature", v)} error={msg("temperature")} />
        <TextField label={t("positioning.form.humidity")} inputMode="decimal" value={values.humidity} onChange={(v) => set("humidity", v)} error={msg("humidity")} />
      </fieldset>
    </Dialog>
  );
}
