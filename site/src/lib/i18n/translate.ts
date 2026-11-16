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
  /** "" for anything that is not a real date: a screen must never print "Invalid Date". */
  const at = (iso: string, options: Intl.DateTimeFormatOptions, utc = false) => {
    const d = new Date(`${iso}T12:00:00Z`);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(tag, utc ? { ...options, timeZone: "UTC" } : options);
  };
  return {
    date: (iso: string) => at(iso, { day: "2-digit", month: "short" }),
    /** With the year: a birth date, a licence expiry. */
    fullDate: (iso: string) => at(iso, { day: "numeric", month: "long", year: "numeric" }, true),
    longDate: (iso: string) => at(iso, { weekday: "short", day: "2-digit", month: "long" }),
    /** Short month name of a "YYYY-MM" key, e.g. "mars". */
    month: (ym: string) => at(`${ym}-01`, { month: "short" }, true),
    weekday: (iso: string) => at(iso, { weekday: "short" }),
    number: (n: number) => n.toLocaleString(tag),
  };
}
