// Pure translation helpers. No React in here, so the loader tests can run in plain Node.

import { defaultLocale, dictionaries, isLocale, localeTags, type Dict, type Locale } from "@/locales";

export type Vars = Record<string, string | number>;

/** Anything stored or typed that is not one of the supported locales falls back to French. */
export function parseLocale(raw: string | null | undefined): Locale {
  return isLocale(raw) ? raw : defaultLocale;
}

/** Walk a dotted key through a dictionary; `undefined` unless it ends on a string. */
export function lookup(dict: Dict, key: string): string | undefined {
  const value = key
    .split(".")
    .reduce<unknown>(
      (acc, part) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[part] : undefined),
      dict,
    );
  return typeof value === "string" ? value : undefined;
}

/** Replace `{name}` placeholders; a placeholder with no matching variable is left as written. */
export function interpolate(template: string, vars?: Vars) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

/** Missing key in `locale` -> French -> the key itself. */
export function translate(locale: Locale, key: string, vars?: Vars): string {
  const text = lookup(dictionaries[locale], key) ?? lookup(dictionaries[defaultLocale], key) ?? key;
  return interpolate(text, vars);
}

/** Locale-aware date and number formatting, used everywhere a date is shown. */
export function makeFormatters(locale: Locale) {
  const tag = localeTags[locale];
  return {
    date: (iso: string) =>
      new Date(`${iso}T12:00:00Z`).toLocaleDateString(tag, { day: "2-digit", month: "short" }),
    longDate: (iso: string) =>
      new Date(`${iso}T12:00:00Z`).toLocaleDateString(tag, {
        weekday: "short",
        day: "2-digit",
        month: "long",
      }),
    /** Short month name of a "YYYY-MM" key, e.g. "mars". */
    month: (ym: string) => new Date(`${ym}-01T12:00:00Z`).toLocaleDateString(tag, { month: "short", timeZone: "UTC" }),
    weekday: (iso: string) =>
      new Date(`${iso}T12:00:00Z`).toLocaleDateString(tag, { weekday: "short" }),
    number: (n: number) => n.toLocaleString(tag),
  };
}
