import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "../helpers";
import { addPlayedMatch, get, makeWorld, post, put, type World } from "../helpers/evaluation";

let w: World;
beforeAll(async () => {
  w = await makeWorld("RCA", "RCB");
  await sql("UPDATE officials SET name = ? WHERE id = 'RCA-ref1'", '=HYPERLINK("http://evil.example","click")').run();
  await sql("UPDATE officials SET name = ? WHERE id = 'RCA-ref2'", "+SUM(1+1)").run();
  await sql("UPDATE officials SET name = ? WHERE id = 'RCB-ref1'", "Foreign Secret Name").run();
});

describe("CSV exports", () => {
  it("neutralise spreadsheet formulas in what the register contains", async () => {
    const res = await get(w.seatA, "/reports/workload?format=csv");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain("workload.csv");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.text).toContain(`"'=HYPERLINK(""http://evil.example"",""click"")"`);
    expect(res.text).toContain("'+SUM(1+1)");
    expect(res.text).not.toMatch(/,=HYPERLINK/);
    expect(res.text).not.toMatch(/,\+SUM/);
  });

  it("start with a header row, use CRLF and only contain the caller's country", async () => {
    const res = await get(w.seatA, "/reports/workload?format=csv");
    expect(res.text.replace(/^﻿/, "").split("\r\n")[0]).toBe("officialId,name,countryCode,kind,status,appointments,asReferee,lastDate,nextDate,flag");
    expect(res.text).not.toContain("Foreign Secret Name");
    expect((await get(w.admin, "/reports/workload?format=csv")).text).toContain("Foreign Secret Name");
  });

  it("are available for every report", async () => {
    await put(w.seatA, "/fee-scales", { tier: "d1", role: "R", amount: 1000 });
    const { fixtureId } = await addPlayedMatch({ country: "RCA", competition: "RCA-d1", referee: "RCA-ref1" });
    await post(w.seatA, "/payments/generate", { fixtureId });
    await sql("UPDATE officials SET name = '=cmd|calc' WHERE id = 'RCA-ref1'").run();
    const q = "from=2019-01-01&to=2030-01-01&format=csv";
    for (const [path, file] of [["absences", "absences.csv"], ["fees", "fees-by-official.csv"], ["fees?groupBy=day", "fees-by-day.csv"], ["reconciliation", "reconciliation.csv"]] as const) {
      const res = await get(w.seatA, `/reports/${path}${path.includes("?") ? "&" : "?"}${q}`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-disposition")).toContain(file);
    }
    const fees = await get(w.seatA, `/reports/fees?${q}`);
    expect(fees.text).toContain("'=cmd|calc");
    expect(fees.text).not.toMatch(/(^|\r\n)=cmd/);
  });

  it("answers 401 unauthenticated and 403 to a referee", async () => {
    expect((await get(null, "/reports/workload?format=csv")).status).toBe(401);
    expect((await get(w.refA1, "/reports/workload?format=csv")).status).toBe(403);
  });

  it("rejects bad parameters", async () => {
    expect((await get(w.seatA, "/reports/workload?format=xml")).status).toBe(422);
    expect((await get(w.seatA, "/reports/workload?from=yesterday")).status).toBe(422);
    expect((await get(w.admin, "/reports/fees?groupBy=colour")).status).toBe(422);
  });
});
