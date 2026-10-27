import { describe, expect, it } from "vitest";
import { addCountry, addFederationSeat, addOfficial, addUser, api, login, sql } from "../helpers";

describe("the register", async () => {
  await addUser("rg-admin@aris.test", "admin");
  const sa = await addFederationSeat("RGA");
  const sb = await addFederationSeat("RGB");
  await addCountry("RGC");
  await addOfficial("rg-existing", "RGA");
  await addUser("rg-ref@aris.test", "referee", { officialId: "rg-existing" });
  const admin = await login("rg-admin@aris.test");
  const fedA = await login(sa.email);
  const fedB = await login(sb.email);
  const ref = await login("rg-ref@aris.test");
  const person = (o: object = {}) => ({ kind: "referee", name: "Ahmed Ben Salah", level: "National D1", city: "Rgaville", ...o });
  const create = (s: typeof admin | null, body: object) => api("POST", "/api/v1/officials", { session: s, body });

  it("lets a federation seat register officials of its own country, with a generated matricule per country", async () => {
    const one = await create(fedA, person());
    expect(one.status).toBe(201);
    expect(one.json.official).toMatchObject({ name: "Ahmed Ben Salah", initials: "ABS", countryCode: "RGA", kind: "referee", level: "National D1", status: "active", matricule: "ARIS-RGA-R0001", hasPhoto: false });
    const two = await create(fedA, person({ name: "Bilal Traoré", disciplines: ["futsal"], interventionZones: ["RGA"], birthDate: "1990-05-01", email: "b@x.org", phone: "+1", bio: { fr: "Bio", en: "Bio en", es: "Bio es" } }));
    expect(two.json.official).toMatchObject({ matricule: "ARIS-RGA-R0002", disciplines: ["futsal"], interventionZones: ["RGA"], birthDate: "1990-05-01", bio: { fr: "Bio", en: "Bio en", es: "Bio es" } });
    const other = await create(fedB, person());
    expect(other.json.official.matricule).toBe("ARIS-RGB-R0001"); // numbering is per country
    expect(one.json.official.id).toMatch(/^off-/);
    expect((await sql("SELECT country_code, action FROM audit_log WHERE action = 'official.create' AND entity_id = ?", one.json.official.id).first())).toEqual({ country_code: "RGA", action: "official.create" });
  });

  it("an assistant's file carries what the register edits (status, city, years, VAR, bio)", async () => {
    const res = await create(fedA, person({ kind: "assistant", name: "Assistant Kone", status: "unavailable", yearsActive: 4, varQualified: true, bio: { fr: "AR", en: "AR" } }));
    expect(res.status).toBe(201);
    expect(res.json.official).toMatchObject({ kind: "assistant", status: "unavailable", city: "Rgaville", yearsActive: 4, varQualified: true, bio: { fr: "AR", en: "AR" } });
    const listed = await api("GET", "/api/v1/officials?kind=assistant", { session: fedA });
    expect(listed.json.officials.find((o: { id: string }) => o.id === res.json.official.id)).toMatchObject({ status: "unavailable", yearsActive: 4 });
  });

  it("an explicit country must be its own (404 otherwise); the matricule is not the seat's to choose", async () => {
    expect((await create(fedA, person({ countryCode: "RGA" }))).status).toBe(201);
    const foreign = await create(fedA, person({ countryCode: "RGB", name: "Foreign Intruder" }));
    expect(foreign.status).toBe(404);
    expect((await sql("SELECT COUNT(*) AS n FROM officials WHERE name = 'Foreign Intruder'").first<{ n: number }>())!.n).toBe(0);
    expect((await create(fedA, person({ matricule: "ARIS-RGB-R9999" }))).status).toBe(403);
  });

  it("lets an admin register anywhere, choosing the country (and optionally the matricule and id)", async () => {
    expect((await create(admin, person())).status).toBe(422);
    const res = await create(admin, person({ countryCode: "RGC", id: "rg-custom", matricule: "CUSTOM-1", licenceNo: "LIC-1" }));
    expect(res.status).toBe(201);
    expect(res.json.official).toMatchObject({ id: "rg-custom", matricule: "CUSTOM-1", licenceNo: "LIC-1", countryCode: "RGC" });
    expect((await create(admin, person({ countryCode: "RGC", licenceNo: "LIC-1" }))).json.error.code).toBe("duplicate");
    expect((await create(admin, person({ countryCode: "RGC", id: "rg-custom" }))).status).toBe(409);
    expect((await create(admin, person({ countryCode: "ZZZ" }))).json.error.code).toBe("unknown_country");
    const next = await create(admin, person({ countryCode: "RGC" }));
    expect(next.json.official.matricule).toBe("ARIS-RGC-R0001"); // a free-form matricule does not disturb the sequence
  });

  it("validates input and refuses referees and anonymous callers", async () => {
    expect((await create(fedA, person({ level: "Galactic" }))).status).toBe(422);
    expect((await create(fedA, person({ name: "X" }))).status).toBe(422);
    expect((await create(fedA, person({ birthDate: "01/02/1990" }))).status).toBe(422);
    expect((await create(fedA, { kind: "referee" })).status).toBe(422);
    expect((await create(ref, person())).status).toBe(403);
    expect((await create(null, person())).status).toBe(401);
  });

  it("updates an official: federation inside its country, admin anywhere, 404 elsewhere", async () => {
    const id = (await create(fedA, person({ name: "Patch Me" }))).json.official.id as string;
    const res = await api("PATCH", `/api/v1/officials/${id}`, { session: fedA, body: { name: "Patched Name", level: "FIFA Listed", status: "training", bio: { fr: "fr", en: "en" }, varQualified: true, licenceNo: null } });
    expect(res.status).toBe(200);
    expect(res.json.official).toMatchObject({ name: "Patched Name", initials: "PN", level: "FIFA Listed", status: "training", varQualified: true, bio: { fr: "fr", en: "en" } });
    expect((await api("PATCH", `/api/v1/officials/${id}`, { session: fedB, body: { name: "Hijacked" } })).status).toBe(404);
    expect((await api("PATCH", `/api/v1/officials/${id}`, { session: admin, body: { city: "Elsewhere" } })).json.official.city).toBe("Elsewhere");
    expect((await api("PATCH", `/api/v1/officials/${id}`, { session: fedA, body: { status: "suspended" } })).status).toBe(422);
    expect((await api("PATCH", `/api/v1/officials/${id}`, { session: fedA, body: { bio: { fr: "only fr" } } })).status).toBe(422);
    expect((await sql("SELECT name FROM officials WHERE id = ?", id).first<{ name: string }>())!.name).toBe("Patched Name");
  });

  it("keeps a disciplinary suspension out of reach of edits; a referee edits only contact details of their own file", async () => {
    await sql("UPDATE officials SET status = 'suspended' WHERE id = 'rg-existing'").run();
    expect((await api("PATCH", "/api/v1/officials/rg-existing", { session: fedA, body: { status: "active" } })).status).toBe(409);
    expect((await api("PATCH", "/api/v1/officials/rg-existing", { session: ref, body: { level: "CAF Elite" } })).status).toBe(403);
    expect((await api("PATCH", "/api/v1/officials/rg-existing", { session: ref, body: { city: "Doha", phone: "+974" } })).status).toBe(200);
  });
});
