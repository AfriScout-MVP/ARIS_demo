"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import {
  createUser,
  listCountries,
  listFederations,
  patchUser,
  resetUserPassword,
  type UiLocale,
  type UserRow,
} from "@/lib/api/admin";
import { creatableRoles, type Actor } from "@/lib/admin/actor";
import type { AdminRole } from "@/lib/admin/constants";
import {
  hasErrors,
  roleChangeBody,
  toCreateUserBody,
  validateAccount,
  validatePasswordReset,
  validateRoleChange,
  type AccountField,
  type FormErrors,
} from "@/lib/admin/forms";
import { useAction, useResource } from "@/lib/admin/hooks";
import { roleLabelKey } from "@/lib/admin/labels";
import { useT } from "@/lib/i18n/LocaleProvider";
import { useToast } from "@/lib/toast/ToastProvider";
import { localeLabels, locales } from "@/locales";
import { Dialog } from "./Dialog";
import { fieldMessage, FormError, SelectField, TextField } from "./fields";
import { OfficialPicker } from "./OfficialPicker";
import { PasswordField } from "./PasswordField";

const localeOptions = locales.map((l) => ({ value: l, label: localeLabels[l] }));

function Footer({ busy, onClose, submit }: { busy: boolean; onClose: () => void; submit: string }) {
  const t = useT();
  return (
    <>
      <Button type="button" onClick={onClose} disabled={busy}>
        {t("common.cancel")}
      </Button>
      <Button type="submit" variant="primary" disabled={busy}>
        {busy ? t("admin.common.working") : submit}
      </Button>
    </>
  );
}

// ---------------------------------------------------------------------- create

export interface CreatePreset {
  role: AdminRole;
  /** A seat for this federation: the role and the federation are fixed. */
  federationId?: string;
  federationLabel?: string;
}

export function CreateAccountDialog({
  actor,
  preset,
  onClose,
  onCreated,
}: {
  actor: Actor;
  preset?: CreatePreset;
  onClose: () => void;
  onCreated: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const { busy, error, serverFields, run } = useAction();
  const roles = creatableRoles(actor);
  const isSuper = actor.role === "admin";

  const [values, setValues] = useState({
    name: "",
    email: "",
    role: (preset?.role ?? roles[0] ?? "referee") as AdminRole,
    federationId: preset?.federationId ?? "",
    officialId: "",
    locale: "fr" as UiLocale,
    password: "",
  });
  const [errors, setErrors] = useState<FormErrors<AccountField>>({});
  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const needsFederations = isSuper && values.role === "federation" && !preset?.federationId;
  const federations = useResource("federations", (signal) => listFederations(signal), needsFederations);
  const countries = useResource("countries", (signal) => listCountries(false, signal), isSuper && values.role === "referee");

  async function submit() {
    const found = validateAccount(values);
    setErrors(found);
    if (hasErrors(found)) return;
    const result = await run(() => createUser(toCreateUserBody(values)));
    if (result.ok) {
      toast.push("success", t("admin.accounts.created", { name: values.name.trim() }));
      onCreated();
    }
  }

  const msg = (field: AccountField) => fieldMessage(t, errors, serverFields, field);

  return (
    <Dialog
      title={t("admin.accounts.newTitle")}
      description={preset?.federationLabel ? t("admin.accounts.newSeatFor", { federation: preset.federationLabel }) : t("admin.accounts.newHint")}
      onClose={onClose}
      onSubmit={() => void submit()}
      busy={busy}
      footer={<Footer busy={busy} onClose={onClose} submit={t("admin.accounts.create")} />}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label={t("admin.accounts.name")} value={values.name} onChange={(v) => set("name", v)} error={msg("name")} required autoComplete="off" />
        <TextField
          label={t("admin.accounts.email")}
          type="email"
          value={values.email}
          onChange={(v) => set("email", v)}
          error={msg("email") ?? (error?.code === "email_taken" ? t("admin.errors.email_taken") : undefined)}
          required
          autoComplete="off"
          inputMode="email"
        />
      </div>

      {isSuper && !preset && (
        <SelectField
          label={t("admin.accounts.role")}
          value={values.role}
          onChange={(v) => setValues((s) => ({ ...s, role: v as AdminRole, officialId: "", federationId: "" }))}
          options={roles.map((r) => ({ value: r, label: t(roleLabelKey(r)) }))}
          hint={t(`admin.accounts.roleHint.${values.role}`)}
          required
        />
      )}

      {preset?.federationLabel && (
        <p className="rounded-lg border border-line bg-ink-1 px-3 py-2 text-sm text-chalk-dim">
          {t("admin.accounts.seatOf")} <span className="font-semibold text-chalk">{preset.federationLabel}</span>
        </p>
      )}

      {needsFederations && (
        <SelectField
          label={t("admin.accounts.federation")}
          value={values.federationId}
          onChange={(v) => set("federationId", v)}
          placeholder={federations.loading ? t("admin.common.loading") : t("admin.accounts.chooseFederation")}
          options={(federations.data ?? []).filter((f) => f.status === "active").map((f) => ({ value: f.id, label: `${f.code} — ${f.name}` }))}
          error={msg("federationId")}
          required
        />
      )}

      {values.role === "referee" && (
        <OfficialPicker
          value={values.officialId}
          onChange={(id) => set("officialId", id)}
          country={isSuper ? undefined : actor.country}
          countries={countries.data}
          error={msg("officialId")}
        />
      )}

      <SelectField
        label={t("admin.accounts.language")}
        value={values.locale}
        onChange={(v) => set("locale", v as UiLocale)}
        options={localeOptions}
      />

      <PasswordField label={t("admin.accounts.password")} value={values.password} onChange={(v) => set("password", v)} error={msg("password")} />

      <FormError error={error} />
    </Dialog>
  );
}

// -------------------------------------------------------------- reset password

export function ResetPasswordDialog({ user, onClose, onDone }: { user: UserRow; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const toast = useToast();
  const { busy, error, serverFields, run } = useAction();
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FormErrors<"password">>({});

  async function submit() {
    const found = validatePasswordReset(password);
    setErrors(found);
    if (hasErrors(found)) return;
    const result = await run(() => resetUserPassword(user.id, password));
    if (result.ok) {
      toast.push("success", t("admin.accounts.passwordReset", { name: user.name }));
      onDone();
    }
  }

  return (
    <Dialog
      title={t("admin.accounts.resetTitle")}
      description={t("admin.accounts.resetHint", { name: user.name })}
      onClose={onClose}
      onSubmit={() => void submit()}
      busy={busy}
      size="sm"
      footer={<Footer busy={busy} onClose={onClose} submit={t("admin.accounts.resetConfirm")} />}
    >
      <PasswordField
        label={t("admin.accounts.newPassword")}
        value={password}
        onChange={(v) => {
          setPassword(v);
          setErrors({});
        }}
        error={fieldMessage(t, errors, serverFields, "password")}
        autoFocus
      />
      <FormError error={error} />
    </Dialog>
  );
}

// -------------------------------------------------------------------- language

export function LanguageDialog({ user, onClose, onDone }: { user: UserRow; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const toast = useToast();
  const { busy, error, run } = useAction();
  const [locale, setLocale] = useState<UiLocale>(user.locale);

  async function submit() {
    const result = await run(() => patchUser(user.id, { locale }));
    if (result.ok) {
      toast.push("success", t("admin.accounts.languageSaved", { name: user.name }));
      onDone();
    }
  }

  return (
    <Dialog
      title={t("admin.accounts.languageTitle")}
      description={user.name}
      onClose={onClose}
      onSubmit={() => void submit()}
      busy={busy}
      size="sm"
      footer={<Footer busy={busy} onClose={onClose} submit={t("common.save")} />}
    >
      <SelectField label={t("admin.accounts.language")} value={locale} onChange={(v) => setLocale(v as UiLocale)} options={localeOptions} />
      <FormError error={error} />
    </Dialog>
  );
}

// ------------------------------------------------------------------------ role

export function RoleDialog({ user, onClose, onDone }: { user: UserRow; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const toast = useToast();
  const { busy, error, run } = useAction();
  const [role, setRole] = useState<AdminRole>(user.role);
  const [federationId, setFederationId] = useState(user.federationId ?? "");
  const [officialId, setOfficialId] = useState(user.officialId ?? "");
  const [errors, setErrors] = useState<FormErrors<"federationId" | "officialId">>({});

  const changed = role !== user.role;
  const federations = useResource("federations", (signal) => listFederations(signal), role === "federation");
  const countries = useResource("countries", (signal) => listCountries(false, signal), role === "referee");

  async function submit() {
    if (!changed) return onClose();
    const found = validateRoleChange(role, federationId, officialId);
    setErrors(found);
    if (hasErrors(found)) return;
    const result = await run(() => patchUser(user.id, roleChangeBody(role, federationId, officialId)));
    if (result.ok) {
      toast.push("success", t("admin.accounts.roleSaved", { name: user.name, role: t(roleLabelKey(role)) }));
      onDone();
    }
  }

  return (
    <Dialog
      title={t("admin.accounts.roleTitle")}
      description={user.name}
      onClose={onClose}
      onSubmit={() => void submit()}
      busy={busy}
      footer={
        <>
          <Button type="button" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" variant="danger" disabled={busy || !changed}>
            {busy ? t("admin.common.working") : t("admin.accounts.roleConfirm")}
          </Button>
        </>
      }
    >
      <SelectField
        label={t("admin.accounts.role")}
        value={role}
        onChange={(v) => {
          setRole(v as AdminRole);
          setErrors({});
        }}
        options={(["admin", "federation", "referee"] as const).map((r) => ({ value: r, label: t(roleLabelKey(r)) }))}
        hint={t(`admin.accounts.roleHint.${role}`)}
      />
      {role === "federation" && (
        <SelectField
          label={t("admin.accounts.federation")}
          value={federationId}
          onChange={(v) => setFederationId(v)}
          placeholder={federations.loading ? t("admin.common.loading") : t("admin.accounts.chooseFederation")}
          options={(federations.data ?? []).filter((f) => f.status === "active").map((f) => ({ value: f.id, label: `${f.code} — ${f.name}` }))}
          error={errors.federationId ? t(errors.federationId) : undefined}
          required
        />
      )}
      {role === "referee" && (
        <OfficialPicker
          value={officialId}
          onChange={setOfficialId}
          countries={countries.data}
          error={errors.officialId ? t(errors.officialId) : undefined}
        />
      )}
      {changed && (
        <p role="note" className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm leading-relaxed text-chalk">
          {t("admin.accounts.roleWarning", { from: t(roleLabelKey(user.role)), to: t(roleLabelKey(role)) })}
        </p>
      )}
      <FormError error={error} />
    </Dialog>
  );
}
