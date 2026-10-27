"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui";
import { Dialog } from "@/components/admin/Dialog";
import { fieldMessage, FormError, SelectField, Switch, TextAreaField, TextField } from "@/components/admin/fields";
import {
  createOfficial,
  DISCIPLINES,
  EDITABLE_STATUSES,
  OFFICIAL_LEVELS,
  updateOfficial,
  type Discipline,
  type OfficialFile,
} from "@/lib/api/officials";
import {
  emptyOfficial,
  fromFile,
  toCreateBody,
  toPatch,
  validateOfficial,
  type OfficialErrors,
  type OfficialField,
  type OfficialValues,
} from "@/lib/officials/forms";
import { isAdmin } from "@/lib/admin/actor";
import { useAction, useActor } from "@/lib/admin/hooks";
import { countries, countryName, today } from "@/lib/store";
import { cn } from "@/lib/utils";
import { useLocale, useT, type TKey } from "@/lib/i18n/LocaleProvider";
import { useToast } from "@/lib/toast/ToastProvider";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-4">
      <legend className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-chalk-faint">{title}</legend>
      {children}
    </fieldset>
  );
}

/**
 * Registers an official (no `file`) or edits one. An administrator chooses the country and may set the
 * registration number; a federation seat registers in its own country and gets the next number.
 */
export function OfficialDialog({
  file,
  defaultCountry,
  onClose,
  onDone,
}: {
  file?: OfficialFile;
  /** For a new file: the country the screen is scoped to. */
  defaultCountry?: string;
  onClose: () => void;
  onDone: (saved: OfficialFile) => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const toast = useToast();
  const actor = useActor();
  const admin = isAdmin(actor);
  const creating = !file;
  const { busy, error, serverFields, run } = useAction();
  const [values, setValues] = useState<OfficialValues>(() => (file ? fromFile(file) : emptyOfficial(admin ? (defaultCountry ?? "") : (actor?.country ?? ""))));
  const [errors, setErrors] = useState<OfficialErrors>({});
  const suspended = file?.status === "suspended";

  const set = <K extends keyof OfficialValues>(key: K, value: OfficialValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };
  const msg = (f: OfficialField) => fieldMessage(t, errors, serverFields, f);

  const countryOptions = useMemo(
    () =>
      countries
        .filter((c) => c.active)
        .map((c) => ({ value: c.code, label: countryName(c.code, locale) }))
        .sort((a, b) => a.label.localeCompare(b.label, locale)),
    [locale],
  );

  const toggleDiscipline = (d: Discipline) =>
    set("disciplines", values.disciplines.includes(d) ? values.disciplines.filter((x) => x !== d) : DISCIPLINES.filter((x) => x === d || values.disciplines.includes(x)));

  async function submit() {
    const found = validateOfficial(values, { creating, needsCountry: admin, today: today() });
    setErrors(found);
    if (Object.values(found).some(Boolean)) return;
    if (file) {
      const patch = toPatch(values, file);
      if (Object.keys(patch).length === 0) {
        toast.push("success", t("officials.dialog.unchanged"));
        onClose();
        return;
      }
      const res = await run(() => updateOfficial(file.id, patch));
      if (res.ok) {
        toast.push("success", t("officials.dialog.saved"));
        onDone(res.value);
      }
      return;
    }
    const res = await run(() => createOfficial(toCreateBody(values, { admin })));
    if (res.ok) {
      toast.push("success", t("officials.dialog.created", { name: res.value.name, matricule: res.value.matricule ?? "—" }));
      onDone(res.value);
    }
  }

  // "duplicate" is shared by several screens; here it means the registration or licence number
  const shown = error?.code === "duplicate" ? { ...error, key: "officials.errors.duplicate" as TKey } : error;

  return (
    <Dialog
      size="lg"
      title={file ? t("officials.dialog.editTitle", { name: file.name }) : t("officials.dialog.newTitle")}
      description={file ? (file.matricule ?? undefined) : t("officials.dialog.newHint")}
      onClose={onClose}
      onSubmit={() => void submit()}
      busy={busy}
      footer={
        <>
          <Button type="button" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? t("admin.common.working") : t(file ? "common.save" : "officials.dialog.create")}
          </Button>
        </>
      }
    >
      <FormError error={shown} />

      <Section title={t("officials.sections.identity")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label={t("officials.fields.name")} value={values.name} onChange={(v) => set("name", v)} error={msg("name")} required maxLength={120} autoComplete="off" />
          <SelectField
            label={t("officials.fields.kind")}
            value={values.kind}
            onChange={(v) => set("kind", v as OfficialValues["kind"])}
            disabled={!creating}
            options={[
              { value: "referee", label: t("officials.kinds.referee") },
              { value: "assistant", label: t("officials.kinds.assistant") },
            ]}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {creating && admin ? (
            <SelectField
              label={t("officials.fields.country")}
              value={values.countryCode}
              onChange={(v) => set("countryCode", v)}
              options={countryOptions}
              placeholder={t("officials.chooseCountry")}
              error={msg("countryCode")}
              required
            />
          ) : (
            <TextField label={t("officials.fields.country")} value={countryName(values.countryCode, locale)} onChange={() => {}} disabled />
          )}
          <TextField label={t("officials.fields.nationality")} value={values.nationality} onChange={(v) => set("nationality", v)} maxLength={60} />
          <TextField label={t("officials.fields.birthDate")} type="date" value={values.birthDate} onChange={(v) => set("birthDate", v)} error={msg("birthDate")} max={today()} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {creating ? (
            admin ? (
              <TextField
                label={t("officials.fields.matricule")}
                value={values.matricule}
                onChange={(v) => set("matricule", v)}
                error={msg("matricule")}
                hint={t("officials.hints.matricule")}
                maxLength={40}
                autoComplete="off"
              />
            ) : (
              <TextField label={t("officials.fields.matricule")} value="" placeholder={t("officials.hints.matriculeAuto")} onChange={() => {}} disabled />
            )
          ) : (
            <TextField label={t("officials.fields.matricule")} value={values.matricule} onChange={() => {}} disabled />
          )}
          <TextField label={t("officials.fields.licenceNo")} value={values.licenceNo} onChange={(v) => set("licenceNo", v)} error={msg("licenceNo")} maxLength={40} autoComplete="off" />
        </div>
      </Section>

      <Section title={t("officials.sections.career")}>
        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField
            label={t("officials.fields.level")}
            value={values.level}
            onChange={(v) => set("level", v as OfficialValues["level"])}
            options={OFFICIAL_LEVELS.map((l) => ({ value: l, label: l }))}
          />
          <SelectField
            label={t("officials.fields.status")}
            value={values.status}
            onChange={(v) => set("status", v as OfficialValues["status"])}
            disabled={suspended}
            hint={suspended ? t("officials.hints.suspended") : values.status === "retired" ? t("officials.hints.retired") : undefined}
            options={(suspended ? (["suspended"] as const) : EDITABLE_STATUSES).map((s) => ({ value: s, label: t(`officials.status.${s}`) }))}
          />
          <TextField
            label={t("officials.fields.yearsActive")}
            inputMode="numeric"
            value={values.yearsActive}
            onChange={(v) => set("yearsActive", v)}
            error={msg("yearsActive")}
            maxLength={2}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label={t("officials.fields.league")} value={values.league} onChange={(v) => set("league", v)} maxLength={120} />
          <div>
            <p className="mb-1.5 text-xs font-medium text-chalk-dim">{t("officials.fields.disciplines")}</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label={t("officials.fields.disciplines")}>
              {DISCIPLINES.map((d) => {
                const on = values.disciplines.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleDiscipline(d)}
                    className={cn(
                      "h-9 rounded-full border px-3 text-xs transition-colors",
                      on ? "border-pitch/50 bg-pitch/15 text-chalk" : "border-field bg-ink-2 text-chalk-faint hover:text-chalk",
                    )}
                  >
                    {t(`officials.disciplines.${d}`)}
                  </button>
                );
              })}
            </div>
            {msg("disciplines") && <p className="mt-1 text-xs text-card-red">{msg("disciplines")}</p>}
          </div>
        </div>
        <div className="flex items-start justify-between gap-4 rounded-[10px] border border-line bg-ink-1 px-3 py-2.5">
          <div>
            <p className="text-sm text-chalk">{t("officials.fields.varQualified")}</p>
            <p className="text-xs text-chalk-faint">{t("officials.hints.var")}</p>
          </div>
          <Switch checked={values.varQualified} onChange={(v) => set("varQualified", v)} label={t("officials.fields.varQualified")} />
        </div>
      </Section>

      <Section title={t("officials.sections.contact")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label={t("officials.fields.email")} type="email" value={values.email} onChange={(v) => set("email", v)} error={msg("email")} maxLength={200} autoComplete="off" />
          <TextField label={t("officials.fields.phone")} type="tel" value={values.phone} onChange={(v) => set("phone", v)} maxLength={40} autoComplete="off" />
          <TextField label={t("officials.fields.city")} value={values.city} onChange={(v) => set("city", v)} maxLength={80} />
          <TextField label={t("officials.fields.region")} value={values.region} onChange={(v) => set("region", v)} maxLength={80} />
        </div>
        <TextField label={t("officials.fields.zones")} value={values.zones} onChange={(v) => set("zones", v)} error={msg("zones")} hint={t("officials.hints.zones")} />
      </Section>

      <Section title={t("officials.sections.bio")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextAreaField label={t("officials.fields.bioFr")} value={values.bioFr} onChange={(v) => set("bioFr", v)} maxLength={1000} />
          <TextAreaField label={t("officials.fields.bioEn")} value={values.bioEn} onChange={(v) => set("bioEn", v)} maxLength={1000} />
          <TextAreaField label={t("officials.fields.bioEs")} value={values.bioEs} onChange={(v) => set("bioEs", v)} maxLength={1000} />
          <TextAreaField label={t("officials.fields.bioDe")} value={values.bioDe} onChange={(v) => set("bioDe", v)} maxLength={1000} />
        </div>
      </Section>
    </Dialog>
  );
}
