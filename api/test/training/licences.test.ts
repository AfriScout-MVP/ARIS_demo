import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "../helpers";
import { get, makeWorld, official, patch, post, type World } from "../helpers/evaluation";

let w: World;
beforeAll(async () => {
  w = await makeWorld("TLA", "TLB");
});

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const add = (s: Parameters<typeof post>[0], extra: object = {}) => post(s, "/licences", { officialId: "TLA-ref1", kind: "FIFA Badge", issued: "2020-01-01", expires: day(400), ...extra });

describe("licences", () => {
  it("are recorded, listed with their state, and filtered by expiry", async () => {
    expect((await add(w.seatA)).status).toBe(201);
    await add(w.seatA, { officialId: "TLA-ref2", kind: "National D1", expires: day(20) });
    await add(w.seatA, { officialId: "TLA-obs", kind: "Fitness Clearance", issued: "2019-01-01", expires: day(-5) });
    const all = (await get(w.seatA, "/licences")).json.licences;
    expect(Object.fromEntries(all.map((l: { officialId: string; state: string }) => [l.officialId, l.state]))).toEqual({ "TLA-ref1": "valid", "TLA-ref2": "expiring", "TLA-obs": "expired" });
    expect((await get(w.seatA, "/licences?expiringWithin=30")).json.licences.map((l: { officialId: string }) => l.officialId).sort()).toEqual(["TLA-obs", "TLA-ref2"]);
    expect((await get(w.seatA, "/licences?officialId=TLA-ref1")).json.licences).toHaveLength(1);
  });

  it("makes a referee VAR-qualified when a valid VAR certification is added", async () => {
    expect((await official("TLA-ref1")).var_qualified).toBe(0);
    await add(w.seatA, { kind: "VAR Certification" });
    expect((await official("TLA-ref1")).var_qualified).toBe(1);
    await add(w.seatA, { officialId: "TLA-ref2", kind: "VAR Certification", issued: "2015-01-01", expires: "2016-01-01" });
    expect((await official("TLA-ref2")).var_qualified).toBe(0);
  });

  it("is renewed with a date check, and audited with the country", async () => {
    const id = (await add(w.seatA, { officialId: "TLA-as1" })).json.id;
    expect((await patch(w.seatA, `/licences/${id}`, { expires: "2019-01-01" })).status).toBe(422);
    expect((await patch(w.seatA, `/licences/${id}`, { expires: day(900) })).status).toBe(200);
    expect((await sql("SELECT country_code FROM audit_log WHERE action = 'licence.renew' AND entity_id = 'TLA-as1'").first<{ country_code: string }>())!.country_code).toBe("TLA");
    expect((await patch(w.seatA, "/licences/nope", { expires: day(900) })).status).toBe(404);
  });

  it("validates the body", async () => {
    expect((await add(w.seatA, { kind: "Driving Licence" })).status).toBe(422);
    expect((await add(w.seatA, { issued: "01/01/2020" })).status).toBe(422);
    expect((await add(w.seatA, { issued: "2025-01-01", expires: "2024-01-01" })).status).toBe(422);
  });

  it("answers 401 and 403", async () => {
    expect((await add(null)).status).toBe(401);
    expect((await get(null, "/licences")).status).toBe(401);
    expect((await add(w.refA1)).status).toBe(403);
    expect((await get(w.refA1, "/licences")).status).toBe(403);
    expect((await patch(w.refA1, "/licences/x", { expires: day(1) })).status).toBe(403);
  });

  it("admin sees every country and can narrow with ?country=", async () => {
    await add(w.seatB, { officialId: "TLB-ref1" });
    const everyone = (await get(w.admin, "/licences")).json.licences.map((l: { countryCode: string }) => l.countryCode);
    expect(new Set(everyone)).toEqual(new Set(["TLA", "TLB"]));
    expect((await get(w.admin, "/licences?country=tlb")).json.licences.every((l: { countryCode: string }) => l.countryCode === "TLB")).toBe(true);
  });
});
