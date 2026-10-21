import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "../helpers";
import { addPlayedMatch, get, makeWorld, patch, post, put, type World } from "../helpers/evaluation";

let w: World;
beforeAll(async () => {
  w = await makeWorld("PWA", "PWB");
  for (const role of ["R", "AR1"]) await put(w.seatA, "/fee-scales", { tier: "d1", role, amount: 20000, transport: 2000, meals: 1000 });
});

/** A due payment line for the referee PWA-ref1. */
async function due() {
  const { fixtureId } = await addPlayedMatch({ country: "PWA", competition: "PWA-d1", referee: "PWA-ref1", crew: { AR1: "PWA-as1" } });
  await post(w.seatA, "/payments/generate", { fixtureId });
  const p = (await get(w.seatA, `/payments?fixtureId=${fixtureId}`)).json.payments.find((x: { role: string }) => x.role === "R");
  return p as { id: string; total: number };
}
const checks = { presenceConfirmed: true, matchValidated: true, expensesVerified: true };

describe("the payment workflow", () => {
  it("never lets a designation alone become a payment: three checks, then validation, then payment", async () => {
    const p = await due();
    const early = await post(w.seatA, `/payments/${p.id}/validate`);
    expect(early.status).toBe(409);
    expect(early.json.error.details.missing).toEqual(["presenceConfirmed", "matchValidated", "expensesVerified"]);
    expect((await post(w.seatA, `/payments/${p.id}/pay`, { reference: "VIR-001" })).json.error.code).toBe("not_validated");

    expect((await patch(w.seatA, `/payments/${p.id}`, checks)).status).toBe(200);
    expect((await post(w.seatA, `/payments/${p.id}/validate`)).json.payment.status).toBe("validated");
    const paid = await post(w.seatA, `/payments/${p.id}/pay`, { reference: "VIR-001" });
    expect(paid.json.payment).toMatchObject({ status: "paid", paymentRef: "VIR-001" });
    // a paid line is closed, and paying twice changes nothing
    expect((await patch(w.seatA, `/payments/${p.id}`, { bonus: 500, reason: "late" })).status).toBe(409);
    expect((await post(w.seatA, `/payments/${p.id}/cancel`, { note: "too late" })).status).toBe(409);
    expect((await post(w.seatA, `/payments/${p.id}/pay`, { reference: "VIR-002" })).json.payment.paymentRef).toBe("VIR-001");
  });

  it("tells the referee, in both languages, when they are paid", async () => {
    const p = await due();
    await patch(w.seatA, `/payments/${p.id}`, checks);
    await post(w.seatA, `/payments/${p.id}/validate`);
    await post(w.seatA, `/payments/${p.id}/pay`, { reference: "VIR-777" });
    const n = (await get(w.refA1, "/notifications")).json.notifications.find((x: { detail: { en: string } }) => x.detail.en.includes("VIR-777"));
    expect(n.title).toMatchObject({ fr: "Paiement effectué", en: "Payment sent" });
  });

  it("is enforced by the database too: a 'paid' row without the three checks cannot exist", async () => {
    const p = await due();
    await expect(sql("UPDATE payments SET status = 'paid', paid_at = '2030-01-01' WHERE id = ?", p.id).run()).rejects.toThrow(/CHECK/);
  });

  it("needs a reason to change an amount, and sends a validated line back for another look", async () => {
    const p = await due();
    await patch(w.seatA, `/payments/${p.id}`, checks);
    await post(w.seatA, `/payments/${p.id}/validate`);
    expect((await patch(w.seatA, `/payments/${p.id}`, { bonus: 5000 })).json.error.code).toBe("reason_required");
    const edited = await patch(w.seatA, `/payments/${p.id}`, { bonus: 5000, reason: "Derby bonus" });
    expect(edited.json.payment).toMatchObject({ bonus: 5000, total: 28000, status: "due" });
    expect((await patch(w.seatA, `/payments/${p.id}`, { bonus: -1, reason: "negative" })).status).toBe(422);
  });

  it("lets the referee contest their own line; staff resolve or cancel it", async () => {
    const p = await due();
    expect((await post(w.refA1, `/payments/${p.id}/contest`, { note: "no" })).status).toBe(422);
    const contest = await post(w.refA1, `/payments/${p.id}/contest`, { note: "Transport was 4000, not 2000" });
    expect(contest.json.payment).toMatchObject({ status: "contested", contestNote: "Transport was 4000, not 2000" });
    expect((await post(w.seatA, `/payments/${p.id}/validate`)).status).toBe(409);
    const resolved = await post(w.seatA, `/payments/${p.id}/resolve`, { outcome: "due", note: "Corrected after receipt" });
    expect(resolved.json.payment.status).toBe("due");
    expect((await post(w.seatA, `/payments/${p.id}/resolve`, { outcome: "due", note: "again" })).status).toBe(409);
    expect((await post(w.seatA, `/payments/${p.id}/cancel`, { note: "Match replayed" })).json.payment.status).toBe("cancelled");
  });

  it("raises the contest to the federation of that country only", async () => {
    const p = await due();
    await post(w.refA1, `/payments/${p.id}/contest`, { note: "Missing night of lodging" });
    const seen = async (s: typeof w.seatA) => (await get(s, "/notifications")).json.notifications.map((n: { title: { en: string } }) => n.title.en);
    expect(await seen(w.seatA)).toContain("Payment contested");
    expect(await seen(w.seatB)).not.toContain("Payment contested");
  });

  it("lists the receipts attached to a payment, by media id", async () => {
    const p = await due();
    await sql("INSERT INTO media_assets (id, kind, visibility, r2_key, filename, content_type, size, sha256, owner_type, owner_id) VALUES ('med-rc-1','receipt','private','payments/rc1.pdf','taxi.pdf','application/pdf',10,?,'payment',?)", "a".repeat(64), p.id).run();
    await sql("INSERT INTO documents (id, official_id, kind, media_id, payment_id) VALUES ('doc-rc-1','PWA-ref1','receipt','med-rc-1',?)", p.id).run();
    const res = await get(w.refA1, `/payments/${p.id}`);
    expect(res.json.payment.receipts).toEqual([expect.objectContaining({ id: "doc-rc-1", mediaId: "med-rc-1", url: "/api/v1/media/med-rc-1", filename: "taxi.pdf" })]);
  });

  it("validates input, and answers 401 / 403", async () => {
    const p = await due();
    expect((await post(w.seatA, `/payments/${p.id}/pay`, {})).status).toBe(422);
    expect((await post(w.seatA, `/payments/${p.id}/cancel`, { note: "x" })).status).toBe(422);
    expect((await post(null, `/payments/${p.id}/validate`)).status).toBe(401);
    for (const path of ["validate", "resolve", "cancel", "pay"]) expect((await post(w.refA1, `/payments/${p.id}/${path}`, { reference: "VIR-9", note: "nope", outcome: "due" })).status).toBe(403);
    expect((await patch(w.refA1, `/payments/${p.id}`, checks)).status).toBe(403);
    expect((await patch(w.seatA, "/payments/nope", checks)).status).toBe(404);
  });
});
