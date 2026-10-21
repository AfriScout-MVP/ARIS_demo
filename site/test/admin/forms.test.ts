import { describe, expect, it } from "vitest";
import type { CountryRow } from "@/lib/api/admin";
import {
  countryToValues,
  emptyCountry,
  hasErrors,
  roleChangeBody,
  toCreateCountryBody,
  toCreateFederationBody,
  toCreateUserBody,
  toPatchCountryBody,
  toPatchFederationBody,
  toStadiumBody,
  toStadiumPatch,
  toTeamBody,
  toTeamPatch,
  validateAccount,
  validateCountry,
  validateFederation,
  validatePasswordReset,
  validateRoleChange,
  validateStadium,
  validateTeam,
  type AccountValues,
  type CountryValues,
} from "@/lib/admin/forms";

const account: AccountValues = {
  name: "Nadia Boukhari",
  email: "nadia@frmf.ma",
  role: "referee",
  federationId: "",
  officialId: "off-1",
  locale: "fr",
  password: "Tz7!kQ2#mW9x",
};

describe("accounts", () => {
  it("accepts a complete referee account", () => {
    expect(validateAccount(account)).toEqual({});
  });
  it("reports each missing piece", () => {
    const e = validateAccount({ ...account, name: " ", email: "nope", password: "short", officialId: "" });
    expect(e).toEqual({
      name: "admin.errors.required",
      email: "admin.errors.emailInvalid",
      password: "admin.errors.passwordShort",
      officialId: "admin.errors.pickOfficial",
    });
  });
  it("a federation seat needs a federation, not an official", () => {
    expect(validateAccount({ ...account, role: "federation", officialId: "", federationId: "" }).federationId).toBe("admin.errors.pickFederation");
    expect(validateAccount({ ...account, role: "federation", officialId: "", federationId: "f1" })).toEqual({});
  });
  it("a super-admin needs neither", () => {
    expect(validateAccount({ ...account, role: "admin", officialId: "" })).toEqual({});
  });
  it("builds the request body with only the link that belongs to the role", () => {
    expect(toCreateUserBody({ ...account, email: " nadia@frmf.ma ", name: " Nadia " })).toEqual({
      email: "nadia@frmf.ma",
      name: "Nadia",
      role: "referee",
      locale: "fr",
      password: account.password,
      officialId: "off-1",
    });
    const seat = toCreateUserBody({ ...account, role: "federation", federationId: "f1" });
    expect(seat).toMatchObject({ role: "federation", federationId: "f1" });
    expect(seat).not.toHaveProperty("officialId");
    const admin = toCreateUserBody({ ...account, role: "admin" });
    expect(admin).not.toHaveProperty("officialId");
    expect(admin).not.toHaveProperty("federationId");
  });
  it("role change clears the old link", () => {
    expect(roleChangeBody("federation", "f1", "o1")).toEqual({ role: "federation", federationId: "f1", officialId: null });
    expect(roleChangeBody("referee", "f1", "o1")).toEqual({ role: "referee", federationId: null, officialId: "o1" });
    expect(roleChangeBody("admin", "f1", "o1")).toEqual({ role: "admin", federationId: null, officialId: null });
    expect(validateRoleChange("referee", "", "")).toEqual({ officialId: "admin.errors.pickOfficial" });
    expect(validateRoleChange("admin", "", "")).toEqual({});
  });
  it("password reset needs 12 characters", () => {
    expect(hasErrors(validatePasswordReset("x".repeat(11)))).toBe(true);
    expect(hasErrors(validatePasswordReset("x".repeat(12)))).toBe(false);
  });
});

describe("federations", () => {
  const v = { code: "frmf", name: " Fédération Royale ", country: "MAR", agreementReference: " " };
  it("validates and normalises a creation", () => {
    expect(validateFederation(v, "create")).toEqual({});
    expect(toCreateFederationBody(v)).toEqual({ code: "FRMF", name: "Fédération Royale", country: "MAR" });
    expect(toCreateFederationBody({ ...v, agreementReference: " CAF-2026/14 " }).agreementReference).toBe("CAF-2026/14");
  });
  it("requires a country and a well-formed code on creation only", () => {
    expect(validateFederation({ ...v, country: "", code: "x" }, "create")).toEqual({
      code: "admin.errors.federationCode",
      country: "admin.errors.pickCountry",
    });
    expect(validateFederation({ ...v, country: "", code: "" }, "edit")).toEqual({});
  });
  it("patches only what changed", () => {
    const original = { name: "A", agreementReference: "R1" };
    expect(toPatchFederationBody(original, { ...v, name: "A", agreementReference: "R1" })).toEqual({});
    expect(toPatchFederationBody(original, { ...v, name: "B", agreementReference: "R1" })).toEqual({ name: "B" });
    expect(toPatchFederationBody(original, { ...v, name: "A", agreementReference: "" })).toEqual({ agreementReference: null });
  });
});

const filled: CountryValues = {
  code: "mar",
  iso2: "ma",
  name: "Morocco",
  nameFr: "Maroc",
  nameEs: "Marruecos",
  nameDe: "Marokko",
  zone: "UNAF",
  capital: "Rabat",
  timezone: "Africa/Casablanca",
  currency: "mad",
  federationCode: "",
  federationName: "",
};

describe("countries", () => {
  it("requires every field on an empty form", () => {
    const e = validateCountry(emptyCountry, "create");
    for (const f of ["code", "iso2", "name", "nameFr", "nameEs", "nameDe", "zone", "capital", "timezone", "currency"] as const) expect(e[f], f).toBeDefined();
    expect(e.federationCode).toBeUndefined();
  });
  it("requires an upper-case alpha-3 code as typed", () => {
    expect(validateCountry({ ...filled, code: "mar" }, "create").code).toBeUndefined(); // the field upper-cases as you type; the body does too
    expect(validateCountry({ ...filled, code: "MA" }, "create").code).toBe("admin.errors.alpha3");
    expect(validateCountry({ ...filled, code: "M4R" }, "create").code).toBe("admin.errors.alpha3");
  });
  it("checks zone, time zone and currency", () => {
    const e = validateCountry({ ...filled, zone: "" , timezone: "Mars/Base", currency: "DIRHAM" }, "create");
    expect(e).toMatchObject({ zone: "admin.errors.pickZone", timezone: "admin.errors.timezone", currency: "admin.errors.currency" });
  });
  it("needs both federation fields or neither", () => {
    expect(validateCountry({ ...filled, federationCode: "FRMF" }, "create").federationName).toBe("admin.errors.required");
    expect(validateCountry({ ...filled, federationName: "Fédération" }, "create").federationCode).toBe("admin.errors.required");
    expect(validateCountry({ ...filled, federationCode: "FRMF", federationName: "Fédération" }, "create")).toEqual({});
  });
  it("builds a normalised creation body, with the federation when given", () => {
    const body = toCreateCountryBody({ ...filled, federationCode: "frmf", federationName: " Fédération " });
    expect(body).toMatchObject({ code: "MAR", iso2: "MA", currency: "MAD", zone: "UNAF", federation: { code: "FRMF", name: "Fédération" } });
    expect(toCreateCountryBody(filled)).not.toHaveProperty("federation");
  });
  it("patches only the changed fields and never the code", () => {
    const row: CountryRow = {
      code: "MAR", iso2: "MA", name: "Morocco", nameFr: "Maroc", nameEs: "Marruecos", nameDe: "Marokko", flagUrl: null,
      zone: "UNAF", capital: "Rabat", timezone: "Africa/Casablanca", currency: "MAD", federation: null, federationName: null, active: true,
    };
    expect(toPatchCountryBody(row, countryToValues(row))).toEqual({});
    expect(toPatchCountryBody(row, { ...countryToValues(row), capital: "Casablanca", currency: "mad", zone: "COSAFA" })).toEqual({ capital: "Casablanca", zone: "COSAFA" });
  });
});

describe("teams and stadiums", () => {
  it("validates a team", () => {
    expect(validateTeam({ name: "Wydad AC", shortName: "WAC", kind: "club", city: "" })).toEqual({});
    expect(validateTeam({ name: "A", shortName: "x".repeat(21), kind: "club", city: "" })).toEqual({ name: "admin.errors.tooLong", shortName: "admin.errors.tooLong" });
    expect(validateTeam({ name: "", shortName: "", kind: "club", city: "" }).name).toBe("admin.errors.required");
  });
  it("omits empty optional team fields on create and nulls them on patch", () => {
    const v = { name: " Wydad AC ", shortName: "", kind: "club" as const, city: " Casablanca " };
    expect(toTeamBody(v)).toEqual({ name: "Wydad AC", kind: "club", city: "Casablanca" });
    expect(toTeamPatch(v)).toEqual({ name: "Wydad AC", kind: "club", shortName: null, city: "Casablanca" });
  });
  it("validates a stadium and its capacity", () => {
    expect(validateStadium({ name: "Stade Mohammed V", city: "Casablanca", capacity: "45891" })).toEqual({});
    expect(validateStadium({ name: "Stade", city: "", capacity: "0" })).toEqual({ city: "admin.errors.required", capacity: "admin.errors.capacity" });
  });
  it("sends capacity as a number, omits it when empty, clears it on patch", () => {
    expect(toStadiumBody({ name: "S", city: "C", capacity: "100" })).toEqual({ name: "S", city: "C", capacity: 100 });
    expect(toStadiumBody({ name: "S", city: "C", capacity: "" })).toEqual({ name: "S", city: "C" });
    expect(toStadiumPatch({ name: "S", city: "C", capacity: "" })).toEqual({ name: "S", city: "C", capacity: null });
  });
});
