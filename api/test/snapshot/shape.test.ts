import { beforeAll, describe, expect, it } from "vitest";
import { api, sql } from "../helpers";
import { snapshotWorld, WINDOW, type SnapshotWorld } from "./support";

let w: SnapshotWorld;
let s: any;
beforeAll(async () => {
  w = await snapshotWorld();
  await sql("UPDATE countries SET flag_media_id = NULL").run();
  s = (await api("GET", `/api/v1${WINDOW}`, { session: w.admin })).json;
});

describe("GET /snapshot shape", () => {
  it("has every top-level key of the contract", () => {
    expect(Object.keys(s).sort()).toEqual(
      ["analytics", "assessments", "assistants", "availability", "competitions", "countries", "courses", "criteria", "dossiers", "fitnessTests", "fixtures", "licences", "matches", "referees", "today", "window"].sort(),
    );
  });

  it("describes countries with the new fields and the club teams", async () => {
    await sql("INSERT INTO media_assets (id, kind, visibility, r2_key, filename, content_type, size, sha256) VALUES ('flag-egy', 'flag', 'public', 'flags/egy', 'egy.png', 'image/png', 10, ?)", "a".repeat(64)).run();
    await sql("UPDATE countries SET flag_media_id = 'flag-egy' WHERE code = 'EGY'").run();
    const res = (await api("GET", `/api/v1${WINDOW}`, { session: w.admin })).json;
    const egy = res.countries.find((c: { code: string }) => c.code === "EGY");
    expect(egy).toMatchObject({ iso2: expect.any(String), nameFr: "EGY fr", nameEs: "EGY es", nameDe: "EGY de", flagUrl: "/api/v1/media/flag-egy", federation: "EGYFF", federationName: "Federation EGY", timezone: "Africa/Cairo", currency: "XOF", active: true, clubs: ["EGY Away", "EGY Home"] });
    expect(res.countries.find((c: { code: string }) => c.code === "MAR").flagUrl).toBeNull();
  });

  it("returns fixtures with local time, team ids and nations", () => {
    const f = s.fixtures.find((x: { id: string }) => x.id === "fx-EGY");
    expect(f).toMatchObject({ date: "2031-06-10", kickoff: "21:00", kickoffAt: "2031-06-10T18:00:00Z", status: "scheduled", played: false, designationStatus: "draft", homeCode: null, awayCode: null, home: "EGY Home", away: "EGY Away" });
    expect(f.homeTeamId).toEqual(expect.any(String));
    expect(f.crew[0]).toMatchObject({ role: "R", state: "empty" });
    expect(s.fixtures.find((x: { id: string }) => x.id === "fx-CAF")).toMatchObject({ homeCode: "EGY", awayCode: "MAR" });
  });

  it("returns matches with scores, season, heat points and decisions", () => {
    const m = s.matches.find((x: { id: string }) => x.id === "m-EGY");
    expect(m).toMatchObject({ score: "2–1", homeScore: 2, awayScore: 1, season: "2026/2027", status: "finished", refereeId: "EGY-ref", arpsForMatch: 8.2, heatPoints: [{ x: 10, y: 20, intensity: 0.5 }] });
    expect(m.decisions).toHaveLength(3);
  });

  it("returns referees, assessments and criteria in the app's shapes", () => {
    expect(s.referees[0]).toHaveProperty("rmcsAvg");
    expect(s.referees[0]).toHaveProperty("cards.yellow");
    expect(typeof s.referees[0].bio).toBe("object");
    expect(s.referees[0]).toHaveProperty("photoUrl", null);
    expect(s.assessments[0].notes).toEqual({ en: "ok", fr: "ok" });
    expect(s.criteria).toEqual([
      { key: "positioning", label: { fr: "Placement", en: "Positioning" }, weight: 60 },
      { key: "decisions", label: { fr: "Décisions", en: "Decisions" }, weight: 40 },
    ]);
    expect(s.criteria.reduce((n: number, c: { weight: number }) => n + c.weight, 0)).toBe(100);
    expect(s.competitions.find((c: { id: string }) => c.id === "egy-d1")).toMatchObject({ countryCode: "EGY", varEnabled: false, season: "2026/2027" });
  });
});
