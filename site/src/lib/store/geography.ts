// Zones, countries and competitions. The collections are empty until `applySnapshot` fills
// them; they are replaced in place so every importer keeps seeing the live arrays.

import type { Locale, TKey } from "@/locales";
import { translate } from "@/lib/i18n/translate";
import type { Competition, Country, Zone } from "./types";

/** The six CAF zonal unions — a fixed part of the confederation, not sample data. */
export const zones: Zone[] = ["UNAF", "UFOA-A", "UFOA-B", "UNIFFAC", "CECAFA", "COSAFA"];

/** Translation key of each zone's name, e.g. `t(zoneKey.UNAF)` -> "Afrique du Nord". */
export const zoneKey: Record<Zone, TKey> = {
  UNAF: "common.zones.UNAF",
  "UFOA-A": "common.zones.UFOA-A",
  "UFOA-B": "common.zones.UFOA-B",
  UNIFFAC: "common.zones.UNIFFAC",
  CECAFA: "common.zones.CECAFA",
  COSAFA: "common.zones.COSAFA",
};

/** The pseudo-country that carries continental competitions. */
export const CAF = "CAF";

export const countries: Country[] = [];
export const countryByCode = new Map<string, Country>();
export const competitions: Competition[] = [];
export const competitionById = new Map<string, Competition>();

/** A country's name in the given language (falls back to the English name). */
export function countryName(code: string, locale: Locale) {
  if (code === CAF) return translate(locale, "common.cafCompetitions");
  const c = countryByCode.get(code);
  if (!c) return code;
  const byLocale: Record<Locale, string | undefined> = { fr: c.nameFr, en: c.name, es: c.nameEs, de: c.nameDe };
  return byLocale[locale] || c.name;
}

/** The emoji flag — used as a string, or as the fallback of `<CountryFlag>`. */
export function countryFlag(code: string) {
  return code === CAF ? "🌍" : (countryByCode.get(code)?.flag ?? "🏳️");
}

/** The uploaded flag image, when the country has one. */
export function countryFlagUrl(code: string): string | null {
  return countryByCode.get(code)?.flagUrl ?? null;
}

/** Countries ARIS currently supports (the API only lists active ones to staff, but be safe). */
export function activeCountries() {
  return countries.filter((c) => c.active !== false);
}

export function countriesInZone(zone: Zone) {
  return countries.filter((c) => c.zone === zone);
}
