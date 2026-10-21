import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "../helpers";
import { get, makeWorld, post, type World } from "../helpers/evaluation";

let w: World;
beforeAll(async () => {
  w = await makeWorld("TCA", "TCB");
});

const name = { fr: "Lois du jeu", en: "Laws of the game" };
const make = (s: Parameters<typeof post>[0], extra: object = {}) => post(s, "/courses", { name, provider: "Academy", hours: 12, ...extra });
const list = async (s: Parameters<typeof get>[0]) => (await get(s, "/courses")).json.courses as Array<Record<string, any>>;

describe("courses", () => {
  it("are created platform-wide by an admin and for its own officials by a federation", async () => {
    const platform = await make(w.admin);
    expect(platform.json.federationId).toBeNull();
    const own = await make(w.seatA, { kind: "exam" });
    expect(own.status).toBe(201);
    expect(own.json.federationId).toBe(w.fedA);
    const forB = await make(w.admin, { federationId: w.fedB });
    expect(forB.json.federationId).toBe(w.fedB);
    const byId = Object.fromEntries((await list(w.admin)).map((c) => [c.id, c]));
    expect(byId[platform.json.id].name).toEqual(name);
    expect(byId[own.json.id]).toMatchObject({ kind: "exam", federationId: w.fedA });
  });

  it("shows a federation the platform-wide courses and its own, never another federation's; a referee likewise", async () => {
    const ids = async (s: Parameters<typeof get>[0]) => new Set((await list(s)).map((c) => c.federationId));
    expect(await ids(w.seatA)).toEqual(new Set([null, w.fedA]));
    expect(await ids(w.seatB)).toEqual(new Set([null, w.fedB]));
    expect(await ids(w.refA1)).toEqual(new Set([null, w.fedA]));
    expect(await ids(w.refB1)).toEqual(new Set([null, w.fedB]));
    expect(await ids(w.admin)).toEqual(new Set([null, w.fedA, w.fedB]));
  });

  it("enrols and completes only officials of its own country", async () => {
    const mine = (await make(w.seatA)).json.id;
    expect((await post(w.seatA, `/courses/${mine}/enrol`, { officialIds: ["TCA-ref1", "TCA-ref2"] })).json.enrolled).toBe(2);
    expect((await list(w.seatA)).find((c) => c.id === mine)!.officialIds.sort()).toEqual(["TCA-ref1", "TCA-ref2"]);
    expect((await post(w.seatA, `/courses/${mine}/complete`, { officialIds: ["TCA-ref1"] })).json.completed).toBe(1);
    expect((await list(w.seatA)).find((c) => c.id === mine)!.state).not.toBe("completed");
    await post(w.seatA, `/courses/${mine}/complete`, { officialIds: ["TCA-ref2"] });
    expect((await list(w.seatA)).find((c) => c.id === mine)!.state).toBe("completed");
  });

  it("does not leak enrolments of another country on a platform-wide course", async () => {
    const shared = (await make(w.admin)).json.id;
    await post(w.seatA, `/courses/${shared}/enrol`, { officialIds: ["TCA-ref1"] });
    await post(w.seatB, `/courses/${shared}/enrol`, { officialIds: ["TCB-ref1"] });
    const seen = async (s: Parameters<typeof get>[0]) => (await list(s)).find((c) => c.id === shared)!.officialIds;
    expect(await seen(w.seatA)).toEqual(["TCA-ref1"]);
    expect(await seen(w.seatB)).toEqual(["TCB-ref1"]);
    expect(await seen(w.refA1)).toEqual(["TCA-ref1"]);
    expect(await seen(w.refA2)).toEqual([]);
    expect((await seen(w.admin)).sort()).toEqual(["TCA-ref1", "TCB-ref1"]);
    // a federation completing its people does not close a course shared with the others
    await post(w.seatA, `/courses/${shared}/complete`, { officialIds: ["TCA-ref1"] });
    expect((await list(w.admin)).find((c) => c.id === shared)!.state).toBe("not-started");
  });

  it("validates the body", async () => {
    expect((await make(w.seatA, { name: { en: "Only English" } })).status).toBe(422);
    expect((await make(w.seatA, { hours: 0 })).status).toBe(422);
    expect((await make(w.seatA, { kind: "party" })).status).toBe(422);
    const c = (await make(w.seatA)).json.id;
    expect((await post(w.seatA, `/courses/${c}/enrol`, { officialIds: [] })).status).toBe(422);
  });

  it("answers 401 and 403", async () => {
    const c = (await make(w.seatA)).json.id;
    expect((await get(null, "/courses")).status).toBe(401);
    expect((await make(null)).status).toBe(401);
    expect((await make(w.refA1)).status).toBe(403);
    expect((await post(w.refA1, `/courses/${c}/enrol`, { officialIds: ["TCA-ref1"] })).status).toBe(403);
    expect((await post(w.refA1, `/courses/${c}/complete`, { officialIds: ["TCA-ref1"] })).status).toBe(403);
  });
});
