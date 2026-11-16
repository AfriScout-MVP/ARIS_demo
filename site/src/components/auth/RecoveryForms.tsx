"use client";

import Link from "next/link";
import { useId, useState, useSyncExternalStore } from "react";
import { ArrowLeft, CheckCircle2, KeyRound, Mail } from "@/components/icons/glyphs";
import { Button, buttonClass } from "@/components/ui";
import { MIN_PASSWORD } from "@/lib/admin/constants";
import { checkNewPassword, isDeadLink, readResetToken, recoveryProblem } from "@/lib/account/rules";
import { requestPasswordReset, resetPassword } from "@/lib/api/account";
import { useT, type TKey } from "@/lib/i18n/LocaleProvider";
import { AuthAlert, AuthFrame, AuthHeading, authCard, authField } from "./AuthFrame";
import { PasswordInput } from "./PasswordInput";

/**
 * "Forgot password": asks for the account's e-mail and asks the Worker to send a reset link. The Worker answers 202
 * whether or not the address has an account, so the confirmation says the same thing either way.
 */
export function ForgotPasswordForm({ className, onBack }: { className?: string; onBack: () => void }) {
  const t = useT();
  const id = useId();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<TKey | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setProblem(null);
    const address = email.trim();
    try {
      await requestPasswordReset(address);
      setSentTo(address);
    } catch (err) {
      setProblem(recoveryProblem(err, "forgot"));
    } finally {
      setBusy(false);
    }
  }

  const back = (
    <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-chalk-dim transition-colors hover:text-chalk">
      <ArrowLeft size={15} />
      {t("account.forgot.back")}
    </button>
  );

  if (sentTo) {
    return (
      <div className={className ?? authCard} role="status">
        <AuthHeading icon={<Mail size={17} className="text-chalk-faint" />} title={t("account.forgot.sentTitle")} subtitle={t("account.forgot.sentBody", { email: sentTo })} />
        {back}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className={className ?? authCard}>
      <AuthHeading icon={<KeyRound size={17} className="text-chalk-faint" />} title={t("account.forgot.title")} subtitle={t("account.forgot.subtitle")} />
      <div className="space-y-1.5">
        <label htmlFor={`${id}-email`} className="text-xs font-medium text-chalk-dim">
          {t("account.forgot.email")}
        </label>
        <input
          id={`${id}-email`}
          type="email"
          autoComplete="username"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={authField}
        />
      </div>
      {problem && <AuthAlert>{t(problem)}</AuthAlert>}
      <Button type="submit" variant="primary" disabled={busy || !email.trim()} className="w-full">
        {busy ? t("account.forgot.submitting") : t("account.forgot.submit")}
      </Button>
      {back}
    </form>
  );
}

type TokenState = { kind: "reading" } | { kind: "missing" } | { kind: "ready"; token: string };

// the address never changes under this page; null on the server and during hydration (static export has no query string)
const noSubscription = () => () => undefined;
const addressSearch = () => window.location.search;
const noAddress = () => null;

/**
 * The page the reset e-mail links to (`/reset-password?token=…`). The token comes from the address, the person picks a
 * new password twice, and the Worker burns the link and ends every session of the account.
 */
export function ResetPasswordScreen() {
  const t = useT();
  const search = useSyncExternalStore(noSubscription, addressSearch, noAddress);
  const token = search === null ? null : readResetToken(search);
  const state: TokenState = search === null ? { kind: "reading" } : token ? { kind: "ready", token } : { kind: "missing" };
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<TKey | null>(null);
  const [errors, setErrors] = useState<{ next?: TKey; confirm?: TKey }>({});
  const [phase, setPhase] = useState<"form" | "done" | "dead">("form");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || state.kind !== "ready") return;
    const found = checkNewPassword(password, confirm);
    setErrors({
      next: found.next ? "account.reset.short" : undefined,
      confirm: found.confirm ? "account.reset.mismatch" : undefined,
    });
    if (found.next || found.confirm) return;
    setBusy(true);
    setProblem(null);
    try {
      await resetPassword(state.token, password);
      setPhase("done");
    } catch (err) {
      if (isDeadLink(err)) setPhase("dead");
      else setProblem(recoveryProblem(err, "reset"));
    } finally {
      setBusy(false);
    }
  }

  if (state.kind === "reading") return <AuthFrame>{null}</AuthFrame>;

  if (phase === "done") {
    return (
      <AuthFrame>
        <div role="status" className="space-y-4">
          <AuthHeading icon={<CheckCircle2 size={17} className="text-chalk-faint" />} title={t("account.reset.doneTitle")} subtitle={t("account.reset.doneBody")} />
          <Link href="/" className={buttonClass({ variant: "primary", className: "w-full" })}>
            {t("account.reset.signIn")}
          </Link>
        </div>
      </AuthFrame>
    );
  }

  if (phase === "dead" || state.kind === "missing") {
    return (
      <AuthFrame>
        <div role="alert" className="space-y-4">
          <AuthHeading icon={<KeyRound size={17} className="text-chalk-faint" />} title={t("account.reset.invalidTitle")} subtitle={t(state.kind === "missing" ? "account.reset.missingBody" : "account.reset.invalidBody")} />
          <Link href="/" className={buttonClass({ className: "w-full" })}>
            {t("account.reset.requestNew")}
          </Link>
        </div>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <AuthHeading icon={<KeyRound size={17} className="text-chalk-faint" />} title={t("account.reset.title")} subtitle={t("account.reset.subtitle")} />
        <PasswordInput
          label={t("account.reset.password")}
          value={password}
          onChange={(v) => (setPassword(v), setErrors((x) => ({ ...x, next: undefined })))}
          autoComplete="new-password"
          hint={t("account.password.rule", { n: MIN_PASSWORD })}
          error={errors.next ? t(errors.next, { n: MIN_PASSWORD }) : undefined}
          autoFocus
        />
        <PasswordInput
          label={t("account.reset.confirm")}
          value={confirm}
          onChange={(v) => (setConfirm(v), setErrors((x) => ({ ...x, confirm: undefined })))}
          autoComplete="new-password"
          error={errors.confirm ? t(errors.confirm) : undefined}
        />
        {problem && <AuthAlert>{t(problem)}</AuthAlert>}
        <Button type="submit" variant="primary" disabled={busy || !password || !confirm} className="w-full">
          {busy ? t("account.reset.submitting") : t("account.reset.submit")}
        </Button>
      </form>
    </AuthFrame>
  );
}
