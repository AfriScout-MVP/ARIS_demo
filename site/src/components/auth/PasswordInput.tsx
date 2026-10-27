"use client";

import { useId, useState } from "react";
import { Eye, EyeOff } from "@/components/icons/glyphs";
import { useT } from "@/lib/i18n/LocaleProvider";
import { authField } from "./AuthFrame";

/**
 * A password input with the same show / hide button as the sign-in form (on a phone keyboard a mistyped password is
 * otherwise impossible to spot), a label, an optional hint and an error read out with the field.
 */
export function PasswordInput({
  label,
  value,
  onChange,
  autoComplete,
  hint,
  error,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  autoComplete: "current-password" | "new-password";
  hint?: string;
  error?: string;
  autoFocus?: boolean;
}) {
  const t = useT();
  const id = useId();
  const [shown, setShown] = useState(false);
  const described = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs font-medium text-chalk-dim">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={shown ? "text" : "password"}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={described}
          className={`${authField} pe-12`}
        />
        <button
          type="button"
          onClick={() => setShown((v) => !v)}
          aria-label={t(shown ? "account.password.hide" : "account.password.show")}
          aria-pressed={shown}
          aria-controls={id}
          className="absolute inset-y-0 end-0 grid w-11 place-items-center rounded-e-[10px] text-chalk-faint transition-colors hover:text-chalk"
        >
          {shown ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-chalk-faint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
