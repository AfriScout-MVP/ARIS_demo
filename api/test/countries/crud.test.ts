import { describe, expect, it } from "vitest";
import { addCountry, addFederationSeat, addOfficial, addTeam, addUser, api, login, sql } from "../helpers";

describe("countries", async () => {
  await addUser("ct-admin@aris.test", "admin");
  const seatA = await addFederationSeat("CTA");
  await addCountry("CTB");
  await addCountry("CTI", { active: false });
  await addTeam("Alpha FC", "CTA");
  await addTeam("Beta FC", "CTA");
  await addTeam("CTA", "CTA", "national");
  await addOfficial("ct-off", "CTA");
  await addUser("ct-ref@aris.test", "referee", { officialId: "ct-off" });
  const admin = await login("ct-admin@aris.test");
  const fed = await login(seatA.email);
  const ref = await login("ct-ref@aris.test");
  const newCountry = (o: object = {}) => ({
    code: "NEW", iso2: "NW", name: "Newland", nameFr: "Nouvelle-Terre", nameEs: "Tierranueva", nameDe: "Neuland", zone: "CECAFA",
    capital: "Newtown", timezone: "Africa/Nairobi", currency: "kes", ...o,
  });

  it("lists active countries to any signed-in user; inactive ones only to an admin with all=1", async () => {
    for (const s of [admin, fed, ref]) {
      const list = (await api("GET", "/api/v1/countries", { session: s })).json.countries as Array<{ code: string }>;
      expect(list.map((c) => c.code)).toEqual(expect.arrayContaining(["CTA", "CTB"]));
      expect(list.map((c) => c.code)).not.toContain("CTI");
    }
    expect((await api("GET", "/api/v1/countries?all=1", { session: fed })).json.countries.map((c: { code: string }) => c.code)).not.toContain("CTI");
    expect((await api("GET", "/api/v1/countries?all=1", { session: admin })).json.countries.map((c: { code: string }) => c.code)).toContain("CTI");
    expect((await api("GET", "/api/v1/countries")).status).toBe(401);
  });

  it("returns the Country shape with clubs, and sync internals only to admins and the country's own federation", async () => {
    const mine = (await api("GET", "/api/v1/countries", { session: fed })).json.countries;
    const cta = mine.find((c: { code: string }) => c.code === "CTA");
    expect(cta).toMatchObject({ iso2: expect.any(String), nameFr: "CTA fr", nameEs: "CTA es", nameDe: "CTA de", federation: "CTAFF", federationName: "Federation CTA", active: true, flagUrl: null, timezone: "UTC", currency: "XOF" });
    expect(cta.clubs).toEqual(["Alpha FC", "Beta FC"]); // national sides are not clubs
    expect(cta).toHaveProperty("syncSource");
    const ctb = mine.find((c: { code: string }) => c.code === "CTB");
    expect(ctb).not.toHaveProperty("syncSource");
    expect(ctb).not.toHaveProperty("syncHealth");
    expect(ctb.federation).toBeNull();
    const asRef = (await api("GET", "/api/v1/countries", { session: ref })).json.countries.find((c: { code: string }) => c.code === "CTA");
    expect(asRef).not.toHaveProperty("syncSource");
    const asAdmin = (await api("GET", "/api/v1/countries", { session: admin })).json.countries.find((c: { code: string }) => c.code === "CTB");
    expect(asAdmin).toHaveProperty("syncSource");
  });

  it("adds a country (admin only), optionally with its federation in the same batch", async () => {
    const res = await api("POST", "/api/v1/countries", { session: admin, body: newCountry({ federation: { code: "nfa", name: "New Football Association" } }) });
    expect(res.status).toBe(201);
    expect(res.json.country).toMatchObject({ code: "NEW", iso2: "NW", currency: "KES", active: true, federation: "NFA", federationName: "New Football Association" });
    const plain = await api("POST", "/api/v1/countries", { session: admin, body: newCountry({ code: "PLN", iso2: "PL", name: "Plainland" }) });
    expect(plain.status).toBe(201);
    expect(plain.json.country).toMatchObject({ federation: null, nameFr: "Nouvelle-Terre", timezone: "Africa/Nairobi" });
    expect((await sql("SELECT COUNT(*) AS n FROM audit_log WHERE entity = 'country' AND action = 'country.create'").first<{ n: number }>())!.n).toBe(2);
    for (const s of [fed, ref, null]) expect((await api("POST", "/api/v1/countries", { session: s, body: newCountry({ code: "XYZ", iso2: "XY" }) })).status).toBe(s ? 403 : 401);
  });

  it("refuses duplicates, a taken federation code and invalid values", async () => {
    const post = (o: object) => api("POST", "/api/v1/countries", { session: admin, body: newCountry(o) });
    expect((await post({})).json.error.code).toBe("country_exists");
    expect((await post({ code: "DUP", iso2: "NW" })).json.error.code).toBe("country_exists");
    expect((await post({ code: "FED", iso2: "FD", federation: { code: "NFA", name: "Again" } })).json.error.code).toBe("federation_code_taken");
    expect((await sql("SELECT COUNT(*) AS n FROM countries WHERE code = 'FED'").first<{ n: number }>())!.n).toBe(0);
    expect((await post({ code: "AB", iso2: "AB" })).status).toBe(422);
    expect((await post({ code: "TZX", iso2: "TX", timezone: "Mars/Olympus" })).status).toBe(422);
    expect((await post({ code: "ZNX", iso2: "ZX", zone: "ATLANTIS" })).status).toBe(422);
  });

  it("patches fields and the active flag, and audits a deactivation", async () => {
    const res = await api("PATCH", "/api/v1/countries/NEW", { session: admin, body: { capital: "New Capital", nameDe: "Neuland 2", currency: "ugx" } });
    expect(res.status).toBe(200);
    expect(res.json.country).toMatchObject({ capital: "New Capital", nameDe: "Neuland 2", currency: "UGX" });
    const off = await api("PATCH", "/api/v1/countries/new", { session: admin, body: { active: false } });
    expect(off.json.country.active).toBe(false);
    expect((await api("GET", "/api/v1/countries", { session: admin })).json.countries.map((c: { code: string }) => c.code)).not.toContain("NEW");
    const audit = await api("GET", "/api/v1/audit?entity=country&entityId=NEW", { session: admin });
    expect(audit.json.entries.map((e: { action: string }) => e.action)).toContain("country.deactivate");
    expect((await api("PATCH", "/api/v1/countries/NEW", { session: admin, body: { iso2: "CTB".slice(0, 2) } })).status).toBeLessThan(500);
    expect((await api("PATCH", "/api/v1/countries/NEW", { session: admin, body: {} })).status).toBe(422);
    expect((await api("PATCH", "/api/v1/countries/ZZZ", { session: admin, body: { capital: "x" } })).status).toBe(404);
    for (const s of [fed, ref]) expect((await api("PATCH", "/api/v1/countries/CTA", { session: s, body: { active: false } })).status).toBe(403);
  });
});
