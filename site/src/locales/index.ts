/**
 * ARIS interface copy: one JSON file per namespace, per language.
 *
 *   src/locales/<locale>/<namespace>.json
 *
 * Every JSON is imported statically (the app is a static export, so there is no
 * runtime fetch) and the namespaces are merged into one tree per language. The
 * dotted keys the components use (`t("common.appName")`) are the namespace file
 * name followed by the path inside it.
 *
 * French is the source of truth: `Dict` and `TKey` are derived from the French
 * tree, and `test/i18n/parity.test.ts` fails the build if any other language
 * drifts from it (missing key, extra key, empty string, different placeholders).
 */

import fr_common from "./fr/common.json";
import fr_roles from "./fr/roles.json";
import fr_nav from "./fr/nav.json";
import fr_subtitles from "./fr/subtitles.json";
import fr_overview from "./fr/overview.json";
import fr_calendar from "./fr/calendar.json";
import fr_arae from "./fr/arae.json";
import fr_copilot from "./fr/copilot.json";
import fr_referees from "./fr/referees.json";
import fr_matchReview from "./fr/matchReview.json";
import fr_assessments from "./fr/assessments.json";
import fr_positioning from "./fr/positioning.json";
import fr_rankings from "./fr/rankings.json";
import fr_compare from "./fr/compare.json";
import fr_development from "./fr/development.json";
import fr_federations from "./fr/federations.json";
import fr_reports from "./fr/reports.json";
import fr_auth from "./fr/auth.json";
import fr_live from "./fr/live.json";
import fr_me from "./fr/me.json";
import fr_selfService from "./fr/selfService.json";
import fr_status from "./fr/status.json";
import fr_admin from "./fr/admin.json";
import fr_partnerships from "./fr/partnerships.json";
import fr_finance from "./fr/finance.json";
import fr_discipline from "./fr/discipline.json";
import fr_officials from "./fr/officials.json";
import fr_competitions from "./fr/competitions.json";
import fr_analytics from "./fr/analytics.json";
import fr_fixtures from "./fr/fixtures.json";
import fr_landing from "./fr/landing.json";
import fr_account from "./fr/account.json";

import en_common from "./en/common.json";
import en_roles from "./en/roles.json";
import en_nav from "./en/nav.json";
import en_subtitles from "./en/subtitles.json";
import en_overview from "./en/overview.json";
import en_calendar from "./en/calendar.json";
import en_arae from "./en/arae.json";
import en_copilot from "./en/copilot.json";
import en_referees from "./en/referees.json";
import en_matchReview from "./en/matchReview.json";
import en_assessments from "./en/assessments.json";
import en_positioning from "./en/positioning.json";
import en_rankings from "./en/rankings.json";
import en_compare from "./en/compare.json";
import en_development from "./en/development.json";
import en_federations from "./en/federations.json";
import en_reports from "./en/reports.json";
import en_auth from "./en/auth.json";
import en_live from "./en/live.json";
import en_me from "./en/me.json";
import en_selfService from "./en/selfService.json";
import en_status from "./en/status.json";
import en_admin from "./en/admin.json";
import en_partnerships from "./en/partnerships.json";
import en_finance from "./en/finance.json";
import en_discipline from "./en/discipline.json";
import en_officials from "./en/officials.json";
import en_competitions from "./en/competitions.json";
import en_analytics from "./en/analytics.json";
import en_fixtures from "./en/fixtures.json";
import en_landing from "./en/landing.json";
import en_account from "./en/account.json";

import es_common from "./es/common.json";
import es_roles from "./es/roles.json";
import es_nav from "./es/nav.json";
import es_subtitles from "./es/subtitles.json";
import es_overview from "./es/overview.json";
import es_calendar from "./es/calendar.json";
import es_arae from "./es/arae.json";
import es_copilot from "./es/copilot.json";
import es_referees from "./es/referees.json";
import es_matchReview from "./es/matchReview.json";
import es_assessments from "./es/assessments.json";
import es_positioning from "./es/positioning.json";
import es_rankings from "./es/rankings.json";
import es_compare from "./es/compare.json";
import es_development from "./es/development.json";
import es_federations from "./es/federations.json";
import es_reports from "./es/reports.json";
import es_auth from "./es/auth.json";
import es_live from "./es/live.json";
import es_me from "./es/me.json";
import es_selfService from "./es/selfService.json";
import es_status from "./es/status.json";
import es_admin from "./es/admin.json";
import es_partnerships from "./es/partnerships.json";
import es_finance from "./es/finance.json";
import es_discipline from "./es/discipline.json";
import es_officials from "./es/officials.json";
import es_competitions from "./es/competitions.json";
import es_analytics from "./es/analytics.json";
import es_fixtures from "./es/fixtures.json";
import es_landing from "./es/landing.json";
import es_account from "./es/account.json";

import de_common from "./de/common.json";
import de_roles from "./de/roles.json";
import de_nav from "./de/nav.json";
import de_subtitles from "./de/subtitles.json";
import de_overview from "./de/overview.json";
import de_calendar from "./de/calendar.json";
import de_arae from "./de/arae.json";
import de_copilot from "./de/copilot.json";
import de_referees from "./de/referees.json";
import de_matchReview from "./de/matchReview.json";
import de_assessments from "./de/assessments.json";
import de_positioning from "./de/positioning.json";
import de_rankings from "./de/rankings.json";
import de_compare from "./de/compare.json";
import de_development from "./de/development.json";
import de_federations from "./de/federations.json";
import de_reports from "./de/reports.json";
import de_auth from "./de/auth.json";
import de_live from "./de/live.json";
import de_me from "./de/me.json";
import de_selfService from "./de/selfService.json";
import de_status from "./de/status.json";
import de_admin from "./de/admin.json";
import de_partnerships from "./de/partnerships.json";
import de_finance from "./de/finance.json";
import de_discipline from "./de/discipline.json";
import de_officials from "./de/officials.json";
import de_competitions from "./de/competitions.json";
import de_analytics from "./de/analytics.json";
import de_fixtures from "./de/fixtures.json";
import de_landing from "./de/landing.json";
import de_account from "./de/account.json";

const fr = {
  common: fr_common,
  roles: fr_roles,
  nav: fr_nav,
  subtitles: fr_subtitles,
  overview: fr_overview,
  calendar: fr_calendar,
  arae: fr_arae,
  copilot: fr_copilot,
  referees: fr_referees,
  matchReview: fr_matchReview,
  assessments: fr_assessments,
  positioning: fr_positioning,
  rankings: fr_rankings,
  compare: fr_compare,
  development: fr_development,
  federations: fr_federations,
  reports: fr_reports,
  auth: fr_auth,
  live: fr_live,
  me: fr_me,
  selfService: fr_selfService,
  status: fr_status,
  admin: fr_admin,
  partnerships: fr_partnerships,
  finance: fr_finance,
  discipline: fr_discipline,
  officials: fr_officials,
  competitions: fr_competitions,
  analytics: fr_analytics,
  fixtures: fr_fixtures,
  landing: fr_landing,
  account: fr_account,
};

const en = {
  common: en_common,
  roles: en_roles,
  nav: en_nav,
  subtitles: en_subtitles,
  overview: en_overview,
  calendar: en_calendar,
  arae: en_arae,
  copilot: en_copilot,
  referees: en_referees,
  matchReview: en_matchReview,
  assessments: en_assessments,
  positioning: en_positioning,
  rankings: en_rankings,
  compare: en_compare,
  development: en_development,
  federations: en_federations,
  reports: en_reports,
  auth: en_auth,
  live: en_live,
  me: en_me,
  selfService: en_selfService,
  status: en_status,
  admin: en_admin,
  partnerships: en_partnerships,
  finance: en_finance,
  discipline: en_discipline,
  officials: en_officials,
  competitions: en_competitions,
  analytics: en_analytics,
  fixtures: en_fixtures,
  landing: en_landing,
  account: en_account,
};

const es = {
  common: es_common,
  roles: es_roles,
  nav: es_nav,
  subtitles: es_subtitles,
  overview: es_overview,
  calendar: es_calendar,
  arae: es_arae,
  copilot: es_copilot,
  referees: es_referees,
  matchReview: es_matchReview,
  assessments: es_assessments,
  positioning: es_positioning,
  rankings: es_rankings,
  compare: es_compare,
  development: es_development,
  federations: es_federations,
  reports: es_reports,
  auth: es_auth,
  live: es_live,
  me: es_me,
  selfService: es_selfService,
  status: es_status,
  admin: es_admin,
  partnerships: es_partnerships,
  finance: es_finance,
  discipline: es_discipline,
  officials: es_officials,
  competitions: es_competitions,
  analytics: es_analytics,
  fixtures: es_fixtures,
  landing: es_landing,
  account: es_account,
};

const de = {
  common: de_common,
  roles: de_roles,
  nav: de_nav,
  subtitles: de_subtitles,
  overview: de_overview,
  calendar: de_calendar,
  arae: de_arae,
  copilot: de_copilot,
  referees: de_referees,
  matchReview: de_matchReview,
  assessments: de_assessments,
  positioning: de_positioning,
  rankings: de_rankings,
  compare: de_compare,
  development: de_development,
  federations: de_federations,
  reports: de_reports,
  auth: de_auth,
  live: de_live,
  me: de_me,
  selfService: de_selfService,
  status: de_status,
  admin: de_admin,
  partnerships: de_partnerships,
  finance: de_finance,
  discipline: de_discipline,
  officials: de_officials,
  competitions: de_competitions,
  analytics: de_analytics,
  fixtures: de_fixtures,
  landing: de_landing,
  account: de_account,
};

/** Widen the literal types of a JSON tree so other languages only have to match its shape. */
type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };

/** The shape every language must satisfy, taken from French. */
export type Dict = Widen<typeof fr>;

type Leaves<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${Leaves<T[K]>}`;
}[keyof T & string];

/** Every dotted translation key, e.g. `"common.appName"` or `"auth.role.admin"`. */
export type TKey = Leaves<Dict>;

export const locales = ["fr", "en", "es", "de"] as const;
export type Locale = (typeof locales)[number];

/** French is the default: it is the working language of most CAF federations. */
export const defaultLocale: Locale = "fr";

export const dictionaries: Record<Locale, Dict> = { fr, en, es, de };

/** Native names, for the language menu. */
export const localeLabels: Record<Locale, string> = {
  fr: "Français",
  en: "English",
  es: "Español",
  de: "Deutsch",
};

/** Short codes, for the compact trigger button. */
export const localeCodes: Record<Locale, string> = { fr: "FR", en: "EN", es: "ES", de: "DE" };

/** BCP 47 tags handed to `Intl` / `toLocaleDateString`. */
export const localeTags: Record<Locale, string> = {
  fr: "fr-FR",
  en: "en-GB",
  es: "es-ES",
  de: "de-DE",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}
