import { describe, expect, it } from "vitest";
import { addCompetition, addFederationSeat, addFixture, addOfficial, addUser, api, login, sql } from "../helpers";

describe("my money: earnings, payment slip, withdrawing an advance", async () => {
  const seatA = await addFederationSeat("MNA");
  const seatB = await addFederationSeat("MNB");
  await addCompetition("mna-d1", "MNA", { season: "2025/2026" });
  await addCompetition("mna-cup", "MNA", { tier: "cup", season: "2026/2027" });
  await addOfficial("mn-1", "MNA");
  await addOfficial("mn-2", "MNA");
  await addUser("mn-ref1@aris.test", "referee", { officialId: "mn-1" });
  await addUser("mn-ref2@aris.test", "referee", { officialId: "mn-2" });
  const ref1 = await login("mn-ref1@aris.test");
  const ref2 = await login("mn-ref2@aris.test");
  const fedA = await login(seatA.email);
  const fedB = await login(seatB.email);
  const call = (method: string, path: string, s: typeof ref1 | null, body?: object) => api(method, `/api/v1${path}`, { session: s, body });

  let n = 0;
  async function line(official: string, competition: string, date: string, base: number, status: string) {
    const fx = `mn-fx-${++n}`;
    await addFixture(fx, { country: "MNA", competition, date, round: n, roles: ["R"] });
    const paid = status === "paid";
    await sql(
      `INSERT INTO payments (id, fixture_id, role, official_id, base, transport, currency, status, presence_confirmed, match_validated, expenses_verified, paid_at, payment_ref)
       VALUES (?, ?, 'R', ?, ?, 100, 'XOF', ?, ?, ?, ?, ?, ?)`,
      `mn-pay-${n}`, fx, official, base, status, paid ? 1 : 0, paid ? 1 : 0, paid ? 1 : 0, paid ? "2026-01-10T09:00:00Z" : null, paid ? "VIR-2026-001" : null,
    ).run();
    return `mn-pay-${n}`;
  }
  const paidLine = await line("mn-1", "mna-d1", "2025-11-02", 1000, "paid");
  await line("mn-1", "mna-d1", "2026-02-02", 2000, "due");
  await line("mn-1", "mna-d1", "2026-03-02", 3000, "validated");
  await line("mn-1", "mna-cup", "2026-09-02", 4000, "contested");
  await line("mn-1", "mna-cup", "2026-10-02", 9000, "cancelled");
  const dueLine = `mn-pay-2`;
  await line("mn-2", "mna-d1", "2026-02-02", 7000, "paid");

  it("sums paid, pending and contested by season", async () => {
    const res = await call("GET", "/me/earnings", ref1);
    expect(res.status).toBe(200);
    expect(res.json.periods).toEqual([
      { period: "2026/2027", currency: "XOF", paid: 0, pending: 0, contested: 4100, lines: 1 },
      { period: "2025/2026", currency: "XOF", paid: 1100, pending: 5200, contested: 0, lines: 3 },
    ]);
  });

  it("or by calendar year", async () => {
    const res = await call("GET", "/me/earnings?by=year", ref1);
    expect(res.json.periods).toEqual([
      { period: "2026", currency: "XOF", paid: 0, pending: 5200, contested: 4100, lines: 3 },
      { period: "2025", currency: "XOF", paid: 1100, pending: 0, contested: 0, lines: 1 },
    ]);
    expect((await call("GET", "/me/earnings?by=week", ref1)).status).toBe(422);
    expect((await call("GET", "/me/earnings", fedA)).status).toBe(403);
    expect((await call("GET", "/me/earnings", null)).status).toBe(401);
  });

  it("issues a slip for an own paid line only", async () => {
    const res = await call("GET", `/me/payments/${paidLine}/slip`, ref1);
    expect(res.status).toBe(200);
    expect(res.json.slip).toMatchObject({ id: paidLine, total: 1100, base: 1000, transport: 100, paymentRef: "VIR-2026-001", paidAt: "2026-01-10T09:00:00Z", officialName: "Official mn-1", competition: "League mna-d1", season: "2025/2026", payer: { code: "MNAFF" } });
    expect((await call("GET", `/me/payments/${dueLine}/slip`, ref1)).json.error.code).toBe("not_paid");
    expect((await call("GET", `/me/payments/${paidLine}/slip`, ref2)).status).toBe(404);
    expect((await call("GET", "/me/payments/nope/slip", ref1)).status).toBe(404);
    // the receipts of an own line come with its detail
    const detail = await call("GET", `/payments/${paidLine}`, ref1);
    expect(detail.json.payment.receipts).toEqual([]);
    expect((await call("GET", `/payments/${paidLine}`, ref2)).status).toBe(404);
  });

  it("withdraws an own advance request while nobody has decided on it", async () => {
    const asked = await call("POST", "/advances", ref1, { amount: 5000, justification: "Train to the away match" });
    const id = asked.json.advance.id as string;
    expect((await call("DELETE", `/me/advances/${id}`, ref2)).status).toBe(404);
    expect((await call("DELETE", `/me/advances/${id}`, fedB)).status).toBe(403);
    expect((await call("DELETE", `/me/advances/${id}`, null)).status).toBe(401);
    expect((await call("DELETE", `/me/advances/${id}`, ref1)).status).toBe(200);
    expect(await sql("SELECT 1 AS x FROM advances WHERE id = ?", id).first()).toBeNull();
    expect((await call("DELETE", `/me/advances/${id}`, ref1)).status).toBe(404);
    const audit = await sql("SELECT before, country_code AS country FROM audit_log WHERE action = 'advance.withdraw' AND entity_id = ?", id).first<{ before: string; country: string }>();
    expect(audit?.country).toBe("MNA");
    expect(JSON.parse(audit!.before)).toMatchObject({ amount: 5000 });
    expect(JSON.stringify((await call("GET", "/notifications", fedA)).json)).toContain("Advance request withdrawn");
    expect(JSON.stringify((await call("GET", "/notifications", fedB)).json)).not.toContain("Advance request withdrawn");

    const decided = (await call("POST", "/advances", ref1, { amount: 800, justification: "Hotel the night before" })).json.advance.id as string;
    await call("POST", `/advances/${decided}/decide`, fedA, { status: "approved" });
    expect((await call("DELETE", `/me/advances/${decided}`, ref1)).json.error.code).toBe("bad_state");
  });
});
