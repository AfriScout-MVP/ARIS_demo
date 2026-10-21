import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addCompetition, sql } from "../helpers";
import { addPlayedMatch, get, makeWorld, post, put, type World } from "../helpers/evaluation";

let w: World;
const CREW = { AR1: "PGA-as1", AR2: "PGA-as2", FOURTH: "PGA-as3", OBS: "PGA-obs" };

beforeAll(async () => {
  w = await makeWorld("PGA", "PGB");
  await sql("UPDATE countries SET currency = 'MAD' WHERE code = 'PGA'").run();
});
beforeEach(async () => {
  await sql("DELETE FROM fee_scales").run();
});

const scale = (s: Parameters<typeof put>[0], extra: object) => put(s, "/fee-scales", { tier: "d1", role: "R", amount: 20000, transport: 2000, meals: 1000, ...extra });
const generate = (s: Parameters<typeof post>[0], fixtureId: string) => post(s, "/payments/generate", { fixtureId });
const lines = async (fixtureId: string) => (await get(w.seatA, `/payments?fixtureId=${fixtureId}`)).json.payments as Array<Record<string, any>>;
const match = (competition = "PGA-d1", status: "validated" | "published" | "draft" = "validated") => addPlayedMatch({ country: "PGA", competition, referee: "PGA-ref1", crew: CREW, designationStatus: status });

describe("generating the amounts due", () => {
  it("builds the lines from the federation's scale, in the country's currency", async () => {
    for (const role of ["R", "AR1", "AR2", "FOURTH", "OBS"]) await scale(w.seatA, { role, amount: role === "R" ? 20000 : 10000 });
    const { fixtureId } = await match();
    const res = await generate(w.seatA, fixtureId);
    expect(res.status).toBe(201);
    expect(res.json).toMatchObject({ created: 5, missingScale: [], defaultScaleUsed: [] });
    const referee = (await lines(fixtureId)).find((p) => p.role === "R")!;
    expect(referee).toMatchObject({ base: 20000, transport: 2000, meals: 1000, total: 23000, status: "due", currency: "MAD", officialId: "PGA-ref1", countryCode: "PGA", home: "Home FC", away: "Away FC" });
    // generating again creates nothing new
    const again = await generate(w.seatA, fixtureId);
    expect(again.status).toBe(200);
    expect(again.json.created).toBe(0);
  });

  it("prefers a competition scale over the federation tier scale, and that over the platform default", async () => {
    await scale(w.admin, { amount: 10000, currency: "XOF" }); // platform default, d1/R
    await scale(w.seatA, { amount: 20000 }); // federation d1/R
    await scale(w.seatA, { tier: "cup", competitionId: "PGA-cup", amount: 30000 }); // competition only
    await scale(w.admin, { role: "AR1", amount: 5000, currency: "XOF" }); // default only

    const d1 = await match();
    const gen = await generate(w.seatA, d1.fixtureId);
    expect(gen.json.defaultScaleUsed).toEqual(["AR1"]);
    expect(gen.json.missingScale.sort()).toEqual(["AR2", "FOURTH", "OBS"]);
    const byRole = Object.fromEntries((await lines(d1.fixtureId)).map((p) => [p.role, p]));
    expect(byRole.R.base).toBe(20000);
    expect(byRole.AR1.base).toBe(5000);
    expect(byRole.AR1.currency).toBe("MAD"); // the fixture country's currency, whichever scale it came from

    const cup = await match("PGA-cup");
    await generate(w.seatA, cup.fixtureId);
    expect((await lines(cup.fixtureId)).find((p) => p.role === "R")!.base).toBe(30000);
  });

  it("never uses another federation's scale", async () => {
    await scale(w.seatB, { amount: 99999 });
    const { fixtureId } = await match();
    const gen = await generate(w.seatA, fixtureId);
    expect(gen.json.created).toBe(0);
    expect(gen.json.missingScale).toContain("R");
  });

  it("keeps the scale's own currency on a continental tie, which only an admin can generate", async () => {
    await addCompetition("CAF-PG", "CAF", { tier: "continental" });
    await scale(w.admin, { tier: "continental", amount: 500, currency: "USD" });
    const tie = await addPlayedMatch({ country: "CAF", competition: "CAF-PG", referee: "PGA-ref1", nations: ["PGA", "PGB"] });
    expect((await generate(w.seatA, tie.fixtureId)).status).toBe(404);
    const gen = await generate(w.admin, tie.fixtureId);
    expect(gen.json.created).toBe(1);
    const p = (await get(w.admin, `/payments?fixtureId=${tie.fixtureId}`)).json.payments[0];
    expect(p).toMatchObject({ role: "R", base: 500, currency: "USD" });
  });

  it("waits for the crew to be validated", async () => {
    await scale(w.seatA, {});
    const { fixtureId } = await match("PGA-d1", "draft");
    const res = await generate(w.seatA, fixtureId);
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("not_validated");
    expect((await match("PGA-d1", "published")).fixtureId).toBeTruthy();
  });

  it("validates, and answers 401 / 403 / cross-country 404 without writing anything", async () => {
    await scale(w.seatA, {});
    const { fixtureId } = await match();
    expect((await post(w.seatA, "/payments/generate", {})).status).toBe(422);
    expect((await generate(w.seatA, "nope")).status).toBe(404);
    expect((await generate(null, fixtureId)).status).toBe(401);
    expect((await generate(w.refA1, fixtureId)).status).toBe(403);
    expect((await generate(w.seatB, fixtureId)).status).toBe(404);
    expect((await sql("SELECT COUNT(*) AS n FROM payments WHERE fixture_id = ?", fixtureId).first<{ n: number }>())!.n).toBe(0);
    expect((await generate(w.admin, fixtureId)).json.created).toBe(1);
  });
});
