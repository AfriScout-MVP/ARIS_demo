import type { Locale } from "../env";

/** Copy stored in the database: always French and English, Spanish and German when translated. */
export interface Localized {
  fr: string;
  en: string;
  es?: string;
  de?: string;
}

/** Notification and seed copy is written in the two source languages and may be translated later. */
export const localized = (fr: string, en: string, extra: Partial<Pick<Localized, "es" | "de">> = {}): Localized => ({ fr, en, ...extra });

/** The text for a locale, falling back to French then English — never an empty string when anything exists. */
export function pick(text: Partial<Record<Locale, string>> | null | undefined, locale: Locale): string {
  if (!text) return "";
  return text[locale] || text.fr || text.en || Object.values(text).find(Boolean) || "";
}
