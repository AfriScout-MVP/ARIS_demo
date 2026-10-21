"use client";

import { useId, useState } from "react";
import { Copy, Eye, EyeOff, Wand2 } from "@/components/icons/glyphs";
import { Button, Meter, type BoardTone } from "@/components/ui";
import { MIN_PASSWORD } from "@/lib/admin/constants";
import { generatePassword, passwordStrength, type StrengthLevel } from "@/lib/admin/password";
import { useT } from "@/lib/i18n/LocaleProvider";
import { useToast } from "@/lib/toast/ToastProvider";
import { cn } from "@/lib/utils";
import { controlClass } from "./fields";

const TONE: Record<StrengthLevel, BoardTone> = {
  empty: "chalk",
  short: "red",
  weak: "red",
  fair: "amber",
  good: "var",
  strong: "pitch",
};

/** Password input with show/hide, a generator (crypto.getRandomValues), a copy button and a strength hint. */
export function PasswordField({
  label,
  value,
  onChange,
  error,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  error?: string;
  autoFocus?: boolean;
}) {
  const t = useT();
  const toast = useToast();
  const id = useId();
  const [shown, setShown] = useState(false);
  const strength = passwordStrength(value);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      toast.push("success", t("admin.password.copied"));
    } catch {
      toast.push("error", t("admin.password.copyFailed"));
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-semibold text-chalk-dim">
        {label}
        <span aria-hidden className="ms-0.5 text-card-red">
          *
        </span>
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          type={shown ? "text" : "password"}
          value={value}
          autoFocus={autoFocus}
          autoComplete="new-password"
          autoCapitalize="off"
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-help`}
          className={cn(controlClass(Boolean(error)), "min-w-0 flex-1 font-mono")}
        />
        <Button
          type="button"
          size="sm"
          aria-label={t(shown ? "admin.password.hide" : "admin.password.show")}
          aria-pressed={shown}
          onClick={() => setShown((s) => !s)}
          className="shrink-0"
        >
          {shown ? <EyeOff size={15} /> : <Eye size={15} />}
        </Button>
        <Button
          type="button"
          size="sm"
          aria-label={t("admin.password.copy")}
          disabled={!value}
          onClick={() => void copy()}
          className="shrink-0"
        >
          <Copy size={15} />
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-1">
        <Button
          type="button"
          size="sm"
          onClick={() => {
            onChange(generatePassword(16));
            setShown(true);
          }}
        >
          <Wand2 size={14} />
          {t("admin.password.generate")}
        </Button>
        <div className="min-w-32 flex-1">
          <Meter value={strength.score} max={4} tone={TONE[strength.level]} />
        </div>
      </div>
      <p id={`${id}-help`} aria-live="polite" className="text-xs text-chalk-faint">
        <span className="font-semibold text-chalk-dim">{t(`admin.password.strength.${strength.level}`)}</span>
        {" · "}
        {t("admin.password.rule", { min: MIN_PASSWORD })}
      </p>
      {error && <p className="text-xs font-medium text-card-red">{error}</p>}
    </div>
  );
}
