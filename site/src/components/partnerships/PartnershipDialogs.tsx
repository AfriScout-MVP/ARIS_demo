"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui";
import { Dialog } from "@/components/admin/Dialog";
import { fieldMessage, FormError, SelectField, TextAreaField, TextField } from "@/components/admin/fields";
import { PasswordField } from "@/components/admin/PasswordField";
import type { CountryRow, UiLocale, UserRow } from "@/lib/api/admin";
import {
  createPartnership,
  logPartnershipEvent,
  movePartnership,
  onboardPartnership,
  patchPartnership,
  type EventBody,
  type Partnership,
  type Stage,
} from "@/lib/api/partnerships";
import { MAX_PASSWORD, MIN_PASSWORD } from "@/lib/admin/constants";
import { hasErrors, type FormErrors } from "@/lib/admin/forms";
import { useAction } from "@/lib/admin/hooks";
import { countryLabel } from "@/lib/admin/labels";
import { isEmail, isFederationCode, isFilled, normalizeCode } from "@/lib/admin/validators";
import {
  detailsFrom,
  detailsPatch,
  emptyDetails,
  priorityKey,
  stageKey,
  toDetailsBody,
  validateDetails,
  type DetailsField,
  type DetailsValues,
} from "@/lib/partnerships/rules";
import { useLocale, useT } from "@/lib/i18n/LocaleProvider";
import { localeLabels, locales } from "@/locales";
import { useToast } from "@/lib/toast/ToastProvider";

const todayIso = () => new Date().toISOString().slice(0, 10);

function Footer({ busy, onClose, submit, danger = false }: { busy: boolean; onClose: () => void; submit: string; danger?: boolean }) {
  const t = useT();
  return (
    <>
      <Button type="button" onClick={onClose} disabled={busy}>
        {t("common.cancel")}
      </Button>
      <Button type="submit" variant={danger ? "danger" : "primary"} disabled={busy}>
        {busy ? t("admin.common.working") : submit}
      </Button>
    </>
  );
}

/* ------------------------------------------------------------- details */

export function PartnershipFormDialog({
  partnership,
  countries,
  admins,
  actorId,
  takenCountries,
  onClose,
  onDone,
}: {
  partnership?: Partnership;
  /** Every country in the list, active or not. */
  countries: CountryRow[];
  admins: UserRow[];
  actorId: string;
  /** Countries that already have a federation or a live relationship. */
  takenCountries: Set<string>;
  onClose: () => void;
  onDone: (p: Partnership) => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const toast = useToast();
  const { busy, error, serverFields, run } = useAction();
  const mode = partnership ? "edit" : "create";
  const [values, setValues] = useState<DetailsValues>(() => (partnership ? detailsFrom(partnership) : emptyDetails(actorId)));
  const [errors, setErrors] = useState<FormErrors<DetailsField>>({});
  const set = <K extends keyof DetailsValues>(key: K, value: DetailsValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };
  const msg = (f: DetailsField) => fieldMessage(t, errors, serverFields, f);

  const free = useMemo(
    () =>
      countries
        .filter((c) => !takenCountries.has(c.code))
        .sort((a, b) => countryLabel(a, locale).localeCompare(countryLabel(b, locale), locale)),
    [countries, takenCountries, locale],
  );

  function pickCountry(code: string) {
    set("country", code);
    const c = countries.find((x) => x.code === code);
    // propose a name the first time a country is picked; never overwrite what was typed
    if (c && !values.federationName.trim()) set("federationName", t("partnerships.form.defaultName", { country: countryLabel(c, locale) }));
  }

  async function submit() {
    const found = validateDetails(values, mode);
    setErrors(found);
    if (hasErrors(found)) return;
    const result = await run(async () => {
      if (!partnership) {
        const note = values.note.trim();
        return createPartnership({ ...toDetailsBody(values), country: values.country, ...(note ? { note } : {}) });
      }
      const patch = detailsPatch(partnership, values);
      return Object.keys(patch).length ? patchPartnership(partnership.id, patch) : partnership;
    });
    if (result.ok) {
      toast.push("success", t(partnership ? "partnerships.toast.updated" : "partnerships.toast.created", { name: values.federationName.trim() }));
      onDone(result.value);
    }
  }

  return (
    <Dialog
      size="lg"
      title={t(partnership ? "partnerships.form.editTitle" : "partnerships.form.newTitle")}
      description={t(partnership ? "partnerships.form.editHint" : "partnerships.form.newHint")}
      onClose={onClose}
      onSubmit={() => void submit()}
      busy={busy}
      footer={<Footer busy={busy} onClose={onClose} submit={t(partnership ? "common.save" : "partnerships.form.create")} />}
    >
      <fieldset className="space-y-4">
        <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-chalk-faint">{t("partnerships.form.federation")}</legend>
        {mode === "create" && (
          <SelectField
            label={t("partnerships.fields.country")}
            value={values.country}
            onChange={pickCountry}
            placeholder={t("partnerships.form.chooseCountry")}
            options={free.map((c) => ({ value: c.code, label: `${countryLabel(c, locale)} (${c.code})${c.active ? "" : ` · ${t("partnerships.form.inactive")}`}` }))}
            error={msg("country")}
            hint={free.length === 0 ? t("partnerships.form.noFreeCountry") : t("partnerships.form.countryHint")}
            required
          />
        )}
        <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
          <TextField label={t("partnerships.fields.federationName")} value={values.federationName} onChange={(v) => set("federationName", v)} error={msg("federationName")} required autoComplete="off" />
          <TextField
            label={t("partnerships.fields.federationCode")}
            value={values.federationCode}
            onChange={(v) => set("federationCode", v)}
            error={msg("federationCode")}
            hint={t("partnerships.form.codeHint")}
            maxLength={20}
            autoComplete="off"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField
            label={t("partnerships.fields.priority")}
            value={values.priority}
            onChange={(v) => set("priority", v as DetailsValues["priority"])}
            options={(["high", "normal", "low"] as const).map((p) => ({ value: p, label: t(priorityKey(p)) }))}
          />
          <SelectField
            label={t("partnerships.fields.owner")}
            value={values.ownerId}
            onChange={(v) => set("ownerId", v)}
            placeholder={t("partnerships.form.noOwner")}
            options={admins.map((a) => ({ value: a.id, label: a.id === actorId ? t("partnerships.form.me", { name: a.name }) : a.name }))}
          />
          <TextField
            label={t("partnerships.fields.officialsEstimate")}
            value={values.officialsEstimate}
            onChange={(v) => set("officialsEstimate", v)}
            error={msg("officialsEstimate")}
            inputMode="numeric"
            hint={t("partnerships.form.officialsHint")}
            autoComplete="off"
          />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-chalk-faint">{t("partnerships.form.contact")}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label={t("partnerships.fields.contactName")} value={values.contactName} onChange={(v) => set("contactName", v)} autoComplete="off" />
          <TextField label={t("partnerships.fields.contactRole")} value={values.contactRole} onChange={(v) => set("contactRole", v)} placeholder={t("partnerships.form.rolePlaceholder")} autoComplete="off" />
          <TextField label={t("partnerships.fields.contactEmail")} type="email" value={values.contactEmail} onChange={(v) => set("contactEmail", v)} error={msg("contactEmail")} autoComplete="off" />
          <TextField label={t("partnerships.fields.contactPhone")} type="tel" value={values.contactPhone} onChange={(v) => set("contactPhone", v)} error={msg("contactPhone")} placeholder="+221 33 000 00 00" autoComplete="off" />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-chalk-faint">{t("partnerships.form.followUp")}</legend>
        <div className="grid gap-4 sm:grid-cols-[1fr_11rem]">
          <TextField label={t("partnerships.fields.nextStep")} value={values.nextStep} onChange={(v) => set("nextStep", v)} placeholder={t("partnerships.form.nextStepPlaceholder")} autoComplete="off" />
          <TextField label={t("partnerships.fields.nextStepDue")} type="date" value={values.nextStepDue} onChange={(v) => set("nextStepDue", v)} error={msg("nextStepDue")} />
        </div>
        {mode === "create" && (
          <TextAreaField label={t("partnerships.fields.firstNote")} value={values.note} onChange={(v) => set("note", v)} maxLength={2000} hint={t("partnerships.form.noteHint")} />
        )}
      </fieldset>
      <FormError error={error} />
    </Dialog>
  );
}

/* --------------------------------------------------------------- stage */

export function StageDialog({ partnership, moves, onClose, onDone }: { partnership: Partnership; moves: Stage[]; onClose: () => void; onDone: (p: Partnership) => void }) {
  const t = useT();
  const toast = useToast();
  const { busy, error, run } = useAction();
  const [stage, setStage] = useState<Stage | "">(moves[0] ?? "");
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState(partnership.agreementReference ?? "");
  const [signedOn, setSignedOn] = useState(todayIso());
  const [problem, setProblem] = useState<"reason" | "reference" | "date" | null>(null);

  async function submit() {
    if (!stage) return;
    if (stage === "declined" && reason.trim().length < 3) return setProblem("reason");
    if (stage === "agreement_signed" && reference.trim().length < 2) return setProblem("reference");
    if (stage === "agreement_signed" && (!signedOn || signedOn > todayIso())) return setProblem("date");
    setProblem(null);
    const result = await run(() =>
      movePartnership(partnership.id, {
        stage,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
        ...(stage === "agreement_signed" ? { agreementReference: reference.trim(), agreementSignedOn: signedOn } : {}),
      }),
    );
    if (result.ok) {
      toast.push("success", t("partnerships.toast.moved", { name: partnership.federationName, stage: t(stageKey(stage)) }));
      onDone(result.value);
    }
  }

  return (
    <Dialog
      size="sm"
      title={t("partnerships.stage.title")}
      description={partnership.federationName}
      onClose={onClose}
      onSubmit={() => void submit()}
      busy={busy}
      footer={<Footer busy={busy} onClose={onClose} submit={t("partnerships.stage.submit")} danger={stage === "declined"} />}
    >
      <SelectField
        label={t("partnerships.stage.to")}
        value={stage}
        onChange={(v) => (setStage(v as Stage), setProblem(null))}
        options={moves.map((m) => ({ value: m, label: t(stageKey(m)) }))}
        hint={t("partnerships.stage.from", { stage: t(stageKey(partnership.stage)) })}
        required
      />
      {stage === "agreement_signed" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={t("partnerships.fields.agreementReference")}
            value={reference}
            onChange={setReference}
            error={problem === "reference" ? t("admin.errors.required") : undefined}
            required
            autoComplete="off"
          />
          <TextField
            label={t("partnerships.fields.agreementSignedOn")}
            type="date"
            value={signedOn}
            max={todayIso()}
            onChange={setSignedOn}
            error={problem === "date" ? t("partnerships.errors.future_date") : undefined}
            required
          />
        </div>
      )}
      <TextAreaField
        label={t(stage === "declined" ? "partnerships.stage.reasonRequired" : "partnerships.stage.reason")}
        value={reason}
        onChange={setReason}
        maxLength={1000}
        required={stage === "declined"}
        error={problem === "reason" ? t("partnerships.errors.reason_required") : undefined}
        hint={stage === "declined" ? t("partnerships.stage.declineHint") : undefined}
      />
      <FormError error={error} />
    </Dialog>
  );
}

/* ------------------------------------------------------------- logging */

const KINDS: Array<EventBody["kind"]> = ["call", "meeting", "email", "note"];

export function LogDialog({ partnership, onClose, onDone }: { partnership: Partnership; onClose: () => void; onDone: (p: Partnership) => void }) {
  const t = useT();
  const toast = useToast();
  const { busy, error, run } = useAction();
  const [kind, setKind] = useState<EventBody["kind"]>("call");
  const [body, setBody] = useState("");
  const [on, setOn] = useState(todayIso());
  const [nextStep, setNextStep] = useState(partnership.nextStep ?? "");
  const [due, setDue] = useState(partnership.nextStepDue ?? "");
  const [missing, setMissing] = useState(false);

  async function submit() {
    if (!isFilled(body)) return setMissing(true);
    const nextChanged = nextStep.trim() !== (partnership.nextStep ?? "") || due !== (partnership.nextStepDue ?? "");
    const result = await run(() =>
      logPartnershipEvent(partnership.id, {
        kind,
        body: body.trim(),
        occurredOn: on,
        ...(nextChanged ? { nextStep: nextStep.trim() || null, nextStepDue: due || null } : {}),
      }),
    );
    if (result.ok) {
      toast.push("success", t("partnerships.toast.logged"));
      onDone(result.value);
    }
  }

  return (
    <Dialog
      title={t("partnerships.log.title")}
      description={partnership.federationName}
      onClose={onClose}
      onSubmit={() => void submit()}
      busy={busy}
      footer={<Footer busy={busy} onClose={onClose} submit={t("partnerships.log.submit")} />}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label={t("partnerships.log.kind")} value={kind} onChange={(v) => setKind(v as EventBody["kind"])} options={KINDS.map((k) => ({ value: k, label: t(`partnerships.kinds.${k}`) }))} />
        <TextField label={t("partnerships.log.on")} type="date" value={on} max={todayIso()} onChange={setOn} required />
      </div>
      <TextAreaField
        label={t("partnerships.log.body")}
        value={body}
        onChange={(v) => (setBody(v), setMissing(false))}
        rows={4}
        maxLength={2000}
        required
        error={missing ? t("admin.errors.required") : undefined}
        placeholder={t("partnerships.log.bodyPlaceholder")}
      />
      <div className="grid gap-4 sm:grid-cols-[1fr_11rem]">
        <TextField label={t("partnerships.fields.nextStep")} value={nextStep} onChange={setNextStep} autoComplete="off" />
        <TextField label={t("partnerships.fields.nextStepDue")} type="date" value={due} onChange={setDue} />
      </div>
      <FormError error={error} />
    </Dialog>
  );
}

/* ---------------------------------------------------------- onboarding */

type OnboardField = "code" | "name" | "seatName" | "seatEmail" | "password";

export function OnboardDialog({
  partnership,
  country,
  onClose,
  onDone,
}: {
  partnership: Partnership;
  country: CountryRow | undefined;
  onClose: () => void;
  onDone: (p: Partnership) => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const toast = useToast();
  const { busy, error, serverFields, run } = useAction();
  const [code, setCode] = useState(partnership.federationCode ?? "");
  const [name, setName] = useState(partnership.federationName);
  const [seatName, setSeatName] = useState(partnership.contactName ?? "");
  const [seatEmail, setSeatEmail] = useState(partnership.contactEmail ?? "");
  const [seatLocale, setSeatLocale] = useState<UiLocale>(locale);
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FormErrors<OnboardField>>({});
  const msg = (f: OnboardField) => fieldMessage(t, errors, serverFields, f);
  const clear = (f: OnboardField) => setErrors((e) => ({ ...e, [f]: undefined }));

  async function submit() {
    const found: FormErrors<OnboardField> = {};
    if (!isFederationCode(normalizeCode(code))) found.code = isFilled(code) ? "admin.errors.federationCode" : "admin.errors.required";
    if (name.trim().length < 2) found.name = "admin.errors.required";
    if (!isFilled(seatName)) found.seatName = "admin.errors.required";
    if (!isEmail(seatEmail)) found.seatEmail = "admin.errors.emailInvalid";
    if (password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) found.password = "admin.errors.passwordShort";
    setErrors(found);
    if (hasErrors(found)) return;
    const result = await run(() =>
      onboardPartnership(partnership.id, {
        code: normalizeCode(code),
        name: name.trim(),
        seat: { name: seatName.trim(), email: seatEmail.trim().toLowerCase(), locale: seatLocale, password },
      }),
    );
    if (result.ok) {
      toast.push("success", t("partnerships.toast.onboarded", { code: normalizeCode(code) }));
      onDone(result.value.partnership);
    }
  }

  const countryName = countryLabel(country ?? { code: partnership.country, name: partnership.countryName, nameFr: partnership.countryNameFr }, locale, partnership.country);

  return (
    <Dialog
      size="lg"
      title={t("partnerships.onboard.title", { name: partnership.federationName })}
      description={t("partnerships.onboard.hint")}
      onClose={onClose}
      onSubmit={() => void submit()}
      busy={busy}
      footer={<Footer busy={busy} onClose={onClose} submit={t("partnerships.onboard.submit")} />}
    >
      <ul className="space-y-1.5 rounded-lg border border-line bg-ink-1 px-4 py-3 text-sm text-chalk-dim">
        <li>
          {partnership.countryActive ? t("partnerships.onboard.countryAlreadyActive", { country: countryName }) : t("partnerships.onboard.countryActivated", { country: countryName })}
        </li>
        <li>{t("partnerships.onboard.federationCreated", { reference: partnership.agreementReference ?? "—" })}</li>
        <li>{t("partnerships.onboard.seatCreated")}</li>
      </ul>
      <fieldset className="space-y-4">
        <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-chalk-faint">{t("partnerships.form.federation")}</legend>
        <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
          <TextField label={t("partnerships.fields.federationCode")} value={code} onChange={(v) => (setCode(v), clear("code"))} error={msg("code")} required maxLength={20} autoComplete="off" />
          <TextField label={t("partnerships.fields.federationName")} value={name} onChange={(v) => (setName(v), clear("name"))} error={msg("name")} required autoComplete="off" />
        </div>
      </fieldset>
      <fieldset className="space-y-4">
        <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-chalk-faint">{t("partnerships.onboard.seat")}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label={t("partnerships.onboard.seatName")} value={seatName} onChange={(v) => (setSeatName(v), clear("seatName"))} error={msg("seatName")} required autoComplete="off" />
          <TextField label={t("partnerships.onboard.seatEmail")} type="email" value={seatEmail} onChange={(v) => (setSeatEmail(v), clear("seatEmail"))} error={msg("seatEmail")} required autoComplete="off" />
        </div>
        <SelectField
          label={t("partnerships.onboard.seatLocale")}
          value={seatLocale}
          onChange={(v) => setSeatLocale(v as UiLocale)}
          options={locales.map((l) => ({ value: l, label: localeLabels[l] }))}
          hint={t("partnerships.onboard.seatLocaleHint")}
        />
        <PasswordField label={t("partnerships.onboard.password")} value={password} onChange={(v) => (setPassword(v), clear("password"))} error={msg("password")} />
        <p className="text-xs text-chalk-faint">{t("partnerships.onboard.passwordHint")}</p>
      </fieldset>
      <FormError error={error} />
    </Dialog>
  );
}
