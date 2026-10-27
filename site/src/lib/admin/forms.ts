// Form rules and the request bodies they produce. Pure functions: the dialogs only render their result.

import type { TKey } from "@/locales";
import type {
  CountryRow,
  CreateCountryBody,
  CreateFederationBody,
  CreateUserBody,
  PatchCountryBody,
  PatchFederationBody,
  StadiumBody,
  StadiumPatch,
  TeamBody,
  TeamPatch,
  UiLocale,
} from "@/lib/api/admin";
import { MAX_PASSWORD, MIN_PASSWORD, TEAM_KINDS, ZONES, type AdminRole, type TeamKind, type ZoneCode } from "./constants";
import {
  isAlpha3,
  isCurrency,
  isEmail,
  isFederationCode,
  isFilled,
  isIso2,
  isTimeZone,
  normalizeCode,
  parseCapacity,
} from "./validators";

export type FormErrors<K extends string> = Partial<Record<K, TKey>>;

const REQUIRED: TKey = "admin.errors.required";

// -------------------------------------------------------------------- accounts

export interface AccountValues {
  name: string;
  email: string;
  role: AdminRole;
  federationId: string;
  officialId: string;
  locale: UiLocale;
  password: string;
}

export type AccountField = "name" | "email" | "federationId" | "officialId" | "password";

export function validateAccount(v: AccountValues): FormErrors<AccountField> {
  const errors: FormErrors<AccountField> = {};
  if (!isFilled(v.name)) errors.name = REQUIRED;
  else if (v.name.trim().length > 120) errors.name = "admin.errors.tooLong";
  if (!isFilled(v.email)) errors.email = REQUIRED;
  else if (!isEmail(v.email)) errors.email = "admin.errors.emailInvalid";
  if (v.password.length < MIN_PASSWORD || v.password.length > MAX_PASSWORD) errors.password = "admin.errors.passwordShort";
  if ((v.role === "federation" || v.role === "tagger") && !v.federationId) errors.federationId = "admin.errors.pickFederation";
  if (v.role === "referee" && !v.officialId) errors.officialId = "admin.errors.pickOfficial";
  return errors;
}

export function toCreateUserBody(v: AccountValues): CreateUserBody {
  return {
    email: v.email.trim(),
    name: v.name.trim(),
    role: v.role,
    locale: v.locale,
    password: v.password,
    ...(v.role === "federation" || v.role === "tagger" ? { federationId: v.federationId } : {}),
    ...(v.role === "referee" ? { officialId: v.officialId } : {}),
  };
}

/** Moving an account to another role also clears the link that belongs to the old one. */
export function roleChangeBody(role: AdminRole, federationId: string, officialId: string) {
  return {
    role,
    federationId: role === "federation" || role === "tagger" ? federationId : null,
    officialId: role === "referee" ? officialId : null,
  };
}

export function validateRoleChange(role: AdminRole, federationId: string, officialId: string): FormErrors<"federationId" | "officialId"> {
  const errors: FormErrors<"federationId" | "officialId"> = {};
  if ((role === "federation" || role === "tagger") && !federationId) errors.federationId = "admin.errors.pickFederation";
  if (role === "referee" && !officialId) errors.officialId = "admin.errors.pickOfficial";
  return errors;
}

export function validatePasswordReset(password: string): FormErrors<"password"> {
  return password.length < MIN_PASSWORD || password.length > MAX_PASSWORD ? { password: "admin.errors.passwordShort" } : {};
}

// ----------------------------------------------------------------- federations

export interface FederationValues {
  code: string;
  name: string;
  country: string;
  agreementReference: string;
}

export type FederationField = "code" | "name" | "country";

export function validateFederation(v: FederationValues, mode: "create" | "edit"): FormErrors<FederationField> {
  const errors: FormErrors<FederationField> = {};
  if (mode === "create") {
    if (!isFilled(v.code)) errors.code = REQUIRED;
    else if (!isFederationCode(normalizeCode(v.code))) errors.code = "admin.errors.federationCode";
    if (!v.country) errors.country = "admin.errors.pickCountry";
  }
  if (!isFilled(v.name)) errors.name = REQUIRED;
  else if (v.name.trim().length > 160) errors.name = "admin.errors.tooLong";
  return errors;
}

export function toCreateFederationBody(v: FederationValues): CreateFederationBody {
  const agreement = v.agreementReference.trim();
  return {
    code: normalizeCode(v.code),
    name: v.name.trim(),
    country: v.country,
    ...(agreement ? { agreementReference: agreement } : {}),
  };
}

export function toPatchFederationBody(
  original: { name: string; agreementReference: string | null },
  v: FederationValues,
): PatchFederationBody {
  const body: PatchFederationBody = {};
  if (v.name.trim() !== original.name) body.name = v.name.trim();
  const agreement = v.agreementReference.trim();
  if (agreement !== (original.agreementReference ?? "")) body.agreementReference = agreement || null;
  return body;
}

// ------------------------------------------------------------------- countries

export interface CountryValues {
  code: string;
  iso2: string;
  name: string;
  nameFr: string;
  nameEs: string;
  nameDe: string;
  zone: ZoneCode | "";
  capital: string;
  timezone: string;
  currency: string;
  federationCode: string;
  federationName: string;
}

export type CountryField = keyof CountryValues;

export const emptyCountry: CountryValues = {
  code: "",
  iso2: "",
  name: "",
  nameFr: "",
  nameEs: "",
  nameDe: "",
  zone: "",
  capital: "",
  timezone: "",
  currency: "",
  federationCode: "",
  federationName: "",
};

export function countryToValues(c: CountryRow): CountryValues {
  return {
    code: c.code,
    iso2: c.iso2,
    name: c.name,
    nameFr: c.nameFr,
    nameEs: c.nameEs,
    nameDe: c.nameDe,
    zone: c.zone,
    capital: c.capital,
    timezone: c.timezone,
    currency: c.currency,
    federationCode: "",
    federationName: "",
  };
}

export function validateCountry(v: CountryValues, mode: "create" | "edit"): FormErrors<CountryField> {
  const errors: FormErrors<CountryField> = {};
  if (mode === "create") {
    if (!isFilled(v.code)) errors.code = REQUIRED;
    else if (!isAlpha3(normalizeCode(v.code))) errors.code = "admin.errors.alpha3";
  }
  if (!isFilled(v.iso2)) errors.iso2 = REQUIRED;
  else if (!isIso2(normalizeCode(v.iso2))) errors.iso2 = "admin.errors.iso2";
  for (const field of ["name", "nameFr", "nameEs", "nameDe", "capital"] as const) {
    if (!isFilled(v[field])) errors[field] = REQUIRED;
    else if (v[field].trim().length > 120) errors[field] = "admin.errors.tooLong";
  }
  if (!(ZONES as readonly string[]).includes(v.zone)) errors.zone = "admin.errors.pickZone";
  if (!isFilled(v.timezone)) errors.timezone = REQUIRED;
  else if (!isTimeZone(v.timezone.trim())) errors.timezone = "admin.errors.timezone";
  if (!isFilled(v.currency)) errors.currency = REQUIRED;
  else if (!isCurrency(normalizeCode(v.currency))) errors.currency = "admin.errors.currency";
  if (mode === "create") {
    const hasCode = isFilled(v.federationCode);
    const hasName = isFilled(v.federationName);
    if (hasCode && !isFederationCode(normalizeCode(v.federationCode))) errors.federationCode = "admin.errors.federationCode";
    if (hasCode && !hasName) errors.federationName = REQUIRED;
    if (hasName && !hasCode) errors.federationCode = REQUIRED;
  }
  return errors;
}

/** Assumes `validateCountry` passed. The code is typed in any case; the server wants it upper case. */
export function toCreateCountryBody(v: CountryValues): CreateCountryBody {
  const body: CreateCountryBody = {
    code: v.code.trim().toUpperCase(),
    iso2: normalizeCode(v.iso2),
    name: v.name.trim(),
    nameFr: v.nameFr.trim(),
    nameEs: v.nameEs.trim(),
    nameDe: v.nameDe.trim(),
    zone: v.zone as ZoneCode,
    capital: v.capital.trim(),
    timezone: v.timezone.trim(),
    currency: normalizeCode(v.currency),
  };
  if (isFilled(v.federationCode) && isFilled(v.federationName)) {
    body.federation = { code: normalizeCode(v.federationCode), name: v.federationName.trim() };
  }
  return body;
}

/** Only what changed, so an edit does not rewrite fields it did not touch. */
export function toPatchCountryBody(original: CountryRow, v: CountryValues): PatchCountryBody {
  const next = toCreateCountryBody({ ...v, code: original.code, federationCode: "", federationName: "" });
  const body: PatchCountryBody = {};
  const fields = ["iso2", "name", "nameFr", "nameEs", "nameDe", "zone", "capital", "timezone", "currency"] as const;
  for (const field of fields) {
    if (next[field] !== original[field]) (body as Record<string, string>)[field] = next[field];
  }
  return body;
}

// --------------------------------------------------------------- teams, stadiums

export interface TeamValues {
  name: string;
  shortName: string;
  kind: TeamKind;
  city: string;
}

export function validateTeam(v: TeamValues): FormErrors<"name" | "shortName" | "kind"> {
  const errors: FormErrors<"name" | "shortName" | "kind"> = {};
  if (!isFilled(v.name)) errors.name = REQUIRED;
  else if (v.name.trim().length < 2 || v.name.trim().length > 100) errors.name = "admin.errors.tooLong";
  if (v.shortName.trim().length > 20) errors.shortName = "admin.errors.tooLong";
  if (!(TEAM_KINDS as readonly string[]).includes(v.kind)) errors.kind = REQUIRED;
  return errors;
}

export function toTeamBody(v: TeamValues): TeamBody {
  const shortName = v.shortName.trim();
  const city = v.city.trim();
  return { name: v.name.trim(), kind: v.kind, ...(shortName ? { shortName } : {}), ...(city ? { city } : {}) };
}

export interface StadiumValues {
  name: string;
  city: string;
  capacity: string;
}

export function validateStadium(v: StadiumValues): FormErrors<"name" | "city" | "capacity"> {
  const errors: FormErrors<"name" | "city" | "capacity"> = {};
  if (!isFilled(v.name)) errors.name = REQUIRED;
  else if (v.name.trim().length < 2 || v.name.trim().length > 120) errors.name = "admin.errors.tooLong";
  if (!isFilled(v.city)) errors.city = REQUIRED;
  if (!parseCapacity(v.capacity).ok) errors.capacity = "admin.errors.capacity";
  return errors;
}

/** For PATCH: an emptied capacity is sent as `null` so the Worker clears it. */
export function toStadiumPatch(v: StadiumValues): StadiumPatch {
  const capacity = parseCapacity(v.capacity);
  return { name: v.name.trim(), city: v.city.trim(), capacity: capacity.ok ? capacity.value : null };
}

export function toTeamPatch(v: TeamValues): TeamPatch {
  return { name: v.name.trim(), kind: v.kind, shortName: v.shortName.trim() || null, city: v.city.trim() || null };
}

export function toStadiumBody(v: StadiumValues): StadiumBody {
  const capacity = parseCapacity(v.capacity);
  return { name: v.name.trim(), city: v.city.trim(), ...(capacity.ok && capacity.value !== null ? { capacity: capacity.value } : {}) };
}

export const hasErrors = (errors: object) => Object.keys(errors).length > 0;
