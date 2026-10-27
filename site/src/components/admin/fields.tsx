"use client";

import { useId } from "react";
import { AlertTriangle, ChevronDown } from "@/components/icons/glyphs";
import { cn } from "@/lib/utils";
import { useT, type TKey } from "@/lib/i18n/LocaleProvider";
import type { ErrorInfo } from "@/lib/admin/errors";

const control =
  "w-full rounded-lg border bg-ink-2 px-3 py-2 text-sm text-chalk outline-none placeholder:text-chalk-faint hover:border-red-500/50 focus:border-red-500 focus:ring-2 focus:ring-red-500/50 disabled:cursor-not-allowed disabled:opacity-50";

export const controlClass = (invalid?: boolean) => cn(control, invalid ? "border-red-500" : "border-field");

/** Label + control + hint + error, wired together with the right aria attributes. */
function Labelled({
  id,
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label htmlFor={id} className="text-xs font-semibold text-chalk-dim">
        {label}
        {required && (
          <span aria-hidden className="ms-0.5 text-card-red">
            *
          </span>
        )}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-chalk-faint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs font-medium text-card-red">
          {error}
        </p>
      )}
    </div>
  );
}

const describedBy = (id: string, hint?: string, error?: string) =>
  error ? `${id}-error` : hint ? `${id}-hint` : undefined;

export function TextField({
  label,
  value,
  onChange,
  error,
  hint,
  required,
  className,
  type = "text",
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "id"> & {
  label: string;
  value: string;
  onChange: (next: string) => void;
  error?: string;
  hint?: string;
  className?: string;
}) {
  const id = useId();
  return (
    <Labelled id={id} label={label} hint={hint} error={error} required={required} className={className}>
      <input
        {...rest}
        id={id}
        type={type}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={controlClass(Boolean(error))}
      />
    </Labelled>
  );
}

export function TextAreaField({
  label,
  value,
  onChange,
  error,
  hint,
  required,
  className,
  rows = 3,
  ...rest
}: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "value" | "id"> & {
  label: string;
  value: string;
  onChange: (next: string) => void;
  error?: string;
  hint?: string;
  className?: string;
}) {
  const id = useId();
  return (
    <Labelled id={id} label={label} hint={hint} error={error} required={required} className={className}>
      <textarea
        {...rest}
        id={id}
        rows={rows}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cn(controlClass(Boolean(error)), "resize-y leading-relaxed")}
      />
    </Labelled>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
  error,
  hint,
  required,
  disabled,
  className,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  options: Array<{ value: string; label: string }>;
  /** Adds an empty first option, for "choose…". */
  placeholder?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <Labelled id={id} label={label} hint={hint} error={error} required={required} className={className}>
      <div className="relative">
        <select
          id={id}
          value={value}
          disabled={disabled}
          required={required}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          className={cn(controlClass(Boolean(error)), "appearance-none pe-9")}
        >
          {placeholder !== undefined && (
            <option value="" className="bg-ink-2">
              {placeholder}
            </option>
          )}
          {options.map((o) => (
            <option key={o.value} value={o.value} className="bg-ink-2">
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown size={14} className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-chalk-faint" />
      </div>
    </Labelled>
  );
}

/** A labelled on/off switch. */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        checked ? "border-emerald-500/50 bg-emerald-500/30" : "border-field bg-ink-3",
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 rounded-full bg-chalk transition-transform",
          checked ? "translate-x-[1.35rem] rtl:-translate-x-[1.35rem]" : "translate-x-1 rtl:-translate-x-1",
        )}
      />
    </button>
  );
}

/** The sentence under a failed form: assertive, so a screen reader announces it as it appears. */
export function FormError({ error }: { error: ErrorInfo | null }) {
  const t = useT();
  if (!error) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-chalk"
    >
      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-card-red" />
      <p className="min-w-0 flex-1 leading-snug">
        {t(error.key)}
        {error.code && error.key === "admin.errors.generic" && (
          <span className="ms-1 font-mono text-xs text-chalk-faint">({error.code})</span>
        )}
      </p>
    </div>
  );
}

/** A field's message: a client-side rule first, then whatever the server flagged for that field. */
export function fieldMessage(
  t: (key: TKey) => string,
  local: Partial<Record<string, TKey>>,
  server: Record<string, TKey>,
  field: string,
): string | undefined {
  const key = local[field] ?? server[field];
  return key ? t(key) : undefined;
}
