import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "../helpers";
import { addPlayedMatch, get, makeWorld, patch, post, put, type World } from "../helpers/evaluation";

let w: World;
let a: { id: string; fixtureId: string };
let b: { id: string; fixtureId: string };

beforeAll(async () => {
  w = await makeWorld("PXA", "PXB");
  await sql("UPDATE countries SET currency = 'GHS' WHERE code = 'PXB'").run();
  for (const s of [w.seatA, w.seatB]) await put(s, "/fee-scales", { tier: "d1", role: "R", amount: 1000 });
  const one = async (country: string, referee: string) => {
    const { fixtureId } = await addPlayedMatch({ country, competition: `${country}-d1`, referee });
    await post(w.admin, "/payments/generate", { fixtureId });
    const p = (await get(w.admin, `/payments?fixtureId=${fixtureId}`)).json.payments[0];
    return { id: p.id as string, fixtureId };
  };
  a = await one("PXA", "PXA-ref1");
  b = await one("PXB", "PXB-ref1");
});

const snapshot = (id: string) => sql("SELECT status, bonus, presence_confirmed, contest_note FROM payments WHERE id = ?", id).first();

describe("payments are confined to the country paying them", () => {
  it("lists a federation's own country only, a referee their own, an admin everything (and ?country=)", async () => {
    const ids = async (s: Parameters<typeof get>[0], q = "") => (await get(s, `/payments${q}`)).json.payments.map((p: { id: string }) => p.id);
    expect(await ids(w.seatA)).toEqual([a.id]);
    expect(await ids(w.seatB)).toEqual([b.id]);
    expect(await ids(w.refA1)).toEqual([a.id]);
    expect(await ids(w.refA2)).toEqual([]);
    expect((await ids(w.admin)).sort()).toEqual([a.id, b.id].sort());
    expect(await ids(w.admin, "?country=pxb")).toEqual([b.id]);
    expect(await ids(w.seatA, "?country=PXB")).toEqual([]); // a foreign filter finds nothing
    expect(await ids(w.seatA, `?fixtureId=${b.fixtureId}`)).toEqual([]);
    expect(await ids(w.seatA, `?officialId=PXB-ref1`)).toEqual([]);
  });

  it("answers 401 unauthenticated", async () => {
    expect((await get(null, "/payments")).status).toBe(401);
    expect((await get(null, `/payments/${a.id}`)).status).toBe(401);
  });

  it("answers 404 for a foreign payment on every read and action, and changes nothing", async () => {
    const before = await snapshot(b.id);
    expect((await get(w.seatA, `/payments/${b.id}`)).status).toBe(404);
    expect((await patch(w.seatA, `/payments/${b.id}`, { bonus: 100, reason: "meddling", presenceConfirmed: true })).status).toBe(404);
    expect((await post(w.seatA, `/payments/${b.id}/validate`)).status).toBe(404);
    expect((await post(w.seatA, `/payments/${b.id}/pay`, { reference: "VIR-XX" })).status).toBe(404);
    expect((await post(w.seatA, `/payments/${b.id}/resolve`, { outcome: "due", note: "not allowed" })).status).toBe(404);
    expect((await post(w.seatA, `/payments/${b.id}/cancel`, { note: "not allowed" })).status).toBe(404);
    expect((await post(w.seatA, `/payments/${b.id}/contest`, { note: "not even mine" })).status).toBe(404);
    expect(await snapshot(b.id)).toEqual(before);
  });

  it("hides a payment from a referee who does not own it", async () => {
    expect((await get(w.refA2, `/payments/${a.id}`)).status).toBe(404);
    expect((await post(w.refA2, `/payments/${a.id}/contest`, { note: "That is not mine at all" })).status).toBe(404);
    expect((await get(w.refB1, `/payments/${a.id}`)).status).toBe(404);
  });

  it("uses the country's currency for each country", async () => {
    expect((await get(w.seatB, `/payments/${b.id}`)).json.payment.currency).toBe("GHS");
    expect((await get(w.seatA, `/payments/${a.id}`)).json.payment.currency).toBe("XOF");
  });

  it("reports the money by country: a federation's budget only counts its own", async () => {
    const budget = (await get(w.seatA, "/reports/overview")).json.budget;
    expect(budget).toEqual([expect.objectContaining({ currency: "XOF", planned: 1000 })]);
  });
});
