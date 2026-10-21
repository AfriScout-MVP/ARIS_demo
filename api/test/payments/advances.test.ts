import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "../helpers";
import { addPlayedMatch, get, makeWorld, post, type World } from "../helpers/evaluation";

let w: World;
beforeAll(async () => {
  w = await makeWorld("PVA", "PVB");
  await sql("UPDATE countries SET currency = 'MAD' WHERE code = 'PVA'").run();
});

const ask = (s: Parameters<typeof post>[0], extra: object = {}) => post(s, "/advances", { amount: 5000, justification: "Train ticket to the away match", ...extra });

describe("advances", () => {
  it("lets a referee ask for themselves, in their country's currency, whatever officialId they send", async () => {
    const res = await ask(w.refA1, { officialId: "PVA-ref2" });
    expect(res.status).toBe(201);
    expect(res.json.advance).toMatchObject({ officialId: "PVA-ref1", status: "requested" });
    const mine = (await get(w.refA1, "/advances")).json.advances;
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ currency: "MAD", countryCode: "PVA", amount: 5000 });
    expect((await get(w.refA2, "/advances")).json.advances).toHaveLength(0);
  });

  it("alerts that country's federation in both languages, and no other", async () => {
    const titles = async (s: typeof w.seatA) => (await get(s, "/notifications")).json.notifications.filter((n: { title: { en: string } }) => n.title.en === "Advance requested");
    expect((await titles(w.seatA))[0].title.fr).toBe("Avance demandée");
    expect(await titles(w.seatB)).toHaveLength(0);
  });

  it("lets staff ask on behalf of an official of their own country only", async () => {
    expect((await ask(w.seatA, { officialId: "PVA-ref2" })).status).toBe(201);
    expect((await ask(w.seatA)).json.error.code).toBe("official_required");
    expect((await ask(w.seatA, { officialId: "PVB-ref1" })).status).toBe(404);
    expect((await ask(w.admin, { officialId: "PVB-ref1" })).status).toBe(201);
    expect((await sql("SELECT COUNT(*) AS n FROM advances WHERE official_id = 'PVB-ref1'").first<{ n: number }>())!.n).toBe(1);
  });

  it("validates the body and the fixture link", async () => {
    expect((await ask(w.refA1, { amount: 0 })).status).toBe(422);
    expect((await ask(w.refA1, { justification: "no" })).status).toBe(422);
    expect((await ask(w.refA1, { fixtureId: "nope" })).json.error.code).toBe("unknown_reference");
    const foreign = await addPlayedMatch({ country: "PVB", competition: "PVB-d1", referee: "PVB-ref1" });
    expect((await ask(w.refA1, { fixtureId: foreign.fixtureId })).json.error.code).toBe("unknown_reference");
    const own = await addPlayedMatch({ country: "PVA", competition: "PVA-d1", referee: "PVA-ref1" });
    expect((await ask(w.refA1, { fixtureId: own.fixtureId })).status).toBe(201);
  });

  it("follows requested → approved → paid → settled, and refuses other moves", async () => {
    const id = (await ask(w.refA1)).json.advance.id;
    const decide = (s: Parameters<typeof post>[0], status: string) => post(s, `/advances/${id}/decide`, { status });
    expect((await decide(w.seatA, "paid")).json.error.code).toBe("bad_state");
    expect((await decide(w.seatA, "approved")).status).toBe(200);
    expect((await decide(w.seatA, "paid")).status).toBe(200);
    expect((await decide(w.seatA, "rejected")).status).toBe(409);
    expect((await decide(w.seatA, "settled")).status).toBe(200);
    expect((await decide(w.seatA, "bogus")).status).toBe(422);
    expect((await get(w.refA1, "/notifications")).json.notifications.some((n: { title: { en: string } }) => n.title.en === "Advance approved")).toBe(true);
  });

  it("answers 401 / 403 / cross-country 404", async () => {
    const id = (await ask(w.refA1)).json.advance.id;
    expect((await get(null, "/advances")).status).toBe(401);
    expect((await ask(null)).status).toBe(401);
    expect((await post(null, `/advances/${id}/decide`, { status: "approved" })).status).toBe(401);
    expect((await post(w.refA1, `/advances/${id}/decide`, { status: "approved" })).status).toBe(403);
    expect((await post(w.seatB, `/advances/${id}/decide`, { status: "approved" })).status).toBe(404);
    expect((await post(w.seatA, "/advances/nope/decide", { status: "approved" })).status).toBe(404);
    expect((await sql("SELECT status FROM advances WHERE id = ?", id).first<{ status: string }>())!.status).toBe("requested");
    expect((await get(w.seatB, "/advances")).json.advances.every((a: { countryCode: string }) => a.countryCode === "PVB")).toBe(true);
    expect((await get(w.seatA, "/advances?country=PVB")).json.advances).toHaveLength(0);
  });
});
