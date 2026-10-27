import { beforeAll, describe, expect, it } from "vitest";
import { addCompetition, sql } from "../helpers";
import { addPlayedMatch, get, makeWorld, patch, post, put, type World } from "../helpers/evaluation";

// A neutral official from country A works a match run by country B: the line belongs to B, which pays it.
let w: World;
let cross: { id: string; fixtureId: string };
let tie: { id: string; fixtureId: string };

beforeAll(async () => {
  w = await makeWorld("PCA", "PCB");
  await sql("UPDATE countries SET currency = 'GHS' WHERE code = 'PCB'").run();
  await put(w.seatA, "/fee-scales", { tier: "d1", role: "R", amount: 1000 });
  await put(w.seatB, "/fee-scales", { tier: "d1", role: "R", amount: 700 });
  const { fixtureId } = await addPlayedMatch({ country: "PCB", competition: "PCB-d1", referee: "PCA-ref2" });
  expect((await post(w.seatB, "/payments/generate", { fixtureId })).json.created).toBe(1);
  cross = { id: (await get(w.admin, `/payments?fixtureId=${fixtureId}`)).json.payments[0].id, fixtureId };

  await addCompetition("CAF-PC", "CAF", { tier: "continental" });
  await put(w.admin, "/fee-scales", { tier: "continental", role: "R", amount: 500, currency: "USD" });
  const t = await addPlayedMatch({ country: "CAF", competition: "CAF-PC", referee: "PCA-ref1", nations: ["PCA", "PCB"] });
  expect((await post(w.admin, "/payments/generate", { fixtureId: t.fixtureId })).json.created).toBe(1);
  tie = { id: (await get(w.admin, `/payments?fixtureId=${t.fixtureId}`)).json.payments[0].id, fixtureId: t.fixtureId };
});

const ids = async (s: Parameters<typeof get>[0], q = "") => (await get(s, `/payments${q}`)).json.payments.map((p: { id: string }) => p.id);

describe("a neutral official's line belongs to the federation paying it", () => {
  it("is listed and read by the host federation, in its currency and on its scale, with both countries named", async () => {
    expect(await ids(w.seatB)).toEqual([cross.id]);
    const p = (await get(w.seatB, `/payments/${cross.id}`)).json.payment;
    expect(p).toMatchObject({ countryCode: "PCB", officialCountryCode: "PCA", officialId: "PCA-ref2", base: 700, currency: "GHS" });
  });

  it("is not the official's home federation's to see or act on", async () => {
    expect(await ids(w.seatA)).toEqual([]);
    expect(await ids(w.seatA, `?officialId=PCA-ref2`)).toEqual([]);
    expect((await get(w.seatA, `/payments/${cross.id}`)).status).toBe(404);
    expect((await patch(w.seatA, `/payments/${cross.id}`, { presenceConfirmed: true })).status).toBe(404);
  });

  it("can be checked, validated and paid by the host federation, and the official sees it", async () => {
    const res = await patch(w.seatB, `/payments/${cross.id}`, { presenceConfirmed: true, matchValidated: true, expensesVerified: true });
    expect(res.status).toBe(200);
    expect((await post(w.seatB, `/payments/${cross.id}/validate`)).json.payment.status).toBe("validated");
    expect((await post(w.seatB, `/payments/${cross.id}/pay`, { reference: "VIR-PCB-001" })).json.payment.status).toBe("paid");
    expect(await ids(w.refA2)).toEqual([cross.id]);
  });

  it("counts in the host federation's budget and fee report, not the home federation's", async () => {
    expect((await get(w.seatB, "/reports/overview")).json.budget).toEqual([expect.objectContaining({ currency: "GHS", paid: 700 })]);
    expect((await get(w.seatA, "/reports/overview")).json.budget).toEqual([]);
    const fees = (await get(w.seatB, "/reports/fees?from=2000-01-01&to=2100-01-01")).json.rows;
    expect(fees).toEqual([expect.objectContaining({ currency: "GHS", total: 700 })]);
    expect((await get(w.seatA, "/reports/fees?from=2000-01-01&to=2100-01-01")).json.rows).toEqual([]);
  });

  it("sends a dispute to the federation that pays", async () => {
    // a fresh, unpaid line on another host match
    const { fixtureId } = await addPlayedMatch({ country: "PCB", competition: "PCB-d1", referee: "PCA-ref2" });
    await post(w.seatB, "/payments/generate", { fixtureId });
    const id = (await get(w.seatB, `/payments?fixtureId=${fixtureId}`)).json.payments[0].id;
    expect((await post(w.refA2, `/payments/${id}/contest`, { note: "Transport was not counted" })).status).toBe(200);
    const n = await sql("SELECT audience_role AS role, country_code AS country FROM notifications WHERE dedupe_key = ?", `contest:${id}`).first();
    expect(n).toEqual({ role: "federation", country: "PCB" });
  });
});

describe("a continental line belongs to the administrators", () => {
  it("is hidden from every federation, even the official's own", async () => {
    expect(await ids(w.seatA, `?fixtureId=${tie.fixtureId}`)).toEqual([]);
    expect((await get(w.seatA, `/payments/${tie.id}`)).status).toBe(404);
    expect((await get(w.seatB, `/payments/${tie.id}`)).status).toBe(404);
    expect((await get(w.admin, `/payments/${tie.id}`)).json.payment).toMatchObject({ countryCode: "CAF", officialCountryCode: "PCA", currency: "USD" });
  });

  it("sends a dispute to the administrators", async () => {
    expect((await post(w.refA1, `/payments/${tie.id}/contest`, { note: "Per diem missing for travel" })).status).toBe(200);
    const n = await sql("SELECT audience_role AS role, country_code AS country FROM notifications WHERE dedupe_key = ?", `contest:${tie.id}`).first();
    expect(n).toEqual({ role: "admin", country: null });
  });
});
