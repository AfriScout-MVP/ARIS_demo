import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../helpers";
import { snapshotWorld, WINDOW, type SnapshotWorld } from "./support";

let w: SnapshotWorld;
const snap = (s: SnapshotWorld[keyof SnapshotWorld] | null) => api("GET", `/api/v1${WINDOW}`, { session: s as never });
beforeAll(async () => {
  w = await snapshotWorld();
});

describe("GET /snapshot access", () => {
  it("is 401 without a session and 403 for a referee", async () => {
    expect((await snap(null)).status).toBe(401);
    expect((await snap(w.referee)).status).toBe(403);
  });
});

describe("a federation receives only its own country's data", () => {
  it("returns EGY rows for every list and nothing of MAR or CAF", async () => {
    const res = await snap(w.egy);
    expect(res.status).toBe(200);
    const s = res.json;
    expect(s.countries.map((c: { code: string }) => c.code)).toEqual(["EGY"]);
    expect(s.competitions.map((c: { id: string }) => c.id)).toEqual(["egy-d1"]);
    expect(s.referees.map((r: { id: string }) => r.id)).toEqual(["EGY-obs", "EGY-ref"]);
    expect(s.assistants.map((r: { id: string }) => r.id)).toEqual(["EGY-ast"]);
    expect(s.fixtures.map((f: { id: string }) => f.id)).toEqual(["fx-EGY"]);
    expect(s.matches.map((m: { id: string }) => m.id)).toEqual(["m-EGY"]);
    expect(s.assessments.map((a: { id: string }) => a.id)).toEqual(["a-EGY"]);
    expect(s.licences.map((l: { id: string }) => l.id)).toEqual(["l-EGY"]);
    expect(s.fitnessTests.map((f: { refereeId: string }) => f.refereeId)).toEqual(["EGY-ref"]);
    expect(s.dossiers.map((d: { id: string }) => d.id)).toEqual(["d-EGY"]);
    expect(s.availability.map((a: { officialId: string }) => a.officialId)).toEqual(["EGY-ref"]);
    expect(JSON.stringify(s)).not.toMatch(/MAR|fx-CAF|caf-cl/);
  });

  it("gets the platform-wide courses and its own, without other countries' officials in them", async () => {
    const s = (await snap(w.egy)).json;
    expect(s.courses.map((c: { id: string }) => c.id).sort()).toEqual(["c-EGY", "c-all"]);
    expect(s.courses.find((c: { id: string }) => c.id === "c-all").refereeIds).toEqual(["EGY-ref"]);
  });

  it("is the mirror image for the other federation", async () => {
    const s = (await snap(w.mar)).json;
    expect(s.countries.map((c: { code: string }) => c.code)).toEqual(["MAR"]);
    expect(s.fixtures.map((f: { id: string }) => f.id)).toEqual(["fx-MAR"]);
    expect(s.courses.map((c: { id: string }) => c.id).sort()).toEqual(["c-MAR", "c-all"]);
    expect(JSON.stringify(s)).not.toMatch(/EGY/);
  });
});

describe("the admin receives everything", () => {
  it("includes both countries and the continental tie", async () => {
    const s = (await snap(w.admin)).json;
    expect(s.countries.map((c: { code: string }) => c.code)).toEqual(expect.arrayContaining(["EGY", "MAR"]));
    expect(s.competitions.map((c: { id: string }) => c.id)).toEqual(expect.arrayContaining(["egy-d1", "mar-d1", "caf-cl"]));
    expect(s.fixtures.map((f: { id: string }) => f.id).sort()).toEqual(["fx-CAF", "fx-EGY", "fx-MAR"]);
    expect(s.matches).toHaveLength(2);
    expect(s.courses).toHaveLength(3);
  });

  it("honours the fixture window", async () => {
    const res = await api("GET", "/api/v1/snapshot?from=2031-06-11&to=2031-06-30", { session: w.admin });
    expect(res.json.fixtures).toEqual([]);
    expect(res.json.window).toEqual({ from: "2031-06-11", to: "2031-06-30" });
    expect((await api("GET", "/api/v1/snapshot?from=bad", { session: w.admin })).status).toBe(422);
  });
});
