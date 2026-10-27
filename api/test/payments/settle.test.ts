import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "../helpers";
import { addPlayedMatch, get, makeWorld, patch, post, put, type World } from "../helpers/evaluation";

// An advance paid out is settled by deducting it on one of the official's payment lines.
let w: World;
beforeAll(async () => {
  w = await makeWorld("PTA", "PTB");
  await put(w.seatA, "/fee-scales", { tier: "d1", role: "R", amount: 20000 });
});

async function line(referee = "PTA-ref1") {
  const { fixtureId } = await addPlayedMatch({ country: "PTA", competition: "PTA-d1", referee });
  await post(w.seatA, "/payments/generate", { fixtureId });
  return (await get(w.seatA, `/payments?fixtureId=${fixtureId}`)).json.payments[0] as { id: string };
}
async function advance(amount = 5000, status = "paid", officialId = "PTA-ref1") {
  const id = (await post(w.seatA, "/advances", { officialId, amount, justification: "Flight to the away match" })).json.advance.id as string;
  await post(w.seatA, `/advances/${id}/decide`, { status: "approved" });
  if (status === "paid") await post(w.seatA, `/advances/${id}/decide`, { status: "paid" });
  return id;
}

describe("POST /advances/:id/settle", () => {
  it("deducts the advance on the slip, links it, and sends a validated line back for review", async () => {
    const p = await line();
    await patch(w.seatA, `/payments/${p.id}`, { presenceConfirmed: true, matchValidated: true, expensesVerified: true });
    await post(w.seatA, `/payments/${p.id}/validate`);
    const a = await advance(5000);
    const res = await post(w.seatA, `/advances/${a}/settle`, { paymentId: p.id });
    expect(res.status).toBe(200);
    expect(res.json.payment).toMatchObject({ total: 20000, advanceDeduction: 5000, net: 15000, status: "due" });
    expect(await sql("SELECT status, payment_id AS paymentId FROM advances WHERE id = ?", a).first()).toEqual({ status: "settled", paymentId: p.id });
    expect((await get(w.seatA, `/payments/${p.id}`)).json.payment.advances).toMatchObject([{ id: a, amount: 5000 }]);
    expect((await get(w.refA1, "/advances")).json.advances.find((x: { id: string }) => x.id === a).paymentId).toBe(p.id);
    // paying it now pays the net, and says so
    await post(w.seatA, `/payments/${p.id}/validate`);
    await post(w.seatA, `/payments/${p.id}/pay`, { reference: "VIR-T1" });
    const n = (await get(w.refA1, "/notifications")).json.notifications.find((x: { detail: { en: string } }) => x.detail.en.includes("VIR-T1"));
    expect(n.detail.en).toContain("15000");
  });

  it("refuses an advance not paid out, a line of someone else, a closed line, or more than the line pays", async () => {
    const p = await line();
    expect((await post(w.seatA, `/advances/${await advance(1000, "approved")}/settle`, { paymentId: p.id })).json.error.code).toBe("bad_state");
    const other = await line("PTA-ref2");
    expect((await post(w.seatA, `/advances/${await advance(1000)}/settle`, { paymentId: other.id })).json.error.code).toBe("other_official");
    expect((await post(w.seatA, `/advances/${await advance(25000)}/settle`, { paymentId: p.id })).json.error.code).toBe("exceeds_payment");
    const a = await advance(1000);
    await post(w.seatA, `/payments/${p.id}/cancel`, { note: "Wrong line" });
    expect((await post(w.seatA, `/advances/${a}/settle`, { paymentId: p.id })).json.error.code).toBe("payment_closed");
    expect((await post(w.seatA, `/advances/${a}/settle`, {})).status).toBe(422);
  });

  it("puts the advance back to 'paid' when its line is cancelled", async () => {
    const p = await line();
    const a = await advance(2000);
    await post(w.seatA, `/advances/${a}/settle`, { paymentId: p.id });
    await post(w.seatA, `/payments/${p.id}/cancel`, { note: "Line issued by mistake" });
    expect(await sql("SELECT status, payment_id AS paymentId FROM advances WHERE id = ?", a).first()).toEqual({ status: "paid", paymentId: null });
  });

  it("is 404 across borders, 403 to a referee, with nothing changed", async () => {
    const p = await line();
    const a = await advance(1000);
    expect((await post(w.seatB, `/advances/${a}/settle`, { paymentId: p.id })).status).toBe(404);
    expect((await post(w.refA1, `/advances/${a}/settle`, { paymentId: p.id })).status).toBe(403);
    expect((await post(null, `/advances/${a}/settle`, { paymentId: p.id })).status).toBe(401);
    expect(await sql("SELECT status FROM advances WHERE id = ?", a).first()).toEqual({ status: "paid" });
  });
});
