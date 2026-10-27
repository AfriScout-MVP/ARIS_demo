import { beforeAll, describe, expect, it } from "vitest";
import { addOfficial, addUser, login, sql, uid, type Session } from "../helpers";
import { fixture, get, nextDate, patch, post, put, world, type World } from "./support";
import { api } from "../helpers";

let w: World;
let designated: Session;
let marFx: string;
let egyFx: string;
let cafFx: string;

beforeAll(async () => {
  w = await world();
  await addOfficial("sc-ref", "EGY");
  await addUser("sc-ref@aris.test", "referee", { officialId: "sc-ref" });
  designated = await login("sc-ref@aris.test");
  marFx = uid("fx");
  egyFx = uid("fx");
  cafFx = uid("fx");
  await fixture(marFx, { country: "MAR", competition: "mar-d1", date: nextDate(), roles: ["R"] });
  await fixture(egyFx, { country: "EGY", competition: "egy-d1", date: nextDate(), roles: ["R"] });
  await fixture(cafFx, { country: "CAF", competition: "caf-cl", date: nextDate(), home: "Al Ahly", away: "Wydad AC", homeCode: "EGY", awayCode: "MAR", roles: ["R"] });
  await put(w.egy, egyFx, "R", { officialId: "sc-ref" });
});

const ids = (res: { json: { fixtures: Array<{ id: string }> } }) => res.json.fixtures.map((f) => f.id);

describe("listing is scoped in SQL", () => {
  it("shows a federation only its own country's fixtures", async () => {
    const res = await get(w.egy, "/fixtures?from=2000-01-01&to=2100-01-01");
    expect(res.status).toBe(200);
    expect(ids(res)).toContain(egyFx);
    expect(ids(res)).not.toContain(marFx);
    expect(ids(res)).not.toContain(cafFx);
    expect(res.json.fixtures.every((f: { countryCode: string }) => f.countryCode === "EGY")).toBe(true);
  });

  it("returns nothing when a federation asks for another country", async () => {
    const res = await get(w.egy, "/fixtures?country=MAR&from=2000-01-01&to=2100-01-01");
    expect(res.json).toEqual({ fixtures: [], total: 0, nextCursor: null });
  });

  it("shows the admin everything, including continental ties", async () => {
    const res = await get(w.admin, "/fixtures?from=2000-01-01&to=2100-01-01");
    expect(ids(res)).toEqual(expect.arrayContaining([egyFx, marFx, cafFx]));
    expect((await get(w.admin, "/fixtures?country=MAR&from=2000-01-01&to=2100-01-01")).json.fixtures.map((f: { id: string }) => f.id)).toEqual([marFx]);
  });

  it("shows a referee only the fixtures they are designated to", async () => {
    const res = await get(designated, "/fixtures?from=2000-01-01&to=2100-01-01");
    expect(ids(res)).toEqual([egyFx]);
    expect((await get(w.referee, "/fixtures?from=2000-01-01&to=2100-01-01")).json.fixtures).toEqual([]);
  });

  it("requires a session", async () => {
    expect((await get(null, "/fixtures")).status).toBe(401);
  });
});

describe("candidates never cross the federation boundary", () => {
  it("shows a federation seat only officials of its own country, the admin everyone", async () => {
    await addOfficial("sc-mar-ref", "MAR");
    const fx = uid("fx");
    await fixture(fx, { country: "EGY", competition: "egy-d1", date: nextDate(), roles: ["R"] });
    const mine = await get(w.egy, `/fixtures/${fx}/candidates?role=R&limit=300`);
    expect(mine.status).toBe(200);
    expect(mine.json.candidates.length).toBeGreaterThan(0);
    expect(mine.json.candidates.every((x: { countryCode: string }) => x.countryCode === "EGY")).toBe(true);
    const all = await get(w.admin, `/fixtures/${fx}/candidates?role=R&limit=300`);
    expect(all.json.candidates.length).toBeGreaterThanOrEqual(mine.json.candidates.length);
  });
});

describe("single-fixture routes answer 404 for what a caller may not see", () => {
  const cases: Array<[string, (s: Session, id: string) => Promise<{ status: number }>]> = [
    ["GET", (s, id) => get(s, `/fixtures/${id}`)],
    ["PATCH", (s, id) => patch(s, `/fixtures/${id}`, { importance: 10 })],
    ["PUT designation", (s, id) => put(s, id, "R", { officialId: "sc-ref" })],
    ["DELETE designation", (s, id) => api("DELETE", `/api/v1/fixtures/${id}/designations/R`, { session: s })],
    ["candidates", (s, id) => get(s, `/fixtures/${id}/candidates?role=R`)],
    ["history", (s, id) => get(s, `/fixtures/${id}/history`)],
    ["submit", (s, id) => post(s, `/fixtures/${id}/submit`)],
    ["validate", (s, id) => post(s, `/fixtures/${id}/validate`)],
    ["publish", (s, id) => post(s, `/fixtures/${id}/publish`)],
    ["convocations", (s, id) => get(s, `/fixtures/${id}/convocations`)],
    ["result", (s, id) => post(s, `/fixtures/${id}/result`, { score: "1-0" })],
    ["respond", (s, id) => post(s, `/fixtures/${id}/designations/R/respond`, { response: "accept" })],
  ];

  for (const [name, call] of cases) {
    it(`${name}: another country's and continental fixtures are 404 for a federation`, async () => {
      const before = await sql("SELECT importance FROM fixtures WHERE id = ?", marFx).first<{ importance: number }>();
      expect((await call(w.egy, marFx)).status).toBe(404);
      expect((await call(w.egy, cafFx)).status).toBe(404);
      expect((await call(w.egy, "does-not-exist")).status).toBe(404);
      expect(await sql("SELECT importance FROM fixtures WHERE id = ?", marFx).first()).toEqual(before);
    });
  }

  it("a fixture a referee is not designated to is 404 for them", async () => {
    expect((await get(designated, `/fixtures/${marFx}`)).status).toBe(404);
    expect((await get(designated, `/fixtures/${egyFx}`)).status).toBe(200);
  });

  it("leaves no trace of the refused writes", async () => {
    const n = await sql("SELECT COUNT(*) AS n FROM designation_history WHERE fixture_id IN (?, ?)", marFx, cafFx).first<{ n: number }>();
    expect(n!.n).toBe(0);
    const a = await sql("SELECT COUNT(*) AS n FROM audit_log WHERE entity = 'fixture' AND entity_id IN (?, ?)", marFx, cafFx).first<{ n: number }>();
    expect(a!.n).toBe(0);
  });
});
