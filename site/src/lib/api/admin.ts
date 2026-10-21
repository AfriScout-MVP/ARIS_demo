// Typed wrappers over the management endpoints of the API contract (`api/docs/api-contract.md`).
// Every function returns the unwrapped payload (`{ users: [...] }` -> `[...]`).

import type { AdminRole, TeamKind, ZoneCode } from "@/lib/admin/constants";
import { api } from "./client";
import { API_BASE } from "./config";
import { uploadFile } from "./upload";

export type UiLocale = "fr" | "en" | "es" | "de";

/** `/api/v1/media/<id>` is relative to the Worker; the same origin unless a base URL is configured. */
export function mediaSrc(url: string | null | undefined): string | null {
  if (!url) return null;
  return /^https?:\/\//.test(url) ? url : `${API_BASE}${url}`;
}

// ---------------------------------------------------------------------- users

export interface UserRow {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  officialId: string | null;
  officialName?: string | null;
  federationId: string | null;
  federationCode: string | null;
  country: string | null;
  locale: UiLocale;
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface UserQuery {
  role?: AdminRole;
  q?: string;
  country?: string;
}

export interface CreateUserBody {
  email: string;
  name: string;
  role: AdminRole;
  officialId?: string;
  federationId?: string;
  locale?: UiLocale;
  password: string;
}

export interface PatchUserBody {
  name?: string;
  locale?: UiLocale;
  active?: boolean;
  role?: AdminRole;
  officialId?: string | null;
  federationId?: string | null;
}

export const listUsers = (query: UserQuery = {}, signal?: AbortSignal) =>
  api<{ users: UserRow[] }>("/users", { query: { ...query }, signal }).then((r) => r.users);

export const createUser = (body: CreateUserBody) =>
  api<{ user: UserRow }>("/users", { method: "POST", body }).then((r) => r.user);

export const patchUser = (id: string, body: PatchUserBody) =>
  api<{ user: UserRow }>(`/users/${encodeURIComponent(id)}`, { method: "PATCH", body }).then((r) => r.user);

export const resetUserPassword = (id: string, password: string) =>
  api<unknown>(`/users/${encodeURIComponent(id)}/reset-password`, { method: "POST", body: { password } });

// ------------------------------------------------------------------ officials

/** What the account form needs from `GET /officials` (the register entry has more). */
export interface OfficialOption {
  id: string;
  name: string;
  countryCode: string;
  level?: string;
  kind?: "referee" | "assistant";
  status?: string;
}

export interface OfficialQuery {
  kind?: "referee" | "assistant";
  country?: string;
  q?: string;
  limit?: number;
}

export const listOfficials = (query: OfficialQuery = {}, signal?: AbortSignal) =>
  api<{ officials: OfficialOption[] }>("/officials", { query: { ...query }, signal }).then((r) => r.officials);

// ---------------------------------------------------------------- federations

export interface FederationRow {
  id: string;
  code: string;
  name: string;
  country: string;
  countryName: string;
  status: "active" | "suspended";
  logoUrl: string | null;
  agreementReference: string | null;
  seats: number;
  createdAt: string;
}

export interface CreateFederationBody {
  code: string;
  name: string;
  country: string;
  agreementReference?: string;
}

export interface PatchFederationBody {
  name?: string;
  code?: string;
  status?: "active" | "suspended";
  agreementReference?: string | null;
}

export const listFederations = (signal?: AbortSignal) =>
  api<{ federations: FederationRow[] }>("/federations", { signal }).then((r) => r.federations);

export const createFederation = (body: CreateFederationBody) =>
  api<{ federation: FederationRow }>("/federations", { method: "POST", body }).then((r) => r.federation);

export const patchFederation = (id: string, body: PatchFederationBody) =>
  api<{ federation: FederationRow }>(`/federations/${encodeURIComponent(id)}`, { method: "PATCH", body }).then(
    (r) => r.federation,
  );

export const uploadFederationLogo = (id: string, file: File) =>
  uploadFile(`/federations/${encodeURIComponent(id)}/logo`, file);

// ------------------------------------------------------------------- countries

export interface CountryRow {
  code: string;
  iso2: string;
  name: string;
  nameFr: string;
  nameEs: string;
  nameDe: string;
  flagUrl: string | null;
  zone: ZoneCode;
  capital: string;
  timezone: string;
  currency: string;
  /** Federation code ("FRMF"), or null when the country has none yet. */
  federation: string | null;
  federationName: string | null;
  active: boolean;
}

export interface CountryInput {
  code: string;
  iso2: string;
  name: string;
  nameFr: string;
  nameEs: string;
  nameDe: string;
  zone: ZoneCode;
  capital: string;
  timezone: string;
  currency: string;
}

export interface CreateCountryBody extends CountryInput {
  federation?: { code: string; name: string };
}

export type PatchCountryBody = Partial<Omit<CountryInput, "code">> & { active?: boolean };

/** `all: true` (admin only) includes the countries that were switched off. */
export const listCountries = (all = false, signal?: AbortSignal) =>
  api<{ countries: CountryRow[] }>("/countries", { query: all ? { all: 1 } : undefined, signal }).then(
    (r) => r.countries,
  );

export const createCountry = (body: CreateCountryBody) =>
  api<{ country: CountryRow }>("/countries", { method: "POST", body }).then((r) => r.country);

export const patchCountry = (code: string, body: PatchCountryBody) =>
  api<{ country: CountryRow }>(`/countries/${encodeURIComponent(code)}`, { method: "PATCH", body }).then(
    (r) => r.country,
  );

export const uploadCountryFlag = (code: string, file: File) =>
  uploadFile(`/countries/${encodeURIComponent(code)}/flag`, file);

// ----------------------------------------------------------- teams & stadiums

export interface TeamRow {
  id: string;
  name: string;
  shortName: string | null;
  kind: TeamKind;
  country: string;
  city: string | null;
  logoUrl: string | null;
}

export interface TeamBody {
  name: string;
  shortName?: string;
  kind: TeamKind;
  city?: string;
}

export interface StadiumRow {
  id: string;
  name: string;
  city: string | null;
  country: string;
  capacity: number | null;
}

export interface StadiumBody {
  name: string;
  city: string;
  capacity?: number;
}

export const listTeams = (country: string, signal?: AbortSignal) =>
  api<{ teams: TeamRow[] }>("/teams", { query: { country }, signal }).then((r) => r.teams);

export const createTeam = (country: string, body: TeamBody) =>
  api<{ team: TeamRow }>("/teams", { method: "POST", body: { ...body, country } }).then((r) => r.team);

/** `null` clears an optional field. */
export type TeamPatch = Partial<Pick<TeamBody, "name" | "kind">> & { shortName?: string | null; city?: string | null };
export type StadiumPatch = Partial<Pick<StadiumBody, "name" | "city">> & { capacity?: number | null };

export const patchTeam = (id: string, body: TeamPatch) =>
  api<{ team: TeamRow }>(`/teams/${encodeURIComponent(id)}`, { method: "PATCH", body }).then((r) => r.team);

export const uploadTeamLogo = (id: string, file: File) =>
  uploadFile(`/teams/${encodeURIComponent(id)}/logo`, file);

export const listStadiums = (country: string, signal?: AbortSignal) =>
  api<{ stadiums: StadiumRow[] }>("/stadiums", { query: { country }, signal }).then((r) => r.stadiums);

export const createStadium = (country: string, body: StadiumBody) =>
  api<{ stadium: StadiumRow }>("/stadiums", { method: "POST", body: { ...body, country } }).then((r) => r.stadium);

export const patchStadium = (id: string, body: StadiumPatch) =>
  api<{ stadium: StadiumRow }>(`/stadiums/${encodeURIComponent(id)}`, { method: "PATCH", body }).then(
    (r) => r.stadium,
  );

// ---------------------------------------------------------------------- audit

export interface AuditEntry {
  id: number;
  at: string;
  action: string;
  entity: string;
  entityId: string | null;
  actorId: string | null;
  actorName: string | null;
  actorRole: string | null;
  countryCode?: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
  ip: string | null;
}

export interface AuditPage {
  entries: AuditEntry[];
  /** Cursor for the next (older) page, or null at the end. */
  nextBefore: number | null;
}

export interface AuditQuery {
  entity?: string;
  entityId?: string;
  limit?: number;
  before?: number;
}

export const listAudit = (query: AuditQuery = {}, signal?: AbortSignal) =>
  api<{ entries: AuditEntry[]; nextBefore?: number | null }>("/audit", { query: { ...query }, signal }).then(
    (r): AuditPage => ({ entries: r.entries, nextBefore: r.nextBefore ?? null }),
  );
