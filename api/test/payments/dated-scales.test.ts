import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addFixture, sql, uid } from "../helpers";
import { del, get, makeWorld, post, put, type World } from "../helpers/evaluation";

// Fee scales keep their history; the scale applied is the one in force on the match date.
let w: World;
beforeAll(async () => {
  w = await makeWorld("PDA", "PDB");
});
beforeEach(async () => {
  await sql("DELETE FROM fee_scales").run();
});

const scale = (extra: object = {}) => ({ tier: "d1", role: "R", amount: 10000, ...extra });
const future = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10);

let round = 100;
async function validatedOn(date: string) {
  const id = uid("fx");
  await addFixture(id, { country: "PDA", competition: "PDA-d1", date, roles: ["R"], round: ++round });
  await sql("UPDATE designations SET official_id = 'PDA-ref1', state = 'confirmed' WHERE fixture_id = ?", id).run();
  await sql("UPDATE fixtures SET designation_status = 'validated' WHERE id = ?", id).run();
  return id;
}
const generated = async (fixtureId: string) => {
  await post(w.seatA, "/payments/generate", { fixtureId });
  return (await sql("SELECT base FROM payments WHERE fixture_id = ?", fixtureId).first<{ base: number }>())?.base ?? null;
};

describe("dated fee scales", () => {
  it("keeps every dated version and prices each match on the one in force that day", async () => {
    await put(w.seatA, "/fee-scales", scale({ amount: 10000, effectiveFrom: "2027-01-01" }));
    expect((await put(w.seatA, "/fee-scales", scale({ amount: 15000, effectiveFrom: "2028-01-01" }))).json.effectiveFrom).toBe("2028-01-01");
    const rows = (await get(w.seatA, "/fee-scales")).json.scales;
    expect(rows.map((r: { effectiveFrom: string; amount: number }) => [r.effectiveFrom, r.amount])).toEqual([["2028-01-01", 15000], ["2027-01-01", 10000]]);
    expect(await generated(await validatedOn("2027-06-01"))).toBe(10000);
    expect(await generated(await validatedOn("2028-03-01"))).toBe(15000);
    // a match older than the first version is priced on that first version
    expect(await generated(await validatedOn("2026-08-01"))).toBe(10000);
  });

  it("without a date edits the scale in force today; marks it inForce", async () => {
    await put(w.seatA, "/fee-scales", scale({ amount: 9000, effectiveFrom: "2026-07-01" }));
    await put(w.seatA, "/fee-scales", scale({ amount: 12000, effectiveFrom: future }));
    const res = await put(w.seatA, "/fee-scales", scale({ amount: 9500 }));
    expect(res.json.effectiveFrom).toBe("2026-07-01");
    const rows = (await get(w.seatA, "/fee-scales")).json.scales as Array<{ effectiveFrom: string; amount: number; inForce: boolean }>;
    expect(rows.find((r) => r.effectiveFrom === "2026-07-01")).toMatchObject({ amount: 9500, inForce: true });
    expect(rows.find((r) => r.effectiveFrom === future)).toMatchObject({ amount: 12000, inForce: false });
  });

  it("deletes a future scale only, a federation its own only", async () => {
    await put(w.seatA, "/fee-scales", scale({ effectiveFrom: "2026-07-01" }));
    await put(w.seatA, "/fee-scales", scale({ amount: 20000, effectiveFrom: future }));
    await put(w.admin, "/fee-scales", scale({ federationId: w.fedB, amount: 30000, effectiveFrom: future }));
    await put(w.admin, "/fee-scales", scale({ amount: 1, currency: "XOF", effectiveFrom: future }));
    const ids = Object.fromEntries(
      (await sql("SELECT id, IFNULL(federation_id, 'default') AS f, effective_from AS d FROM fee_scales").all<{ id: string; f: string; d: string }>()).results.map((r) => [`${r.f}@${r.d}`, r.id]),
    );
    const inForce = await del(w.seatA, `/fee-scales/${ids[`${w.fedA}@2026-07-01`]}`);
    expect(inForce.status).toBe(409);
    expect(inForce.json.error.code).toBe("in_force");
    expect((await del(w.seatA, `/fee-scales/${ids[`${w.fedB}@${future}`]}`)).status).toBe(404);
    expect((await del(w.seatA, `/fee-scales/${ids[`default@${future}`]}`)).status).toBe(403);
    expect((await del(w.refA1, `/fee-scales/${ids[`${w.fedA}@${future}`]}`)).status).toBe(403);
    expect((await del(null, `/fee-scales/${ids[`${w.fedA}@${future}`]}`)).status).toBe(401);
    expect((await del(w.seatA, `/fee-scales/${ids[`${w.fedA}@${future}`]}`)).status).toBe(200);
    expect((await del(w.seatA, "/fee-scales/nope")).status).toBe(404);
    expect((await sql("SELECT COUNT(*) AS n FROM fee_scales").first<{ n: number }>())!.n).toBe(3);
    expect((await sql("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'feescale.delete'").first<{ n: number }>())!.n).toBe(1);
  });

  it("validates the date", async () => {
    expect((await put(w.seatA, "/fee-scales", scale({ effectiveFrom: "next week" }))).status).toBe(422);
  });
});
