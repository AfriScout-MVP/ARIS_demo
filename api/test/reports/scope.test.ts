import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "../helpers";
import { addPlayedMatch, get, makeWorld, post, put, type World } from "../helpers/evaluation";

let w: World;
const q = "from=2019-01-01&to=2031-01-01";

beforeAll(async () => {
  w = await makeWorld("RSA", "RSB");
  await sql("UPDATE countries SET currency = 'GHS' WHERE code = 'RSB'").run();
  for (const s of [w.seatA, w.seatB]) await put(s, "/fee-scales", { tier: "d1", role: "R", amount: 1000 });
  for (const [country, referee] of [["RSA", "RSA-ref1"], ["RSB", "RSB-ref1"]] as const) {
    const { fixtureId } = await addPlayedMatch({ country, competition: `${country}-d1`, referee });
    await post(w.admin, "/payments/generate", { fixtureId });
  }
  await sql("INSERT INTO incidents (id, kind, official_id, description) VALUES ('inc-rs-a', 'absence', 'RSA-ref1', 'a'), ('inc-rs-b1', 'lateness', 'RSB-ref1', 'b'), ('inc-rs-b2', 'lateness', 'RSB-ref1', 'b')").run();
});

const countOf = (rows: Array<{ kind: string; n: number }>) => rows.reduce((s, r) => s + r.n, 0);

describe("reports are scoped to the country", () => {
  it("overview counts only the federation's own officials, money and compliance", async () => {
    const a = (await get(w.seatA, "/reports/overview")).json;
    const b = (await get(w.seatB, "/reports/overview")).json;
    const all = (await get(w.admin, "/reports/overview")).json;
    expect(a.country).toBe("RSA");
    expect(a.workforce.referees + b.workforce.referees).toBe(all.workforce.referees);
    expect(a.workforce.referees).toBeLessThan(all.workforce.referees);
    expect(a.budget).toEqual([expect.objectContaining({ currency: "XOF", planned: 1000 })]);
    expect(b.budget).toEqual([expect.objectContaining({ currency: "GHS", planned: 1000 })]);
    expect(all.budget.map((x: { currency: string }) => x.currency).sort()).toEqual(["GHS", "XOF"]);
    expect(all.country).toBeNull();
    expect((await get(w.admin, "/reports/overview?country=rsb")).json.workforce.referees).toBe(b.workforce.referees);
  });

  it("a federation asking for another country still gets only its own", async () => {
    expect((await get(w.seatA, "/reports/overview?country=RSB")).json.country).toBe("RSA");
    expect((await get(w.seatA, `/reports/workload?${q}&country=RSB`)).json.rows.every((r: { countryCode: string }) => r.countryCode === "RSA")).toBe(true);
  });

  it("absences count the country's incidents only", async () => {
    const a = (await get(w.seatA, "/reports/absences")).json;
    const b = (await get(w.seatB, "/reports/absences")).json;
    const all = (await get(w.admin, "/reports/absences")).json;
    expect(countOf(a.incidents)).toBe(1);
    expect(countOf(b.incidents)).toBe(2);
    expect(countOf(all.incidents)).toBe(3);
    expect(countOf((await get(w.admin, "/reports/absences?country=RSB")).json.incidents)).toBe(2);
  });

  it("fees and reconciliation show only the country's lines", async () => {
    const fees = (await get(w.seatA, `/reports/fees?${q}`)).json.rows;
    expect(fees.map((r: { key: string }) => r.key)).toEqual(["Official RSA-ref1"]);
    expect((await get(w.seatB, `/reports/fees?${q}&groupBy=competition`)).json.rows.map((r: { key: string }) => r.key)).toEqual(["RSB-d1"]);
    const recA = (await get(w.seatA, `/reports/reconciliation?${q}`)).json;
    expect(recA.checked).toBe(1);
    expect(recA.issues).toEqual([]); // the one played match was billed
    await sql("UPDATE fixtures SET status = 'scheduled' WHERE country_code = 'RSB'").run();
    await sql("UPDATE payments SET presence_confirmed = 1, match_validated = 1, expenses_verified = 1, status = 'paid', paid_at = '2030-01-01' WHERE official_id = 'RSB-ref1'").run();
    const recB = (await get(w.seatB, `/reports/reconciliation?${q}`)).json;
    expect(recB.issues).toEqual([expect.objectContaining({ officialName: "Official RSB-ref1", issue: "paid-not-played" })]);
    expect((await get(w.seatA, `/reports/reconciliation?${q}`)).json.issues).toEqual([]);
    expect((await get(w.admin, `/reports/reconciliation?${q}`)).json.checked).toBe(2);
  });

  it("flags matches played but never billed", async () => {
    const { fixtureId } = await addPlayedMatch({ country: "RSA", competition: "RSA-d1", referee: "RSA-ref2" });
    const issue = (await get(w.seatA, `/reports/reconciliation?${q}`)).json.issues.find((i: { fixtureId: string }) => i.fixtureId === fixtureId);
    expect(issue.issue).toBe("played-not-billed");
  });

  it("is staff only: 401 and 403 on every report", async () => {
    for (const path of ["overview", "workload", "absences", "fees", "reconciliation"]) {
      expect((await get(null, `/reports/${path}`)).status).toBe(401);
      expect((await get(w.refA1, `/reports/${path}`)).status).toBe(403);
      expect((await get(w.obsA, `/reports/${path}?format=csv`)).status).toBe(403);
    }
  });
});
