import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "../helpers";
import { addFixture } from "../helpers";
import { addPlayedMatch, get, makeWorld, type World } from "../helpers/evaluation";

let w: World;
const range = "from=2030-01-01&to=2030-12-31";
const rows = async (s: Parameters<typeof get>[0], q = "") => (await get(s, `/reports/workload?${range}${q}`)).json.rows as Array<Record<string, any>>;

beforeAll(async () => {
  w = await makeWorld("RWA", "RWB");
  // RWA-ref1 works a lot, RWA-ref2 a little, RWA-obs not at all; RWB-ref1 in the other country
  for (let i = 1; i <= 6; i++) {
    const fx = `fx-rw-${i}`;
    await addFixture(fx, { country: "RWA", competition: "RWA-d1", date: `2030-0${i}-10`, round: 100 + i, roles: ["R", "AR1"] });
    await sql("UPDATE designations SET official_id = 'RWA-ref1', state = 'confirmed' WHERE fixture_id = ? AND role = 'R'", fx).run();
    if (i === 1) await sql("UPDATE designations SET official_id = 'RWA-ref2', state = 'pending' WHERE fixture_id = ? AND role = 'AR1'", fx).run();
  }
  await addFixture("fx-rw-b", { country: "RWB", competition: "RWB-d1", date: "2030-02-02", roles: ["R"] });
  await sql("UPDATE designations SET official_id = 'RWB-ref1', state = 'confirmed' WHERE fixture_id = 'fx-rw-b'").run();
});

describe("workload", () => {
  it("counts appointments per person, with the next date, and flags the overused and the unused", async () => {
    const r = await rows(w.seatA);
    const by = Object.fromEntries(r.map((x) => [x.officialId, x]));
    expect(by["RWA-ref1"]).toMatchObject({ appointments: 6, asReferee: 6, nextDate: "2030-01-10", flag: "overused" });
    expect(by["RWA-ref2"]).toMatchObject({ appointments: 1, asReferee: 0, flag: null });
    expect(by["RWA-obs"]).toMatchObject({ appointments: 0, flag: "unused" });
    expect(r[0].officialId).toBe("RWA-ref1"); // busiest first
  });

  it("ignores declined designations and honours the competition filter", async () => {
    await sql("UPDATE designations SET state = 'declined' WHERE fixture_id = 'fx-rw-6' AND role = 'R'").run();
    expect((await rows(w.seatA)).find((x) => x.officialId === "RWA-ref1")!.appointments).toBe(5);
    expect((await rows(w.seatA, "&competition=RWB-d1")).every((x) => x.appointments === 0)).toBe(true);
  });

  it("shows when each person last worked (played matches)", async () => {
    const { fixtureId } = await addPlayedMatch({ country: "RWA", competition: "RWA-d1", referee: "RWA-obs" });
    const date = (await sql("SELECT date FROM fixtures WHERE id = ?", fixtureId).first<{ date: string }>())!.date;
    const row = (await get(w.seatA, `/reports/workload?from=2019-01-01&to=2030-01-01`)).json.rows.find((x: { officialId: string }) => x.officialId === "RWA-obs");
    expect(row).toMatchObject({ appointments: 1, lastDate: date });
  });

  it("returns the mean and the period", async () => {
    const res = (await get(w.seatA, `/reports/workload?${range}`)).json;
    expect(res).toMatchObject({ from: "2030-01-01", to: "2030-12-31", country: "RWA" });
    expect(res.mean).toBeGreaterThan(0);
  });

  it("answers 401 / 403", async () => {
    expect((await get(null, `/reports/workload?${range}`)).status).toBe(401);
    expect((await get(w.obsA, `/reports/workload?${range}`)).status).toBe(403);
  });
});
