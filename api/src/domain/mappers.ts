// Database rows → the shapes the ARIS app speaks (the store types in site/src/lib/store).
import type { Localized } from "../lib/localized";

/** Where a stored image is served from. Public assets (flags, crests) need no session. */
export const mediaUrl = (id: string | null | undefined) => (id ? `/api/v1/media/${id}` : null);

export interface OfficialRow {
  id: string;
  kind: "referee" | "assistant";
  matricule: string | null;
  licence_no: string | null;
  name: string;
  initials: string;
  country_code: string;
  nationality: string | null;
  birth_date: string | null;
  city: string | null;
  region: string | null;
  league: string | null;
  intervention_zones: string;
  disciplines: string;
  email: string | null;
  phone: string | null;
  photo_media_id: string | null;
  level: string;
  status: string;
  var_qualified: number;
  years_active: number;
  arps: number;
  rmcs_avg: number;
  fitness: number;
  matches: number;
  yellow_cards: number;
  red_cards: number;
  var_accuracy: number;
  trend: number;
  bio: string;
  updated_at: string;
}

export const json = <T>(raw: string | null | undefined, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

export function ageOf(birthDate: string | null, now = new Date()) {
  if (!birthDate) return 0;
  const b = new Date(`${birthDate}T12:00:00Z`);
  let age = now.getUTCFullYear() - b.getUTCFullYear();
  const beforeBirthday = now.getUTCMonth() < b.getUTCMonth() || (now.getUTCMonth() === b.getUTCMonth() && now.getUTCDate() < b.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

/** The referee as the app's `Referee` type. */
export function toReferee(r: OfficialRow) {
  return {
    id: r.id,
    name: r.name,
    initials: r.initials,
    countryCode: r.country_code,
    city: r.city ?? "",
    level: r.level,
    age: ageOf(r.birth_date),
    yearsActive: r.years_active,
    status: r.status,
    arps: r.arps,
    rmcsAvg: r.rmcs_avg,
    fitness: r.fitness,
    matches: r.matches,
    cards: { yellow: r.yellow_cards, red: r.red_cards },
    varAccuracy: r.var_accuracy,
    varQualified: r.var_qualified === 1,
    trend: r.trend,
    bio: json<Localized>(r.bio, { fr: "", en: "" }),
    photoUrl: mediaUrl(r.photo_media_id),
  };
}

/** The assistant as the app's `Assistant` type. */
export function toAssistant(r: OfficialRow) {
  return {
    id: r.id,
    name: r.name,
    initials: r.initials,
    countryCode: r.country_code,
    level: r.level,
    rating: r.rmcs_avg,
    photoUrl: mediaUrl(r.photo_media_id),
  };
}

/**
 * The full register entry. `full: false` omits what only the commission and the
 * official themselves may see — date of birth, phone, e-mail, registration numbers.
 */
export function toOfficialFile(r: OfficialRow, full: boolean) {
  const base = {
    ...(r.kind === "referee" ? toReferee(r) : toAssistant(r)),
    kind: r.kind,
    // what the register edits, for an assistant as much as for a referee
    status: r.status,
    city: r.city ?? "",
    yearsActive: r.years_active,
    varQualified: r.var_qualified === 1,
    bio: json<Localized>(r.bio, { fr: "", en: "" }),
    region: r.region,
    league: r.league,
    nationality: r.nationality,
    disciplines: json<string[]>(r.disciplines, ["football"]),
    interventionZones: json<string[]>(r.intervention_zones, []),
    hasPhoto: Boolean(r.photo_media_id),
  };
  if (!full) return base;
  return { ...base, matricule: r.matricule, licenceNo: r.licence_no, birthDate: r.birth_date, email: r.email, phone: r.phone, updatedAt: r.updated_at };
}
