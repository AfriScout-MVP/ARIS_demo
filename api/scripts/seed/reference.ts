// Reference facts about the supported countries that the dataset's Country rows do not carry — ISO alpha-2,
// Spanish and German names, time zone, currency and the federation's full name — read from ./seed/real-world.ts.

import { COUNTRY_FACTS } from "../../seed/real-world";

export interface CountryReference {
  iso2: string;
  nameEs: string;
  nameDe: string;
  timezone: string;
  currency: string;
  federationName: string;
}

export const COUNTRY_REFERENCE: Record<string, CountryReference> = Object.fromEntries(
  COUNTRY_FACTS.map((f) => [f.code, { iso2: f.iso2, nameEs: f.nameEs, nameDe: f.nameDe, timezone: f.timezone, currency: f.currency, federationName: f.federation.name }]),
);
