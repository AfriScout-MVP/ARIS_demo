"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { Dialog } from "@/components/admin/Dialog";
import { FormError, TextField } from "@/components/admin/fields";
import { PasswordField } from "@/components/admin/PasswordField";
import { api } from "@/lib/api/client";
import { MAX_PASSWORD, MIN_PASSWORD } from "@/lib/admin/constants";
import { useAction } from "@/lib/admin/hooks";
import { useDataset } from "@/lib/dataset/DatasetProvider";
import { useT, type TKey } from "@/lib/i18n/LocaleProvider";
import { useToast } from "@/lib/toast/ToastProvider";

type Field = "current" | "next" | "confirm";

/**
 * The signed-in person changes their own password. The server then ends every session of the account,
 * this one included, so the dialog signs out and the person signs in again with the new password.
 *
 * `required`: a staff-set password (a new account, or one an administrator reset) that the Worker
 * blocks every other route behind (`password_change_required`). There is no cancelling out of it.
 */
export function ChangePasswordDialog({ onClose, required = false }: { onClose: () => void; required?: boolean }) {
  const t = useT();
  const toast = useToast();
  const { signOut } = useDataset();
  const { busy, error, run } = useAction();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Partial<Record<Field, TKey>>>({});

  async function submit() {
    const found: Partial<Record<Field, TKey>> = {};
    if (!current) found.current = "admin.errors.required";
    if (next.length < MIN_PASSWORD || next.length > MAX_PASSWORD) found.next = "admin.errors.passwordShort";
    else if (next === current) found.next = "auth.changePassword.same";
    if (confirm !== next) found.confirm = "auth.changePassword.mismatch";
    setErrors(found);
    if (Object.keys(found).length) return;
    const result = await run(() => api("/auth/change-password", { method: "POST", body: { currentPassword: current, newPassword: next } }));
    if (result.ok) {
      toast.push("success", t("auth.changePassword.done"));
      onClose();
      await signOut();
    }
  }

  const msg = (f: Field) => (errors[f] ? t(errors[f]!) : undefined);

  return (
    <Dialog
      size="sm"
      title={t("auth.changePassword.title")}
      description={t(required ? "auth.changePassword.requiredHint" : "auth.changePassword.hint")}
      onClose={onClose}
      onSubmit={() => void submit()}
      busy={busy}
      dismissable={!required}
      footer={
        <>
          {!required && (
            <Button type="button" onClick={onClose} disabled={busy}>
              {t("common.cancel")}
            </Button>
          )}
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? t("admin.common.working") : t("auth.changePassword.submit")}
          </Button>
        </>
      }
    >
      <TextField
        label={t("auth.changePassword.current")}
        type="password"
        autoComplete="current-password"
        value={current}
        onChange={(v) => (setCurrent(v), setErrors((e) => ({ ...e, current: undefined })))}
        error={msg("current")}
        required
      />
      <PasswordField label={t("auth.changePassword.next")} value={next} onChange={(v) => (setNext(v), setErrors((e) => ({ ...e, next: undefined })))} error={msg("next")} />
      <TextField
        label={t("auth.changePassword.confirm")}
        type="password"
        autoComplete="new-password"
        value={confirm}
        onChange={(v) => (setConfirm(v), setErrors((e) => ({ ...e, confirm: undefined })))}
        error={msg("confirm")}
        required
      />
      <FormError error={error} />
    </Dialog>
  );
}
