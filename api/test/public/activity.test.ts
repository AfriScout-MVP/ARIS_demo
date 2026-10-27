import { beforeAll, describe, expect, it } from "vitest";
import { api, sql } from "../helpers";
import { MARKS, addPlayedMatch, makeWorld, post, type World } from "../helpers/evaluation";

let w: World;
beforeAll(async () => {
  w = await makeWorld("ACA", "ACB");
  const one = await addPlayedMatch({ country: "ACA", competition: "ACA-d1", referee: "ACA-ref1", crew: { OBS: "ACA-obs" } });
  await addPlayedMatch({ country: "ACA", competition: "ACA-d1", referee: "ACA-ref2" });
  await post(w.seatA, "/assessments", { matchId: one.matchId, observerId: "ACA-obs", marks: MARKS });
  // crews published this week, and one long ago that must not count
  await sql("UPDATE fixtures SET published_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 day') WHERE country_code = 'ACA'").run();
  await sql("UPDATE fixtures SET published_at = '2020-01-01T00:00:00.000Z' WHERE id = ?", one.fixtureId).run();
});

describe("public summary: the week's activity", () => {
  it("counts designations published and reports filed in the last 7 days per federation", async () => {
    const res = await api("GET", "/api/v1/public/summary");
    expect(res.status).toBe(200);
    expect(res.json.activity.days).toBe(7);
    const row = res.json.activity.federations.find((f: { country: string }) => f.country === "ACA");
    expect(row).toEqual({ country: "ACA", federation: "ACAFF", designationsPublished: 1, assessmentsFiled: 1 });
    // a federation that did nothing this week is not listed
    expect(res.json.activity.federations.find((f: { country: string }) => f.country === "ACB")).toBeUndefined();
  });

  it("contains no personal data", async () => {
    const text = (await api("GET", "/api/v1/public/summary")).text;
    const people = await sql("SELECT name, email FROM users UNION ALL SELECT name, email FROM officials").all<{ name: string; email: string | null }>();
    for (const p of people.results) {
      expect(text).not.toContain(p.name);
      if (p.email) expect(text).not.toContain(p.email);
    }
    expect(text).not.toMatch(/@|"(id|email|refereeId|officialId|observerId|matchId|fixtureId)"\s*:/);
    // the activity rows are counts keyed by federation, nothing else
    for (const row of JSON.parse(text).activity.federations) expect(Object.keys(row).sort()).toEqual(["assessmentsFiled", "country", "designationsPublished", "federation"]);
    // and no instants that would pin an action to a person or a fixture
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
});
