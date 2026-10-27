import { beforeAll, describe, expect, it } from "vitest";
import { addFixture, sql, uid } from "../helpers";
import { get, makeWorld, patch, post, put, type World } from "../helpers/evaluation";

let w: World;
let n = 0;

beforeAll(async () => {
  w = await makeWorld("PRA", "PRB");
  for (const role of ["R", "AR1"]) await put(w.seatA, "/fee-scales", { tier: "d1", role, amount: 20000, transport: 2000 });
});

/** A match still to be played, crew confirmed and validated, with its lines generated. */
async function billed() {
  const fixtureId = uid("pr");
  const date = new Date(Date.UTC(2036, 0, 1 + (n += 9))).toISOString().slice(0, 10);
  await addFixture(fixtureId, { country: "PRA", competition: "PRA-d1", date, round: n, roles: ["R", "AR1"] });
  await sql("UPDATE designations SET official_id = 'PRA-ref1', state = 'confirmed' WHERE fixture_id = ? AND role = 'R'", fixtureId).run();
  await sql("UPDATE designations SET official_id = 'PRA-as1', state = 'confirmed' WHERE fixture_id = ? AND role = 'AR1'", fixtureId).run();
  await sql("UPDATE fixtures SET designation_status = 'validated' WHERE id = ?", fixtureId).run();
  expect((await post(w.seatA, "/payments/generate", { fixtureId })).json.created).toBe(2);
  return fixtureId;
}
const lines = async (fixtureId: string) => (await get(w.seatA, `/payments?fixtureId=${fixtureId}`)).json.payments as Array<Record<string, any>>;
const referee = async (fixtureId: string) => (await lines(fixtureId)).find((p) => p.role === "R")!;
const replace = (fixtureId: string, officialId: string) =>
  put(w.seatA, `/fixtures/${fixtureId}/designations/R`, { officialId, state: "confirmed", override: true, reason: "Injured in training" });

describe("money follows the official who holds the slot", () => {
  it("cancels the leaving official's unpaid line, and the next generation issues it to the new one", async () => {
    const fixtureId = await billed();
    const before = await referee(fixtureId);
    await patch(w.seatA, `/payments/${before.id}`, { presenceConfirmed: true, bonus: 3000, reason: "Derby" });

    expect((await replace(fixtureId, "PRA-ref2")).status).toBe(200);
    const cancelled = await referee(fixtureId);
    expect(cancelled).toMatchObject({ id: before.id, status: "cancelled", officialId: "PRA-ref1" });
    // the assistant's line is untouched
    expect((await lines(fixtureId)).find((p) => p.role === "AR1")!.status).toBe("due");
    const trail = await sql("SELECT reason, after FROM audit_log WHERE action = 'payment.cancel' AND entity_id = ?", before.id).first<{ reason: string; after: string }>();
    expect(trail?.reason).toMatch(/left the slot/);

    const again = await post(w.seatA, "/payments/generate", { fixtureId });
    expect(again.json).toMatchObject({ created: 1, reissued: ["R"], heldByPrevious: [] });
    const reissued = await referee(fixtureId);
    // a fresh line: new id, the new official, the scale's amounts, no checks or adjustments carried over
    expect(reissued).toMatchObject({ officialId: "PRA-ref2", status: "due", base: 20000, bonus: 0, total: 22000, presenceConfirmed: false });
    expect(reissued.id).not.toBe(before.id);
    // the new official sees it; the old one no longer does
    expect((await get(w.refA2, "/payments")).json.payments.map((p: { fixtureId: string }) => p.fixtureId)).toContain(fixtureId);
    expect((await get(w.refA1, "/payments")).json.payments.map((p: { fixtureId: string }) => p.fixtureId)).not.toContain(fixtureId);
  });

  it("leaves a paid line alone and says who still holds it", async () => {
    const fixtureId = await billed();
    const line = await referee(fixtureId);
    await patch(w.seatA, `/payments/${line.id}`, { presenceConfirmed: true, matchValidated: true, expensesVerified: true });
    await post(w.seatA, `/payments/${line.id}/validate`);
    await post(w.seatA, `/payments/${line.id}/pay`, { reference: "VIR-PR1" });

    await replace(fixtureId, "PRA-ref2");
    expect(await referee(fixtureId)).toMatchObject({ status: "paid", officialId: "PRA-ref1" });
    const gen = await post(w.seatA, "/payments/generate", { fixtureId });
    expect(gen.json).toMatchObject({ created: 0, reissued: [], heldByPrevious: ["R"] });
  });

  it("changes nothing when the same official only changes state", async () => {
    const fixtureId = await billed();
    const line = await referee(fixtureId);
    await put(w.seatA, `/fixtures/${fixtureId}/designations/R`, { officialId: "PRA-ref1", state: "pending", reason: "Reconfirm" });
    expect(await referee(fixtureId)).toMatchObject({ id: line.id, status: "due" });
  });
});

describe("adjusting a line", () => {
  it("never takes a total below zero", async () => {
    const fixtureId = await billed();
    const line = await referee(fixtureId);
    const res = await patch(w.seatA, `/payments/${line.id}`, { deduction: 22001, reason: "Absent" });
    expect(res.status).toBe(422);
    expect(res.json.error).toMatchObject({ code: "negative_total", details: { total: -1 } });
    const zero = await patch(w.seatA, `/payments/${line.id}`, { deduction: 22000, reason: "Absent" });
    expect(zero.json.payment.total).toBe(0);
  });
});
