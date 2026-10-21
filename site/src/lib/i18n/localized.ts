import type { Locale } from "@/locales";

/** Text that comes from the database in several languages (French and English always present). */
export type LocalizedText = { fr: string; en: string; es?: string; de?: string };

/**
 * Pick the best string for `locale`: that locale, then French (the default
 * language), then English, then the first non-empty value, else "".
 */
export function pickLocalized(
  text: Partial<Record<Locale, string>> | null | undefined,
  locale: Locale,
): string {
  if (!text) return "";
  for (const key of [locale, "fr", "en"] as const) {
    const value = text[key];
    if (typeof value === "string" && value.trim() !== "") return value;
  }
  for (const value of Object.values(text)) {
    if (typeof value === "string" && value.trim() !== "") return value;
  }
  return "";
}
