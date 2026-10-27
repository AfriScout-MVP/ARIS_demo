import { api } from "@/lib/api/client";
import type { Locale } from "@/locales";

/**
 * What the signed-out landing page shows, read live from `GET /api/v1/public/summary`: the supported
 * countries with their federations and flags, and the platform's headline counts. Nothing is fixed here —
 * switch a country off in the admin portal and it leaves the landing page too.
 */
export interface PublicCountry {
  code: string;
  iso2: string;
  name: string;
  nameFr: string;
  nameEs: string;
  nameDe: string;
  flagUrl: string | null;
  federation: string | null;
  federationName: string | null;
}

export interface PublicSummary {
  countries: PublicCountry[];
  figures: { countries: number; officials: number; competitions: number; criteria: number };
}

export const fetchPublicSummary = (signal?: AbortSignal) => api<PublicSummary>("/public/summary", { signal });

/** The country's name in the visitor's language, as the federation's own record spells it. */
export function countryName(c: Pick<PublicCountry, "name" | "nameFr" | "nameEs" | "nameDe">, locale: Locale): string {
  return { fr: c.nameFr, en: c.name, es: c.nameEs, de: c.nameDe }[locale] || c.name;
}

/** The moving audit feed's sample entries, attributed to the live federations in turn. */
const FEED_ACTIONS = [
  "fixture.publish",
  "designation.confirm",
  "assessment.file",
  "payment.generate",
  "licence.renew",
  "decision.log",
  "case.open",
  "fixture.reschedule",
] as const;

export function feedEntries(countries: PublicCountry[]) {
  const who = countries.map((c) => c.federation ?? c.code);
  return FEED_ACTIONS.map((action, i) => ({
    action,
    who: who.length ? who[i % who.length] : "ARIS",
    at: `${String(9 + Math.floor((i * 13) / 60)).padStart(2, "0")}:${String((14 + i * 13) % 60).padStart(2, "0")}`,
  }));
}
