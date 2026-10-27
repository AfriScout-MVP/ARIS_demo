"use client";

import { useId, useState } from "react";
import { Eye, EyeOff, LockKeyhole } from "@/components/icons/glyphs";
import { MarkTile } from "@/components/icons/Mark";
import { LocaleToggle } from "@/components/layout/LocaleToggle";
import { Button } from "@/components/ui";
import { useT } from "@/lib/i18n/LocaleProvider";
import { useDataset } from "@/lib/dataset/DatasetProvider";

/** The sign-in form on its own: the full-page screen below and the landing page's panel both use it. */
export function LoginForm({ autoFocus = false, className }: { autoFocus?: boolean; className?: string }) {
  const t = useT();
  const { signIn } = useDataset();
  const id = useId();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<"invalid" | "throttled" | "network" | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setProblem(null);
    const result = await signIn(email.trim(), password);
    // on success the dataset provider replaces this screen; only failures come back here
    if (result !== "ok") {
      setProblem(result);
      setBusy(false);
    }
  }

  const field =
    "h-11 w-full rounded-[10px] border border-field bg-ink-2 px-3 text-sm text-chalk placeholder:text-chalk-faint focus:border-red-500/60 focus:outline-none";

  return (
    <form onSubmit={submit} className={className ?? "panel space-y-4 rounded-[14px] border border-line bg-ink-1 p-5"}>
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-chalk">
          <LockKeyhole size={17} className="text-chalk-faint" />
          {t("auth.title")}
        </h1>
        <p className="mt-1 text-sm text-chalk-dim">{t("auth.subtitle")}</p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor={`${id}-email`} className="text-xs font-medium text-chalk-dim">
          {t("auth.email")}
        </label>
        <input
          id={`${id}-email`}
          type="email"
          autoComplete="username"
          required
          autoFocus={autoFocus}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={field}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`${id}-password`} className="text-xs font-medium text-chalk-dim">
          {t("auth.password")}
        </label>
        {/* show / hide: on a phone keyboard a mistyped password is otherwise impossible to spot */}
        <div className="relative">
          <input
            id={`${id}-password`}
            type={shown ? "text" : "password"}
            autoComplete="current-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`${field} pe-12`}
          />
          <button
            type="button"
            onClick={() => setShown((v) => !v)}
            aria-label={t(shown ? "admin.password.hide" : "admin.password.show")}
            aria-pressed={shown}
            aria-controls={`${id}-password`}
            className="absolute inset-y-0 end-0 grid w-11 place-items-center rounded-e-[10px] text-chalk-faint transition-colors hover:text-chalk"
          >
            {shown ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </div>
      </div>

      {problem && (
        <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {t(problem === "invalid" ? "auth.invalid" : problem === "throttled" ? "auth.throttled" : "auth.network")}
        </p>
      )}

      <Button type="submit" variant="primary" disabled={busy || !email || !password} className="w-full">
        {busy ? t("auth.submitting") : t("auth.submit")}
      </Button>
    </form>
  );
}

export function LoginScreen() {
  const t = useT();
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="rise w-full max-w-sm">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-chalk">
            <MarkTile size={40} />
            <div>
              <p className="font-display text-lg font-extrabold leading-none tracking-[-0.03em]">{t("common.appName")}</p>
              <p className="mt-1 text-[11px] leading-none text-chalk-faint">{t("common.by")}</p>
            </div>
          </div>
          <LocaleToggle />
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
