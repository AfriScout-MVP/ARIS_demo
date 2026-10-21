import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "../helpers";
import { get, makeWorld, put, type World } from "../helpers/evaluation";

let w: World;
beforeAll(async () => {
  w = await makeWorld("PSA", "PSB");
  await sql("UPDATE countries SET currency = 'MAD' WHERE code = 'PSA'").run();
  await sql("UPDATE countries SET currency = 'GHS' WHERE code = 'PSB'").run();
});
beforeEach(async () => {
  await sql("DELETE FROM fee_scales").run();
});

const scale = (extra: object = {}) => ({ tier: "d1", role: "R", amount: 20000, transport: 2000, meals: 1000, ...extra });
const rows = async (s: Parameters<typeof get>[0], q = "") => (await get(s, `/fee-scales${q}`)).json.scales as Array<Record<string, any>>;

describe("fee scales are per federation", () => {
  it("lets a federation set its own scale in its country's currency", async () => {
    const res = await put(w.seatA, "/fee-scales", scale());
    expect(res.status).toBe(200);
    expect(res.json.federationId).toBe(w.fedA);
    const [row] = await rows(w.seatA);
    expect(row).toMatchObject({ federationId: w.fedA, tier: "d1", role: "R", amount: 20000, currency: "MAD", readonly: false });
    const log = await sql("SELECT country_code FROM audit_log WHERE action = 'feescale.set'").first<{ country_code: string }>();
    expect(log!.country_code).toBe("PSA");
  });

  it("updates in place instead of duplicating", async () => {
    await put(w.seatA, "/fee-scales", scale());
    await put(w.seatA, "/fee-scales", scale({ amount: 25000 }));
    const mine = (await rows(w.seatA)).filter((r) => r.federationId === w.fedA);
    expect(mine).toHaveLength(1);
    expect(mine[0].amount).toBe(25000);
  });

  it("shows a federation its own scales plus the platform defaults (flagged read only), never another federation's", async () => {
    await put(w.admin, "/fee-scales", scale({ amount: 10000, currency: "XOF" })); // default
    await put(w.seatA, "/fee-scales", scale({ role: "AR1", amount: 12000 }));
    await put(w.seatB, "/fee-scales", scale({ role: "AR2", amount: 9000 }));
    const seenByA = await rows(w.seatA);
    expect(seenByA.map((r) => [r.federationId, r.role, r.readonly]).sort()).toEqual([[null, "R", true], [w.fedA, "AR1", false]].sort());
    const seenByB = await rows(w.seatB);
    expect(seenByB.map((r) => r.role).sort()).toEqual(["AR2", "R"]);
    expect(seenByB.find((r) => r.federationId === null)!.readonly).toBe(true);
  });

  it("lets an admin edit the defaults and any federation's scales, and filter them", async () => {
    expect((await put(w.admin, "/fee-scales", scale({ currency: "usd" }))).status).toBe(200);
    expect((await put(w.admin, "/fee-scales", scale({ federationId: w.fedB, role: "AR1", amount: 7000 }))).status).toBe(200);
    expect(await rows(w.admin)).toHaveLength(2);
    expect((await rows(w.admin, "?federationId=default"))[0]).toMatchObject({ federationId: null, currency: "USD", readonly: false });
    expect((await rows(w.admin, `?federationId=${w.fedB}`))[0]).toMatchObject({ federationId: w.fedB, currency: "GHS" });
  });

  it("refuses a federation the defaults and other federations, with nothing written", async () => {
    expect((await put(w.seatA, "/fee-scales", scale({ federationId: null }))).status).toBe(403);
    expect((await put(w.seatA, "/fee-scales", scale({ federationId: w.fedB }))).status).toBe(404);
    expect((await sql("SELECT COUNT(*) AS n FROM fee_scales").first<{ n: number }>())!.n).toBe(0);
  });

  it("keeps competition scales inside the federation's country", async () => {
    expect((await put(w.seatA, "/fee-scales", scale({ tier: "cup", competitionId: "PSA-cup", amount: 30000 }))).status).toBe(200);
    expect((await put(w.seatA, "/fee-scales", scale({ competitionId: "PSB-d1" }))).status).toBe(404); // foreign competition
    expect((await put(w.seatA, "/fee-scales", scale({ competitionId: "nope" }))).status).toBe(404);
    expect((await put(w.admin, "/fee-scales", scale({ federationId: w.fedA, competitionId: "PSB-d1" }))).status).toBe(422);
    expect((await rows(w.seatA)).map((r) => r.competitionId)).toEqual(["PSA-cup"]);
  });

  it("validates the body and the currency", async () => {
    expect((await put(w.seatA, "/fee-scales", scale({ amount: -1 }))).status).toBe(422);
    expect((await put(w.seatA, "/fee-scales", scale({ role: "COACH" }))).status).toBe(422);
    expect((await put(w.seatA, "/fee-scales", scale({ tier: "d9" }))).status).toBe(422);
    const wrong = await put(w.seatA, "/fee-scales", scale({ currency: "EUR" }));
    expect(wrong.status).toBe(422);
    expect(wrong.json.error.code).toBe("currency_mismatch");
    expect((await put(w.seatA, "/fee-scales", scale({ currency: "mad" }))).status).toBe(200);
  });

  it("answers 401 unauthenticated and 403 to a referee", async () => {
    expect((await get(null, "/fee-scales")).status).toBe(401);
    expect((await put(null, "/fee-scales", scale())).status).toBe(401);
    expect((await get(w.refA1, "/fee-scales")).status).toBe(403);
    expect((await put(w.refA1, "/fee-scales", scale({ amount: 999999 }))).status).toBe(403);
    expect((await sql("SELECT COUNT(*) AS n FROM fee_scales").first<{ n: number }>())!.n).toBe(0);
  });
});
