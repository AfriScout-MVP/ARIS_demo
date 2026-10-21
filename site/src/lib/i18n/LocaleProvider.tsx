"use client";

import { createContext, useCallback, useContext, useEffect, useMemo } from "react";
import { usePersistent, writeStore } from "@/lib/persistent-store";
import { defaultLocale, type Locale, type TKey } from "@/locales";
import { makeFormatters, parseLocale, translate, type Vars } from "./translate";

export type { TKey };

interface LocaleContextValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: (key: TKey, vars?: Vars) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

const STORAGE_KEY = "aris.locale";

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const locale = usePersistent(STORAGE_KEY, parseLocale, defaultLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    writeStore(STORAGE_KEY, next);
  }, []);

  const t = useCallback((key: TKey, vars?: Vars) => translate(locale, key, vars), [locale]);

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
  return useMemo(() => makeFormatters(locale), [locale]);
}
