import { describe, expect, it } from "vitest";
import { addCountry, addFederation, addFederationSeat, addOfficial, addUser, api, login, sql } from "../helpers";

describe("federations", async () => {
  await addUser("fed-admin@aris.test", "admin");
  await addOfficial("fd-off", "FDA");
  await addUser("fd-ref@aris.test", "referee", { officialId: "fd-off" });
  const seatA = await addFederationSeat("FDA");
  await addFederationSeat("FDB");
  await addCountry("FDC");
  await addCountry("FDD", { active: false });
  const admin = await login("fed-admin@aris.test");
  const fedA = await login(seatA.email);
  const ref = await login("fd-ref@aris.test");
  const post = (s: typeof admin | null, body: object) => api("POST", "/api/v1/federations", { session: s, body });

  it("lists everything for an admin, only its own for a seat, nothing for a referee", async () => {
    const all = (await api("GET", "/api/v1/federations", { session: admin })).json.federations as Array<{ code: string }>;
    expect(all.map((f) => f.code)).toEqual(expect.arrayContaining(["FDAFF", "FDBFF"]));
    const own = await api("GET", "/api/v1/federations", { session: fedA });
    expect(own.json.federations).toHaveLength(1);
    expect(own.json.federations[0]).toMatchObject({ code: "FDAFF", country: "FDA", status: "active", seats: 1, logoUrl: null });
    expect(Object.keys(own.json.federations[0]).sort()).toEqual(["agreementReference", "code", "country", "countryName", "createdAt", "id", "logoUrl", "name", "seats", "status"]);
    expect((await api("GET", "/api/v1/federations", { session: ref })).status).toBe(403);
    expect((await api("GET", "/api/v1/federations")).status).toBe(401);
  });

  it("creates a federation for a supported country that has none (admin only)", async () => {
    const res = await post(admin, { code: "fdc", name: "Fédération C", country: "FDC", agreementReference: "AGR-1" });
    expect(res.status).toBe(201);
    expect(res.json.federation).toMatchObject({ code: "FDC", name: "Fédération C", country: "FDC", status: "active", seats: 0, agreementReference: "AGR-1" });
    expect((await sql("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'federation.create' AND country_code = 'FDC'").first<{ n: number }>())!.n).toBe(1);
    for (const s of [fedA, ref, null]) expect((await post(s, { code: "ZZZ", name: "Zed", country: "FDC" })).status).toBe(s ? 403 : 401);
  });

  it("refuses duplicates, unknown and inactive countries, and bad bodies", async () => {
    const dup = await post(admin, { code: "OTHER", name: "Other", country: "FDC" });
    expect(dup.status).toBe(409);
    expect(dup.json.error.code).toBe("federation_exists");
    const codeTaken = await post(admin, { code: "FDC", name: "Other", country: "FDD" });
    expect(codeTaken.status).toBe(422); // FDD is inactive: checked before the code
    expect(codeTaken.json.error.code).toBe("country_inactive");
    await addCountry("FDE");
    expect((await post(admin, { code: "FDC", name: "Other", country: "FDE" })).json.error.code).toBe("federation_code_taken");
    expect((await post(admin, { code: "QQQ", name: "Nowhere", country: "ZZZ" })).json.error.code).toBe("unknown_country");
    expect((await post(admin, { code: "x", name: "N", country: "FDE" })).status).toBe(422);
    expect((await post(admin, { name: "N" })).status).toBe(422);
  });

  it("patches name, code, agreement and status (admin only)", async () => {
    const id = await addFederation("FDF");
    const res = await api("PATCH", `/api/v1/federations/${id}`, { session: admin, body: { name: "Renamed", code: "newcode", agreementReference: null } });
    expect(res.status).toBe(200);
    expect(res.json.federation).toMatchObject({ name: "Renamed", code: "NEWCODE", agreementReference: null });
    const clash = await api("PATCH", `/api/v1/federations/${id}`, { session: admin, body: { code: "FDAFF" } });
    expect(clash.status).toBe(409);
    expect((await api("PATCH", `/api/v1/federations/${id}`, { session: admin, body: {} })).status).toBe(422);
    expect((await api("PATCH", `/api/v1/federations/nope`, { session: admin, body: { name: "Nope" } })).status).toBe(404);
    expect((await api("PATCH", `/api/v1/federations/${id}`, { session: fedA, body: { name: "Hacked" } })).status).toBe(403);
    expect((await api("PATCH", `/api/v1/federations/${seatA.federationId}`, { session: fedA, body: { status: "suspended" } })).status).toBe(403);
    expect((await api("PATCH", `/api/v1/federations/${id}`, { session: ref, body: { name: "x" } })).status).toBe(403);
  });
});
