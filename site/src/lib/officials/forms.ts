import type { TKey } from "@/locales";
import { isEmail } from "@/lib/admin/validators";
import {
  DOC_TYPES,
  EDITABLE_STATUSES,
  MAX_DOC_BYTES,
  type CreateOfficialBody,
  type Discipline,
  type DocStatus,
  type EditableStatus,
  type OfficialDocument,
  type OfficialFile,
  type OfficialLevel,
  type OfficialStatus,
  type PatchOfficialBody,
} from "@/lib/api/officials";
import type { Tone } from "@/components/ui";

/* What the official's form holds (text, as typed) and how it becomes a request. Pure: tested on its own. */

export interface OfficialValues {
  kind: "referee" | "assistant";
  name: string;
  countryCode: string;
  level: OfficialLevel;
  status: OfficialStatus;
  matricule: string;
  licenceNo: string;
  nationality: string;
  birthDate: string;
  city: string;
  region: string;
  league: string;
  email: string;
  phone: string;
  disciplines: Discipline[];
  /** Typed as "SEN, GMB": country codes or regions, comma separated. */
  zones: string;
  varQualified: boolean;
  yearsActive: string;
  bioFr: string;
  bioEn: string;
  bioEs: string;
  bioDe: string;
}

export type OfficialField =
  | "name"
  | "countryCode"
  | "matricule"
  | "licenceNo"
  | "birthDate"
  | "email"
  | "yearsActive"
  | "disciplines"
  | "zones";

export type OfficialErrors = Partial<Record<OfficialField, TKey>>;

export function emptyOfficial(countryCode = ""): OfficialValues {
  return {
    kind: "referee",
    name: "",
    countryCode,
    level: "National D1",
    status: "active",
    matricule: "",
    licenceNo: "",
    nationality: "",
    birthDate: "",
    city: "",
    region: "",
    league: "",
    email: "",
    phone: "",
    disciplines: ["football"],
    zones: "",
    varQualified: false,
    yearsActive: "0",
    bioFr: "",
    bioEn: "",
    bioEs: "",
    bioDe: "",
  };
}

export function fromFile(f: OfficialFile): OfficialValues {
  return {
    kind: f.kind,
    name: f.name,
    countryCode: f.countryCode,
    level: f.level,
    status: f.status,
    matricule: f.matricule ?? "",
    licenceNo: f.licenceNo ?? "",
    nationality: f.nationality ?? "",
    birthDate: f.birthDate ?? "",
    city: f.city ?? "",
    region: f.region ?? "",
    league: f.league ?? "",
    email: f.email ?? "",
    phone: f.phone ?? "",
    disciplines: f.disciplines.length ? f.disciplines : ["football"],
    zones: f.interventionZones.join(", "),
    varQualified: f.varQualified,
    yearsActive: String(f.yearsActive ?? 0),
    bioFr: f.bio?.fr ?? "",
    bioEn: f.bio?.en ?? "",
    bioEs: f.bio?.es ?? "",
    bioDe: f.bio?.de ?? "",
  };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** "sen, Dakar ,, GMB" → ["SEN", "Dakar", "GMB"]: country codes upper-cased, duplicates dropped. */
export function parseZones(raw: string): string[] {
  const out: string[] = [];
  for (const part of raw.split(/[,;\n]/)) {
    const v = part.trim();
    if (!v) continue;
    const z = /^[a-z]{3}$/i.test(v) ? v.toUpperCase() : v;
    if (!out.includes(z)) out.push(z);
  }
  return out;
}

export const isEditableStatus = (s: string): s is EditableStatus => (EDITABLE_STATUSES as readonly string[]).includes(s);

/**
 * The Worker's rules, checked before the request leaves. `today` keeps a birth date out of the future and
 * the official at least 16 — younger than that is a typing mistake, not a referee.
 */
export function validateOfficial(v: OfficialValues, opts: { creating: boolean; needsCountry: boolean; today: string }): OfficialErrors {
  const e: OfficialErrors = {};
  const name = v.name.trim();
  if (name.length < 2 || name.length > 120) e.name = "officials.errors.name";
  if (opts.creating && opts.needsCountry && !/^[A-Z]{3}$/.test(v.countryCode)) e.countryCode = "officials.errors.country";
  if (opts.creating && v.matricule.trim() && (v.matricule.trim().length < 3 || v.matricule.trim().length > 40)) e.matricule = "officials.errors.code";
  if (v.licenceNo.trim() && (v.licenceNo.trim().length < 3 || v.licenceNo.trim().length > 40)) e.licenceNo = "officials.errors.code";
  if (v.birthDate) {
    const latest = `${Number(opts.today.slice(0, 4)) - 16}${opts.today.slice(4)}`;
    if (!DAY.test(v.birthDate) || v.birthDate > latest || v.birthDate < "1930-01-01") e.birthDate = "officials.errors.birthDate";
  }
  if (v.email.trim() && !isEmail(v.email)) e.email = "admin.errors.emailInvalid";
  const years = v.yearsActive.trim();
  if (!/^\d{1,2}$/.test(years) || Number(years) > 60) e.yearsActive = "officials.errors.years";
  if (v.disciplines.length === 0) e.disciplines = "officials.errors.disciplines";
  const zones = parseZones(v.zones);
  if (zones.length > 30 || zones.some((z) => z.length > 20)) e.zones = "officials.errors.zones";
  return e;
}

const opt = (s: string) => (s.trim() ? s.trim() : undefined);
const nul = (s: string) => (s.trim() ? s.trim() : null);

function bioOf(v: OfficialValues) {
  return {
    fr: v.bioFr.trim(),
    en: v.bioEn.trim(),
    ...(v.bioEs.trim() ? { es: v.bioEs.trim() } : {}),
    ...(v.bioDe.trim() ? { de: v.bioDe.trim() } : {}),
  };
}

export function toCreateBody(v: OfficialValues, opts: { admin: boolean }): CreateOfficialBody {
  return {
    kind: v.kind,
    name: v.name.trim(),
    // a federation seat's officials are its own country's: the Worker fills it in
    ...(opts.admin ? { countryCode: v.countryCode } : {}),
    level: v.level,
    status: isEditableStatus(v.status) ? v.status : "active",
    ...(opts.admin && opt(v.matricule) ? { matricule: opt(v.matricule) } : {}),
    licenceNo: opt(v.licenceNo),
    nationality: opt(v.nationality),
    birthDate: opt(v.birthDate),
    city: opt(v.city),
    region: opt(v.region),
    league: opt(v.league),
    email: opt(v.email),
    phone: opt(v.phone),
    disciplines: v.disciplines,
    interventionZones: parseZones(v.zones),
    varQualified: v.varQualified,
    yearsActive: Number(v.yearsActive.trim() || 0),
    bio: bioOf(v),
  };
}

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Only what changed, so the audit log says what was edited — and a suspended official's status is never sent. */
export function toPatch(v: OfficialValues, before: OfficialFile): PatchOfficialBody {
  const p: PatchOfficialBody = {};
  if (v.name.trim() !== before.name) p.name = v.name.trim();
  if (v.level !== before.level) p.level = v.level;
  if (before.status !== "suspended" && v.status !== before.status && isEditableStatus(v.status)) p.status = v.status;
  const text = [
    ["licenceNo", v.licenceNo, before.licenceNo],
    ["nationality", v.nationality, before.nationality],
    ["birthDate", v.birthDate, before.birthDate],
    ["city", v.city, before.city || null],
    ["region", v.region, before.region],
    ["league", v.league, before.league],
    ["email", v.email, before.email],
    ["phone", v.phone, before.phone],
  ] as const;
  for (const [key, value, old] of text) {
    const next = nul(value);
    if (next !== (old ?? null)) (p as Record<string, unknown>)[key] = next;
  }
  if (!sameList(v.disciplines, before.disciplines)) p.disciplines = v.disciplines;
  const zones = parseZones(v.zones);
  if (!sameList(zones, before.interventionZones)) p.interventionZones = zones;
  if (v.varQualified !== before.varQualified) p.varQualified = v.varQualified;
  const years = Number(v.yearsActive.trim() || 0);
  if (years !== before.yearsActive) p.yearsActive = years;
  const bio = bioOf(v);
  const old = before.bio ?? { fr: "", en: "" };
  if (bio.fr !== (old.fr ?? "") || bio.en !== (old.en ?? "") || (bio.es ?? "") !== (old.es ?? "") || (bio.de ?? "") !== (old.de ?? "")) p.bio = bio;
  return p;
}

/** The fields an official may change on their own file (the Worker refuses the rest with 403). */
export const SELF_FIELDS = ["email", "phone", "city", "region", "interventionZones"] as const;

export function toSelfPatch(v: Pick<OfficialValues, "email" | "phone" | "city" | "region" | "zones">, before: OfficialFile): PatchOfficialBody {
  const p: PatchOfficialBody = {};
  for (const key of ["email", "phone", "city", "region"] as const) {
    const next = nul(v[key]);
    if (next !== ((key === "city" ? before.city || null : before[key]) ?? null)) p[key] = next;
  }
  const zones = parseZones(v.zones);
  if (!sameList(zones, before.interventionZones)) p.interventionZones = zones;
  return p;
}

/* ------------------------------------------------------------- documents */

export type FileProblem = "empty" | "type" | "size";

export function validateDocumentFile(file: { type: string; size: number }, kind: string): FileProblem | null {
  if (!(DOC_TYPES as readonly string[]).includes(file.type)) return "type";
  if (kind === "photo" && !file.type.startsWith("image/")) return "type";
  if (file.size === 0) return "empty";
  if (file.size > MAX_DOC_BYTES) return "size";
  return null;
}

export const DOC_STATUS_TONE: Record<DocStatus, Tone> = { pending: "amber", verified: "pitch", rejected: "red" };

export type DocExpiry = "none" | "valid" | "expiring" | "expired";

/** A document with a date on it lapses like a licence: 30 days' warning. */
export function docExpiry(doc: Pick<OfficialDocument, "expiresOn">, today: string, warnDays = 30): DocExpiry {
  if (!doc.expiresOn) return "none";
  if (doc.expiresOn < today) return "expired";
  const days = Math.round((Date.parse(`${doc.expiresOn}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
  return days <= warnDays ? "expiring" : "valid";
}

/** What the federation still has to look at, and what has lapsed. */
export function documentSummary(docs: OfficialDocument[], today: string) {
  return {
    pending: docs.filter((d) => d.status === "pending").length,
    expired: docs.filter((d) => d.status !== "rejected" && docExpiry(d, today) === "expired").length,
    expiring: docs.filter((d) => d.status !== "rejected" && docExpiry(d, today) === "expiring").length,
  };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export const STATUS_TONE: Record<OfficialStatus, Tone> = {
  active: "neutral",
  "elite-pool": "pitch",
  training: "amber",
  unavailable: "chalk",
  retired: "neutral",
  suspended: "red",
};
