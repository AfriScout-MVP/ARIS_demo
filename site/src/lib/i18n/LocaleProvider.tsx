"use client";

import { createContext, useCallback, useContext, useEffect, useMemo } from "react";
import { usePersistent, writeStore } from "@/lib/persistent-store";
import { dictionaries, en, type Dict, type Locale } from "./dictionary";

type Leaves<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${Leaves<T[K]>}`;
}[keyof T & string];

export type TKey = Leaves<Dict>;

type Vars = Record<string, string | number>;

interface LocaleContextValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: (key: TKey, vars?: Vars) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

const STORAGE_KEY = "aris.locale";

/** French is the default: it is the working language of most CAF federations. */
function parseLocale(raw: string | null): Locale {
  return raw === "en" ? "en" : "fr";
}

function lookup(dict: Dict, key: string): string | undefined {
  const value = key
    .split(".")
    .reduce<unknown>(
      (acc, part) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[part] : undefined),
      dict,
    );
  return typeof value === "string" ? value : undefined;
}

function interpolate(template: string, vars?: Vars) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const locale = usePersistent(STORAGE_KEY, parseLocale, "fr");

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    writeStore(STORAGE_KEY, next);
  }, []);

  const t = useCallback(
    (key: TKey, vars?: Vars) => {
      const dict = dictionaries[locale] as Dict;
      return interpolate(lookup(dict, key) ?? lookup(en, key) ?? key, vars);
    },
    [locale],
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used inside LocaleProvider");
  return ctx;
}

/** Shorthand for components that only need the translate function. */
export function useT() {
  return useLocale().t;
}

/** Locale-aware date formatting, used everywhere a date is shown. */
export function useFormatters() {
  const { locale } = useLocale();
  return useMemo(() => {
    const tag = locale === "fr" ? "fr-FR" : "en-GB";
    return {
      date: (iso: string) =>
        new Date(`${iso}T12:00:00Z`).toLocaleDateString(tag, { day: "2-digit", month: "short" }),
      longDate: (iso: string) =>
        new Date(`${iso}T12:00:00Z`).toLocaleDateString(tag, {
          weekday: "short",
          day: "2-digit",
          month: "long",
        }),
      weekday: (iso: string) =>
        new Date(`${iso}T12:00:00Z`).toLocaleDateString(tag, { weekday: "short" }),
      number: (n: number) => n.toLocaleString(tag),
    };
  }, [locale]);
}
