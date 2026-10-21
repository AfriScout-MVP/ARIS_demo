"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { createCountry, patchCountry, type CountryRow } from "@/lib/api/admin";
import { ZONES } from "@/lib/admin/constants";
import {
  countryToValues,
  emptyCountry,
  hasErrors,
  toCreateCountryBody,
  toPatchCountryBody,
  validateCountry,
  type CountryField,
  type CountryValues,
  type FormErrors,
} from "@/lib/admin/forms";
import { useAction } from "@/lib/admin/hooks";
import { normalizeCode } from "@/lib/admin/validators";
import { useT } from "@/lib/i18n/LocaleProvider";
import { useToast } from "@/lib/toast/ToastProvider";
import { Dialog } from "./Dialog";
import { fieldMessage, FormError, SelectField, TextField } from "./fields";

const TIMEZONES_ID = "aris-timezones";

function africanTimeZones(): string[] {
  try {
    const all = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
    return all.filter((z) => z.startsWith("Africa/") || z === "UTC");
  } catch {
    return [];
  }
}

/** Create a supported country (optionally with its federation) or edit one. The code is the key and never changes. */
export function CountryFormDialog({ country, onClose, onDone }: { country?: CountryRow; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const toast = useToast();
  const { busy, error, serverFields, run } = useAction();
  const mode = country ? "edit" : "create";

  const [values, setValues] = useState<CountryValues>(country ? countryToValues(country) : emptyCountry);
  const [errors, setErrors] = useState<FormErrors<CountryField>>({});
  const [zones] = useState(africanTimeZones);

  const set = (key: keyof CountryValues, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };
  const msg = (field: CountryField) => fieldMessage(t, errors, serverFields, field);

  async function submit() {
    const found = validateCountry(values, mode);
    setErrors(found);
    if (hasErrors(found)) return;
    const result = await run(async () => {
      if (country) {
        const body = toPatchCountryBody(country, values);
        return Object.keys(body).length === 0 ? null : patchCountry(country.code, body);
      }
      return createCountry(toCreateCountryBody(values));
    });
    if (result.ok) {
      toast.push("success", t(country ? "admin.countries.updated" : "admin.countries.created", { name: values.name.trim() }));
      onDone();
    }
  }

  return (
    <Dialog
      size="lg"
      title={t(country ? "admin.countries.editTitle" : "admin.countries.newTitle")}
      description={country ? `${country.code} · ${country.iso2}` : t("admin.countries.newHint")}
      onClose={onClose}
      onSubmit={() => void submit()}
      busy={busy}
      footer={
        <>
          <Button type="button" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? t("admin.common.working") : t(country ? "common.save" : "admin.countries.create")}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label={t("admin.countries.code")}
          value={values.code}
          onChange={(v) => set("code", v.toUpperCase())}
          error={msg("code")}
          hint={t("admin.countries.codeHint")}
          disabled={mode === "edit"}
          maxLength={3}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          required
        />
        <TextField
          label={t("admin.countries.iso2")}
          value={values.iso2}
          onChange={(v) => set("iso2", v.toUpperCase())}
          error={msg("iso2")}
          hint={t("admin.countries.iso2Hint")}
          maxLength={2}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          required
        />
        <TextField label={t("admin.countries.nameEn")} value={values.name} onChange={(v) => set("name", v)} error={msg("name")} lang="en" required autoComplete="off" />
        <TextField label={t("admin.countries.nameFr")} value={values.nameFr} onChange={(v) => set("nameFr", v)} error={msg("nameFr")} lang="fr" required autoComplete="off" />
        <TextField label={t("admin.countries.nameEs")} value={values.nameEs} onChange={(v) => set("nameEs", v)} error={msg("nameEs")} lang="es" required autoComplete="off" />
        <TextField label={t("admin.countries.nameDe")} value={values.nameDe} onChange={(v) => set("nameDe", v)} error={msg("nameDe")} lang="de" required autoComplete="off" />
        <SelectField
          label={t("admin.countries.zone")}
          value={values.zone}
          onChange={(v) => set("zone", v)}
          placeholder={t("admin.countries.chooseZone")}
          options={ZONES.map((z) => ({ value: z, label: `${z} — ${t(`admin.zones.${z}`)}` }))}
          error={msg("zone")}
          required
        />
        <TextField label={t("admin.countries.capital")} value={values.capital} onChange={(v) => set("capital", v)} error={msg("capital")} required autoComplete="off" />
        <TextField
          label={t("admin.countries.timezone")}
          value={values.timezone}
          onChange={(v) => set("timezone", v)}
          error={msg("timezone")}
          hint={t("admin.countries.timezoneHint")}
          list={TIMEZONES_ID}
          autoComplete="off"
          spellCheck={false}
          required
        />
        <TextField
          label={t("admin.countries.currency")}
          value={values.currency}
          onChange={(v) => set("currency", v.toUpperCase())}
          error={msg("currency")}
          hint={t("admin.countries.currencyHint")}
          maxLength={3}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          required
        />
      </div>
      <datalist id={TIMEZONES_ID}>
        {zones.map((z) => (
          <option key={z} value={z} />
        ))}
      </datalist>

      {mode === "create" && (
        <fieldset className="space-y-3 rounded-lg border border-line p-3 sm:p-4">
          <legend className="px-1 text-xs font-semibold text-chalk-dim">{t("admin.countries.federationOptional")}</legend>
          <p className="text-xs text-chalk-faint">{t("admin.countries.federationHint")}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label={t("admin.federations.code")}
              value={values.federationCode}
              onChange={(v) => set("federationCode", normalizeCode(v))}
              error={msg("federationCode")}
              maxLength={20}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
            />
            <TextField label={t("admin.federations.name")} value={values.federationName} onChange={(v) => set("federationName", v)} error={msg("federationName")} autoComplete="off" />
          </div>
        </fieldset>
      )}

      <FormError error={error} />
    </Dialog>
  );
}
