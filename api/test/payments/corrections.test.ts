import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "../helpers";
import { addPlayedMatch, get, makeWorld, patch, post, put, type World } from "../helpers/evaluation";

// A paid line is history: the money is put right with linked correction lines, never by editing it.
let w: World;
beforeAll(async () => {
  w = await makeWorld("PKA", "PKB");
  await put(w.seatA, "/fee-scales", { tier: "d1", role: "R", amount: 20000, transport: 2000, meals: 1000 });
});

const checks = { presenceConfirmed: true, matchValidated: true, expensesVerified: true };

async function paid() {
  const { fixtureId } = await addPlayedMatch({ country: "PKA", competition: "PKA-d1", referee: "PKA-ref1" });
  await post(w.seatA, "/payments/generate", { fixtureId });
  const p = (await get(w.seatA, `/payments?fixtureId=${fixtureId}`)).json.payments[0] as { id: string; total: number };
  await patch(w.seatA, `/payments/${p.id}`, checks);
  await post(w.seatA, `/payments/${p.id}/validate`);
  await post(w.seatA, `/payments/${p.id}/pay`, { reference: "VIR-K1" });
  return p;
}

describe("POST /payments/:id/correction", () => {
  it("adds linked lines on a paid payment: the line keeps what was paid, net carries the corrections", async () => {
    const p = await paid();
    expect(p.total).toBe(23000);
    const up = await post(w.seatA, `/payments/${p.id}/correction`, { delta: 1500, reason: "Toll receipts forgotten" });
    expect(up.status).toBe(201);
    expect(up.json.payment).toMatchObject({ status: "paid", total: 23000, correctionTotal: 1500, net: 24500 });
    const down = await post(w.seatA, `/payments/${p.id}/correction`, { delta: -4000, reason: "Meals paid twice" });
    expect(down.json.payment).toMatchObject({ total: 23000, correctionTotal: -2500, net: 20500 });

    const detail = (await get(w.seatA, `/payments/${p.id}`)).json.payment;
    expect(detail.corrections.map((x: { delta: number }) => x.delta)).toEqual([1500, -4000]);
    expect(detail.corrections[1]).toMatchObject({ reason: "Meals paid twice" });
    // the paid line itself was never touched
    expect(await sql("SELECT base, transport, meals, status, payment_ref AS ref FROM payments WHERE id = ?", p.id).first()).toEqual({ base: 20000, transport: 2000, meals: 1000, status: "paid", ref: "VIR-K1" });

    const audit = await sql("SELECT before, after, reason, country_code AS cc FROM audit_log WHERE action = 'payment.correct' AND entity_id = ? ORDER BY id", p.id).all<{ before: string; after: string; reason: string; cc: string }>();
    expect(audit.results.map((a) => [JSON.parse(a.before).net, JSON.parse(a.after).net])).toEqual([[23000, 24500], [24500, 20500]]);
    expect(audit.results[0].cc).toBe("PKA");
    const n = (await get(w.refA1, "/notifications")).json.notifications.find((x: { title: { en: string } }) => x.title.en === "Payment corrected");
    expect(n.title.fr).toBe("Correction d'une indemnité");
  });

  it("never takes back more than was paid", async () => {
    const p = await paid();
    const res = await post(w.seatA, `/payments/${p.id}/correction`, { delta: -23001, reason: "Everything and more" });
    expect(res.status).toBe(422);
    expect(res.json.error).toMatchObject({ code: "negative_total", details: { net: 23000, delta: -23001 } });
    expect((await post(w.seatA, `/payments/${p.id}/correction`, { delta: -23000, reason: "Match never worked" })).json.payment.net).toBe(0);
    expect((await post(w.seatA, `/payments/${p.id}/correction`, { delta: -1, reason: "One more" })).status).toBe(422);
  });

  it("is for paid lines only — an unpaid line is edited — and validates the body", async () => {
    const { fixtureId } = await addPlayedMatch({ country: "PKA", competition: "PKA-d1", referee: "PKA-ref2" });
    await post(w.seatA, "/payments/generate", { fixtureId });
    const due = (await get(w.seatA, `/payments?fixtureId=${fixtureId}`)).json.payments[0];
    expect((await post(w.seatA, `/payments/${due.id}/correction`, { delta: 100, reason: "Too early" })).json.error.code).toBe("not_paid");
    const p = await paid();
    expect((await post(w.seatA, `/payments/${p.id}/correction`, { delta: 0, reason: "Nothing" })).status).toBe(422);
    expect((await post(w.seatA, `/payments/${p.id}/correction`, { delta: 1.5, reason: "Half a franc" })).status).toBe(422);
    expect((await post(w.seatA, `/payments/${p.id}/correction`, { delta: 100 })).status).toBe(422);
    // and the database keeps the lines append-only
    await post(w.seatA, `/payments/${p.id}/correction`, { delta: 100, reason: "Parking" });
    await expect(sql("UPDATE payment_corrections SET delta = 1").run()).rejects.toThrow(/append-only/);
    await expect(sql("DELETE FROM payment_corrections").run()).rejects.toThrow(/append-only/);
  });

  it("is 404 to another country, 403 to a referee, 401 signed out, with nothing written", async () => {
    const p = await paid();
    expect((await post(w.seatB, `/payments/${p.id}/correction`, { delta: 100, reason: "Foreign" })).status).toBe(404);
    expect((await post(w.refA1, `/payments/${p.id}/correction`, { delta: 100, reason: "Give me more" })).status).toBe(403);
    expect((await post(null, `/payments/${p.id}/correction`, { delta: 100, reason: "Anonymous" })).status).toBe(401);
    expect((await sql("SELECT COUNT(*) AS n FROM payment_corrections WHERE payment_id = ?", p.id).first<{ n: number }>())!.n).toBe(0);
    expect((await post(w.admin, `/payments/${p.id}/correction`, { delta: 100, reason: "Admin fix" })).status).toBe(201);
  });
});
