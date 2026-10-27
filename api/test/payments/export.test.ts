import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "../helpers";
import { addPlayedMatch, get, makeWorld, patch, post, put, type World } from "../helpers/evaluation";

// GET /payments paging (limit + offset) and the CSV export of the same rows.
let w: World;
beforeAll(async () => {
  w = await makeWorld("PXA", "PXB");
  await put(w.seatA, "/fee-scales", { tier: "d1", role: "R", amount: 1000 });
  await put(w.seatB, "/fee-scales", { tier: "d1", role: "R", amount: 1000 });
  for (let i = 0; i < 5; i++) {
    const { fixtureId } = await addPlayedMatch({ country: "PXA", competition: "PXA-d1", referee: i % 2 ? "PXA-ref1" : "PXA-ref2" });
    await post(w.seatA, "/payments/generate", { fixtureId });
  }
  const { fixtureId } = await addPlayedMatch({ country: "PXB", competition: "PXB-d1", referee: "PXB-ref1" });
  await post(w.seatB, "/payments/generate", { fixtureId });
  await sql("UPDATE officials SET name = '=HYPERLINK(\"x\")' WHERE id = 'PXA-ref2'").run();
});

describe("GET /payments paging", () => {
  it("pages with limit + offset without losing or repeating a row", async () => {
    const first = (await get(w.seatA, "/payments?limit=2")).json;
    expect(first).toMatchObject({ limit: 2, offset: 0, nextOffset: 2 });
    const second = (await get(w.seatA, "/payments?limit=2&offset=2")).json;
    const third = (await get(w.seatA, "/payments?limit=2&offset=4")).json;
    expect(third.nextOffset).toBeNull();
    const ids = [...first.payments, ...second.payments, ...third.payments].map((p: { id: string }) => p.id);
    expect(new Set(ids).size).toBe(5);
    expect((await get(w.seatA, "/payments?limit=0")).status).toBe(422);
  });
});

describe("GET /payments?format=csv", () => {
  it("exports the caller's rows with net amounts, neutralised text and real negative numbers", async () => {
    const line = (await get(w.seatA, "/payments?limit=1")).json.payments[0];
    await patch(w.seatA, `/payments/${line.id}`, { presenceConfirmed: true, matchValidated: true, expensesVerified: true });
    await post(w.seatA, `/payments/${line.id}/validate`);
    await post(w.seatA, `/payments/${line.id}/pay`, { reference: "VIR-CSV" });
    await post(w.seatA, `/payments/${line.id}/correction`, { delta: -300, reason: "Overpaid transport" });

    const res = await get(w.seatA, "/payments?format=csv");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toMatch(/payments-\d{4}-\d{2}-\d{2}\.csv/);
    const lines = res.text.replace(/^﻿/, "").trim().split("\r\n");
    expect(lines[0]).toBe(
      "id,date,countryCode,competitionId,fixtureId,home,away,role,officialId,officialName,officialCountryCode,base,transport,lodging,meals,bonus,deduction,total,correctionTotal,advanceDeduction,net,currency,status,validatedAt,paidAt,paymentRef",
    );
    expect(lines).toHaveLength(6);
    const corrected = lines.find((l) => l.startsWith(line.id))!;
    expect(corrected).toContain(",1000,-300,0,700,");
    expect(res.text).toContain(`"'=HYPERLINK(""x"")"`);
    expect(res.text).not.toContain("PXB-ref1");
  });

  it("gives a referee their own lines only, and refuses nobody signed in", async () => {
    const res = await get(w.refA1, "/payments?format=csv");
    expect(res.status).toBe(200);
    const rows = res.text.replace(/^﻿/, "").trim().split("\r\n").slice(1);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.includes(",PXA-ref1,"))).toBe(true);
    expect((await get(null, "/payments?format=csv")).status).toBe(401);
    expect((await get(w.seatA, "/payments?format=xls")).status).toBe(422);
  });
});
