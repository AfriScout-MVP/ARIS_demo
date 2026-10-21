import { describe, expect, it } from "vitest";
import type { AuditEntry, CountryRow, TeamRow, UserRow } from "@/lib/api/admin";
import { filterAudit, filterCountries, filterTeams, filterUsers, matches, newestFirst, prettyJson } from "@/lib/admin/filters";

const user = (o: Partial<UserRow>): UserRow => ({
  id: "u", email: "a@b.co", name: "A", role: "referee", officialId: null, federationId: null, federationCode: null,
  country: null, locale: "fr", active: true, lastLoginAt: null, createdAt: "2026-01-01T00:00:00Z", ...o,
});

describe("matches", () => {
  it("ignores case and accents", () => {
    expect(matches(["Ségou"], "segou")).toBe(true);
    expect(matches(["Côte d'Ivoire"], "COTE")).toBe(true);
    expect(matches([null, undefined], "x")).toBe(false);
    expect(matches([], "")).toBe(true);
  });
});

describe("filterUsers", () => {
  const users = [
    user({ id: "1", name: "Nadia Boukhari", role: "admin" }),
    user({ id: "2", name: "Youssef Alami", email: "y@frmf.ma", role: "federation", federationCode: "FRMF", country: "MAR" }),
    user({ id: "3", name: "Omar", role: "referee", officialName: "Omar Benali", country: "MAR" }),
  ];
  it("filters by role", () => {
    expect(filterUsers(users, { q: "", role: "federation" }).map((u) => u.id)).toEqual(["2"]);
    expect(filterUsers(users, { q: "", role: "all" })).toHaveLength(3);
  });
  it("searches name, e-mail, official and federation", () => {
    expect(filterUsers(users, { q: "frmf", role: "all" }).map((u) => u.id)).toEqual(["2"]);
    expect(filterUsers(users, { q: "benali", role: "all" }).map((u) => u.id)).toEqual(["3"]);
    expect(filterUsers(users, { q: "nadia", role: "admin" }).map((u) => u.id)).toEqual(["1"]);
    expect(filterUsers(users, { q: "nadia", role: "referee" })).toEqual([]);
  });
});

describe("filterCountries", () => {
  const c = (o: Partial<CountryRow>): CountryRow => ({
    code: "MAR", iso2: "MA", name: "Morocco", nameFr: "Maroc", nameEs: "Marruecos", nameDe: "Marokko", flagUrl: null,
    zone: "UNAF", capital: "Rabat", timezone: "Africa/Casablanca", currency: "MAD", federation: "FRMF", federationName: null, active: true, ...o,
  });
  const list = [c({}), c({ code: "SEN", iso2: "SN", name: "Senegal", nameFr: "Sénégal", nameEs: "Senegal", nameDe: "Senegal", zone: "UFOA-A", capital: "Dakar", federation: null, active: false })];
  it("hides inactive countries on request, filters by zone and searches every name", () => {
    expect(filterCountries(list, { q: "", zone: "all", inactive: false }).map((x) => x.code)).toEqual(["MAR"]);
    expect(filterCountries(list, { q: "", zone: "UFOA-A", inactive: true }).map((x) => x.code)).toEqual(["SEN"]);
    expect(filterCountries(list, { q: "senegal", zone: "all", inactive: true })).toHaveLength(1);
    expect(filterCountries(list, { q: "marokko", zone: "all", inactive: true }).map((x) => x.code)).toEqual(["MAR"]);
  });
});

describe("filterTeams", () => {
  const teams: TeamRow[] = [
    { id: "1", name: "Wydad AC", shortName: "WAC", kind: "club", country: "MAR", city: "Casablanca", logoUrl: null },
    { id: "2", name: "Maroc", shortName: null, kind: "national", country: "MAR", city: null, logoUrl: null },
  ];
  it("filters by kind and text", () => {
    expect(filterTeams(teams, { q: "", kind: "national" }).map((t) => t.id)).toEqual(["2"]);
    expect(filterTeams(teams, { q: "casa", kind: "all" }).map((t) => t.id)).toEqual(["1"]);
  });
});

describe("audit", () => {
  const e = (o: Partial<AuditEntry>): AuditEntry => ({
    id: 1, at: "2026-05-01T09:00:00Z", action: "user.create", entity: "user", entityId: "u1", actorId: null, actorName: "Nadia",
    actorRole: "admin", before: null, after: { email: "x@y.z" }, reason: null, ip: null, ...o,
  });
  const entries = [e({ id: 1 }), e({ id: 2, action: "country.update", entity: "country", entityId: "MAR", after: { active: false } }), e({ id: 3, action: "team.create", actorName: null })];

  it("filters by action text and searches the payloads", () => {
    expect(filterAudit(entries, { action: "country", q: "" }).map((x) => x.id)).toEqual([2]);
    expect(filterAudit(entries, { action: "", q: "x@y.z" }).map((x) => x.id)).toEqual([1, 3]);
    expect(filterAudit(entries, { action: "CREATE", q: "nadia" }).map((x) => x.id)).toEqual([1]);
  });
  it("sorts newest first", () => {
    expect([...entries].sort(newestFirst).map((x) => x.id)).toEqual([3, 2, 1]);
  });
  it("pretty-prints JSON as plain text and never throws", () => {
    expect(prettyJson({ a: 1 })).toBe('{\n  "a": 1\n}');
    expect(prettyJson(null)).toBe("");
    expect(prettyJson("<img src=x onerror=alert(1)>")).toBe('"<img src=x onerror=alert(1)>"');
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(typeof prettyJson(cyclic)).toBe("string");
  });
});
