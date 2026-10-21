"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { createFederation, patchFederation, type CountryRow, type FederationRow } from "@/lib/api/admin";
import {
  hasErrors,
  toCreateFederationBody,
  toPatchFederationBody,
  validateFederation,
  type FederationField,
  type FederationValues,
  type FormErrors,
} from "@/lib/admin/forms";
import { useAction } from "@/lib/admin/hooks";
import { countryLabel } from "@/lib/admin/labels";
import { useLocale, useT } from "@/lib/i18n/LocaleProvider";
import { useToast } from "@/lib/toast/ToastProvider";
import { Dialog } from "./Dialog";
import { fieldMessage, FormError, SelectField, TextField } from "./fields";

/** Create (pick a country that has no federation yet) or edit (name and agreement reference). */
export function FederationFormDialog({
  federation,
  freeCountries,
  onClose,
  onDone,
}: {
  /** Present when editing. */
  federation?: FederationRow;
  freeCountries: CountryRow[];
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const toast = useToast();
  const { busy, error, serverFields, run } = useAction();
  const mode = federation ? "edit" : "create";

  const [values, setValues] = useState<FederationValues>({
    code: federation?.code ?? "",
    name: federation?.name ?? "",
    country: federation?.country ?? "",
    agreementReference: federation?.agreementReference ?? "",
  });
  const [errors, setErrors] = useState<FormErrors<FederationField>>({});
  const set = (key: keyof FederationValues, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };
  const msg = (field: FederationField) => fieldMessage(t, errors, serverFields, field);

  async function submit() {
    const found = validateFederation(values, mode);
    setErrors(found);
    if (hasErrors(found)) return;
    const result = await run(async () => {
      if (federation) {
        const body = toPatchFederationBody(federation, values);
        if (Object.keys(body).length === 0) return null;
        return patchFederation(federation.id, body);
      }
      return createFederation(toCreateFederationBody(values));
    });
    if (result.ok) {
      toast.push("success", t(federation ? "admin.federations.updated" : "admin.federations.created", { name: values.name.trim() }));
      onDone();
    }
  }

  return (
    <Dialog
      title={t(federation ? "admin.federations.editTitle" : "admin.federations.newTitle")}
      description={federation ? `${federation.code} · ${federation.countryName}` : t("admin.federations.newHint")}
      onClose={onClose}
      onSubmit={() => void submit()}
      busy={busy}
      footer={
        <>
          <Button type="button" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? t("admin.common.working") : t(federation ? "common.save" : "admin.federations.create")}
          </Button>
        </>
      }
    >
      {!federation && (
        <SelectField
          label={t("admin.federations.country")}
          value={values.country}
          onChange={(v) => set("country", v)}
          placeholder={t("admin.federations.chooseCountry")}
          options={freeCountries.map((c) => ({ value: c.code, label: `${countryLabel(c, locale)} (${c.code})` }))}
          error={msg("country")}
          hint={freeCountries.length === 0 ? t("admin.federations.noFreeCountry") : undefined}
          required
        />
      )}
      {!federation && (
        <TextField
          label={t("admin.federations.code")}
          value={values.code}
          onChange={(v) => set("code", v.toUpperCase())}
          error={msg("code")}
          hint={t("admin.federations.codeHint")}
          maxLength={20}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          required
        />
      )}
      <TextField label={t("admin.federations.name")} value={values.name} onChange={(v) => set("name", v)} error={msg("name")} required autoComplete="off" />
      <TextField
        label={t("admin.federations.agreement")}
        value={values.agreementReference}
        onChange={(v) => set("agreementReference", v)}
        hint={t("admin.federations.agreementHint")}
        autoComplete="off"
      />
      <FormError error={error} />
    </Dialog>
  );
}
