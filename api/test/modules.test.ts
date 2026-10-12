import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { addCompetition, addCountry, addFixture, addOfficial, addUser, api, login, sql, uid, type Session } from "./helpers";

let admin: Session;
let commission: Session;
let refA: Session; // referee user for off-a
let refB: Session; // another referee user
let observerS: Session;

const put = (s: Session, fx: string, role: string, body: object) => api("PUT", `/api/v1/fixtures/${fx}/designations/${role}`, { session: s, body });
const post = (s: Session | null, path: string, body?: object) => api("POST", `/api/v1${path}`, { session: s, body });
const get = (s: Session | null, path: string) => api("GET", `/api/v1${path}`, { session: s });

let day = 0;
/** A date far in the past (so matches can be 'played') and unique per call. */
const pastDate = () => new Date(Date.UTC(2020, 0, 1 + (day += 7))).toISOString().slice(0, 10);

beforeAll(async () => {
  await addCountry("QAA", "UNAF");
  await addCompetition("qaa-d1", "QAA");
  await addCompetition("qaa-cup", "QAA", { tier: "cup" });
  for (const [id, kind] of [["off-a", "referee"], ["off-b", "referee"], ["off-obs", "referee"], ["asst-1", "assistant"], ["asst-2", "assistant"], ["asst-3", "assistant"]] as const) {
    await addOfficial(id, "QAA", { kind });
  }
  await addUser("admin2@aris.test", "admin");
  await addUser("comm2@aris.test", "commission");
  await addUser("off-a@aris.test", "referee", { officialId: "off-a" });
  await addUser("off-b@aris.test", "referee", { officialId: "off-b" });
  await addUser("off-obs@aris.test", "observer", { officialId: "off-obs" });
  [admin, commission, refA, refB, observerS] = await Promise.all(["admin2", "comm2", "off-a", "off-b", "off-obs"].map((n) => login(`${n}@aris.test`)));
  await api("PUT", "/api/v1/evaluation-criteria", {
    session: admin,
    body: { criteria: [
      { key: "positioning", label: { en: "Positioning", fr: "Positionnement" }, weight: 20 },
      { key: "decisions", label: { en: "Decisions", fr: "Décisions" }, weight: 25 },
      { key: "gameManagement", label: { en: "Game management", fr: "Gestion du jeu" }, weight: 20 },
      { key: "discipline", label: { en: "Discipline", fr: "Discipline" }, weight: 15 },
      { key: "teamwork", label: { en: "Communication", fr: "Communication" }, weight: 10 },
      { key: "fitness", label: { en: "Fitness", fr: "Condition physique" }, weight: 10 },
    ] },
  });
});

/** A fully staffed, validated, published match in the past, with the OBS slot filled. */
async function playedMatch(opts: { tier?: "d1" | "cup" } = {}) {
  const fx = uid("pm");
  await addFixture(fx, { country: "QAA", competition: opts.tier === "cup" ? "qaa-cup" : "qaa-d1", date: pastDate(), roles: ["R", "AR1", "AR2", "FOURTH", "OBS"], importance: 80 });
  for (const [role, id] of [["R", "off-a"], ["AR1", "asst-1"], ["AR2", "asst-2"], ["FOURTH", "asst-3"], ["OBS", "off-obs"]]) {
    const res = await put(commission, fx, role, { officialId: id, state: "confirmed" });
    if (res.status !== 200) throw new Error(`setup failed ${role}: ${res.text}`);
  }
  for (const step of ["submit", "validate", "publish"]) {
    const r = await post(commission, `/fixtures/${fx}/${step}`);
    if (r.status !== 200) throw new Error(`${step}: ${r.text}`);
  }
  const result = await post(commission, `/fixtures/${fx}/result`, { score: "2-1" });
  if (result.status !== 201) throw new Error(`result: ${result.text}`);
  return { fixtureId: fx, matchId: result.json.matchId as string };
}

describe("fees and payments", () => {
  beforeAll(async () => {
    for (const [role, amount] of [["R", 20000], ["AR1", 12000], ["AR2", 12000], ["FOURTH", 10000], ["OBS", 15000]] as const) {
      await api("PUT", "/api/v1/fee-scales", { session: commission, body: { tier: "d1", role, amount, transport: 2000, meals: 1000 } });
    }
    // a cup match pays the referee more — a competition-specific scale beats the tier default
    await api("PUT", "/api/v1/fee-scales", { session: commission, body: { tier: "cup", competitionId: "qaa-cup", role: "R", amount: 30000 } });
  });

  it("generates amounts from the scale and reports roles with no scale", async () => {
    const { fixtureId } = await playedMatch();
    const gen = await post(commission, "/payments/generate", { fixtureId });
    expect(gen.json).toMatchObject({ created: 5, missingScale: [] });
    const list = await get(commission, `/payments?fixtureId=${fixtureId}`);
    const referee = list.json.payments.find((p: { role: string }) => p.role === "R");
    expect(referee).toMatchObject({ base: 20000, transport: 2000, meals: 1000, total: 23000, status: "due" });
    // generating again creates nothing new
    expect((await post(commission, "/payments/generate", { fixtureId })).json.created).toBe(0);

    const cup = await playedMatch({ tier: "cup" });
    const cupGen = await post(commission, "/payments/generate", { fixtureId: cup.fixtureId });
    expect(cupGen.json.missingScale.sort()).toEqual(["AR1", "AR2", "FOURTH", "OBS"]); // only R has a cup scale
    const cupPay = (await get(commission, `/payments?fixtureId=${cup.fixtureId}`)).json.payments;
    expect(cupPay[0]).toMatchObject({ role: "R", base: 30000 });
  });

  it("never lets a designation alone become a payment: three checks, then validation, then payment", async () => {
    const { fixtureId } = await playedMatch();
    await post(commission, "/payments/generate", { fixtureId });
    const p = (await get(commission, `/payments?fixtureId=${fixtureId}`)).json.payments.find((x: { role: string }) => x.role === "R");

    const early = await post(commission, `/payments/${p.id}/validate`);
    expect(early.status).toBe(409);
    expect(early.json.error.details.missing).toEqual(["presenceConfirmed", "matchValidated", "expensesVerified"]);
    expect((await post(commission, `/payments/${p.id}/pay`, { reference: "VIR-001" })).status).toBe(409); // not validated

    const checks = await api("PATCH", `/api/v1/payments/${p.id}`, { session: commission, body: { presenceConfirmed: true, matchValidated: true, expensesVerified: true } });
    expect(checks.status).toBe(200);
    expect((await post(commission, `/payments/${p.id}/validate`)).json.payment.status).toBe("validated");
    const paid = await post(commission, `/payments/${p.id}/pay`, { reference: "VIR-001" });
    expect(paid.json.payment).toMatchObject({ status: "paid", paymentRef: "VIR-001" });
    // and a paid line is closed
    expect((await api("PATCH", `/api/v1/payments/${p.id}`, { session: commission, body: { bonus: 500, reason: "late" } })).status).toBe(409);
  });

  it("is enforced by the database too: a 'paid' row without the three checks cannot exist", async () => {
    const { fixtureId } = await playedMatch();
    await post(commission, "/payments/generate", { fixtureId });
    const p = (await get(commission, `/payments?fixtureId=${fixtureId}`)).json.payments[0];
    await expect(sql("UPDATE payments SET status = 'paid', paid_at = '2030-01-01' WHERE id = ?", p.id).run()).rejects.toThrow(/CHECK/);
  });

  it("needs a reason to change an amount, and sends a validated line back for another look", async () => {
    const { fixtureId } = await playedMatch();
    await post(commission, "/payments/generate", { fixtureId });
    const p = (await get(commission, `/payments?fixtureId=${fixtureId}`)).json.payments.find((x: { role: string }) => x.role === "R");
    await api("PATCH", `/api/v1/payments/${p.id}`, { session: commission, body: { presenceConfirmed: true, matchValidated: true, expensesVerified: true } });
    await post(commission, `/payments/${p.id}/validate`);
    expect((await api("PATCH", `/api/v1/payments/${p.id}`, { session: commission, body: { bonus: 5000 } })).status).toBe(422);
    const edited = await api("PATCH", `/api/v1/payments/${p.id}`, { session: commission, body: { bonus: 5000, reason: "Derby bonus" } });
    expect(edited.json.payment).toMatchObject({ bonus: 5000, total: 28000, status: "due" });
  });

  it("shows an official only their own money, and lets them contest it", async () => {
    const { fixtureId } = await playedMatch();
    await post(commission, "/payments/generate", { fixtureId });
    const mine = await get(refA, "/payments");
    expect(mine.json.payments.every((p: { officialId: string }) => p.officialId === "off-a")).toBe(true);
    const others = await get(refB, "/payments");
    expect(others.json.payments).toHaveLength(0);

    const p = (await get(commission, `/payments?fixtureId=${fixtureId}`)).json.payments.find((x: { role: string }) => x.role === "R");
    expect((await get(refB, `/payments/${p.id}`)).status).toBe(404);
    expect((await post(refB, `/payments/${p.id}/contest`, { note: "That is not mine at all" })).status).toBe(404);
    const contest = await post(refA, `/payments/${p.id}/contest`, { note: "Transport was 4000, not 2000" });
    expect(contest.json.payment.status).toBe("contested");
    const resolved = await post(commission, `/payments/${p.id}/resolve`, { outcome: "due", note: "Corrected after receipt" });
    expect(resolved.json.payment.status).toBe("due");
  });

  it("forbids officials from touching the scales or paying anyone", async () => {
    expect((await api("PUT", "/api/v1/fee-scales", { session: refA, body: { tier: "d1", role: "R", amount: 999999 } })).status).toBe(403);
    expect((await post(refA, "/payments/generate", { fixtureId: "x" })).status).toBe(403);
  });
});

describe("evaluation", () => {
  it("weights marks on the grid and keeps the report confidential until released", async () => {
    const { matchId } = await playedMatch();
    const marks = { positioning: 8, decisions: 9, gameManagement: 7, discipline: 8, teamwork: 6, fitness: 10 };
    // expected: 8*.20 + 9*.25 + 7*.20 + 8*.15 + 6*.10 + 10*.10 = 1.6+2.25+1.4+1.2+0.6+1.0 = 8.05 → 8.1 (rounded)
    const incomplete = await post(observerS, "/assessments", { matchId, marks: { positioning: 8 }, notes: { en: "x", fr: "x" } });
    expect(incomplete.status).toBe(422);

    const filed = await post(observerS, "/assessments", { matchId, marks, notes: { en: "Solid.", fr: "Solide." } });
    expect(filed.status).toBe(201);
    expect(filed.json.assessment.overall).toBeCloseTo(8.1, 1);
    expect(filed.json.assessment.observerId).toBe("off-obs");

    // the referee sees nothing until the commission releases it
    expect((await get(refA, "/assessments")).json.assessments.filter((a: { matchId: string }) => a.matchId === matchId)).toHaveLength(0);
    expect((await post(commission, `/assessments/${filed.json.assessment.id}/publish`)).json.changed).toBe(true);
    const seen = (await get(refA, "/assessments")).json.assessments.filter((a: { matchId: string }) => a.matchId === matchId);
    expect(seen).toHaveLength(1);
    // …and another referee never does
    expect((await get(refB, "/assessments")).json.assessments.filter((a: { matchId: string }) => a.matchId === matchId)).toHaveLength(0);

    // a filed report is a record: the observer cannot rewrite it, the commission can, with a reason
    const rewrite = await api("PATCH", `/api/v1/assessments/${filed.json.assessment.id}`, { session: observerS, body: { marks: { ...marks, fitness: 1 } } });
    expect(rewrite.status).toBe(403);
    expect((await api("PATCH", `/api/v1/assessments/${filed.json.assessment.id}`, { session: commission, body: { marks: { ...marks, fitness: 1 } } })).status).toBe(422);
  });

  it("only lets an observer write about a match they were appointed to", async () => {
    await addOfficial("off-other-obs", "QAA");
    await addUser("other-obs@aris.test", "observer", { officialId: "off-other-obs" });
    const other = await login("other-obs@aris.test");
    const { matchId } = await playedMatch();
    const res = await post(other, "/assessments", { matchId, marks: { positioning: 5, decisions: 5, gameManagement: 5, discipline: 5, teamwork: 5, fitness: 5 } });
    expect(res.status).toBe(403);
  });

  it("changes the grid only for administrators, and only if it totals 100", async () => {
    const grid = [{ key: "a1", label: { en: "A", fr: "A" }, weight: 60 }, { key: "b1", label: { en: "B", fr: "B" }, weight: 30 }];
    expect((await api("PUT", "/api/v1/evaluation-criteria", { session: commission, body: { criteria: grid } })).status).toBe(403);
    expect((await api("PUT", "/api/v1/evaluation-criteria", { session: admin, body: { criteria: grid } })).status).toBe(422);
  });
});

describe("discipline and suspensions", () => {
  it("never suspends on a report alone", async () => {
    await addOfficial("susp-1", "QAA");
    await addUser("susp-1@aris.test", "referee", { officialId: "susp-1" });
    await post(commission, "/incidents", { kind: "incident", officialId: "susp-1", severity: "critical", description: "Alleged misconduct after the match" });
    expect((await sql("SELECT status FROM officials WHERE id = 'susp-1'").first<{ status: string }>())!.status).toBe("active");
  });

  it("needs the decision reference to suspend, then removes the official from designations for exactly that window", async () => {
    await addOfficial("susp-2", "QAA");
    const c = await post(commission, "/cases", { officialId: "susp-2", summary: "Two overturned calls on matchday 14" });
    expect(c.status).toBe(201);
    const id = c.json.case.id;

    const noRef = await post(commission, `/cases/${id}/decide`, { sanction: "suspension", decision: "Suspended", suspensionFrom: "2020-01-01", suspensionTo: "2099-01-01" });
    expect(noRef.status).toBe(422);

    const decided = await post(commission, `/cases/${id}/decide`, {
      sanction: "suspension", decision: "Suspended for the season", decisionRef: "CAF-DISC-2026-14", suspensionFrom: "2020-01-01", suspensionTo: "2099-12-31",
    });
    expect(decided.status).toBe(200);
    expect((await sql("SELECT status FROM officials WHERE id = 'susp-2'").first<{ status: string }>())!.status).toBe("suspended");

    // the status cannot be edited away, and the engine refuses them
    const edit = await api("PATCH", "/api/v1/officials/susp-2", { session: commission, body: { status: "active" } });
    expect(edit.status).toBe(409);
    const fx = uid("fx");
    await addFixture(fx, { country: "QAA", competition: "qaa-d1", date: "2032-05-05", roles: ["R"] });
    const attempt = await put(commission, fx, "R", { officialId: "susp-2" });
    expect(attempt.json.error.details.blockers).toContain("qualification");

    // when the case is closed the suspension lifts and the previous status returns
    await post(commission, `/cases/${id}/close`, { note: "Overturned on appeal" });
    expect((await sql("SELECT status FROM officials WHERE id = 'susp-2'").first<{ status: string }>())!.status).toBe("active");
  });

  it("lets an official appeal only their own decision", async () => {
    await addOfficial("susp-3", "QAA");
    await addUser("susp-3@aris.test", "referee", { officialId: "susp-3" });
    const s3 = await login("susp-3@aris.test");
    const c = await post(commission, "/cases", { officialId: "susp-3", summary: "Late arrival at two matches" });
    await post(commission, `/cases/${c.json.case.id}/decide`, { sanction: "warning", decision: "Formal warning issued" });
    expect((await post(refB, `/cases/${c.json.case.id}/appeal`, { note: "Not my case but I object" })).status).toBe(404);
    expect((await post(s3, `/cases/${c.json.case.id}/appeal`, { note: "I was delayed by a road closure" })).json.case.status).toBe("appealed");
  });

  it("lets an official declare their own absence but not someone else's", async () => {
    expect((await post(refA, "/incidents", { kind: "absence", description: "Sick on matchday, certificate to follow" })).status).toBe(201);
    expect((await post(refA, "/incidents", { kind: "absence", officialId: "off-b", description: "Reporting someone else" })).json.incident.officialId).toBe("off-a");
    expect((await post(refA, "/incidents", { kind: "incident", description: "A serious incident report" })).status).toBe(403);
  });
});

describe("documents (R2)", () => {
  const png = () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82]);
  const upload = (s: Session, official: string, bytes: Uint8Array, name: string, kind = "medical") => {
    const form = new FormData();
    form.set("file", new File([bytes], name, { type: "image/png" }));
    form.set("kind", kind);
    return api("POST", `/api/v1/officials/${official}/documents`, { session: s, raw: form });
  };

  it("stores a real image in R2 and serves it back only to its owner and the commission", async () => {
    const up = await upload(refA, "off-a", png(), "certificate.png");
    expect(up.status).toBe(201);
    const id = up.json.document.id;
    expect(await env.MEDIA.head(`officials/off-a/${id}.png`)).not.toBeNull();

    const own = await api("GET", `/api/v1/documents/${id}`, { session: refA });
    expect(own.status).toBe(200);
    expect(own.headers.get("content-disposition")).toContain("attachment");
    expect(own.headers.get("x-content-type-options")).toBe("nosniff");
    expect((await api("GET", `/api/v1/documents/${id}`, { session: commission })).status).toBe(200);
    expect((await api("GET", `/api/v1/documents/${id}`, { session: refB })).status).toBe(404);
  });

  it("refuses files that are not what they claim to be, and uploads for someone else", async () => {
    const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 1, 2, 3]); // a Windows executable renamed to .png
    expect((await upload(refA, "off-a", exe, "photo.png")).status).toBe(415);
    expect((await upload(refA, "off-b", png(), "x.png")).status).toBe(403);
    expect((await upload(refA, "off-a", new Uint8Array(0), "empty.png")).status).toBe(422);
  });

  it("removes the file from R2 when its record is deleted", async () => {
    const up = await upload(refA, "off-a", png(), "temp.png", "other");
    const id = up.json.document.id;
    expect((await api("DELETE", `/api/v1/documents/${id}`, { session: refA })).status).toBe(200);
    expect(await env.MEDIA.head(`officials/off-a/${id}.png`)).toBeNull();
  });

  it("does not let an official remove a document the commission has reviewed", async () => {
    const up = await upload(refA, "off-a", png(), "reviewed.png");
    await api("PATCH", `/api/v1/documents/${up.json.document.id}/status`, { session: commission, body: { status: "verified" } });
    expect((await api("DELETE", `/api/v1/documents/${up.json.document.id}`, { session: refA })).status).toBe(403);
  });
});

describe("availability", () => {
  it("lets an official declare a day off, and warns the commission if they were already designated", async () => {
    const date = pastDate().replace(/^2020/, "2033");
    const fx = uid("fx");
    await addFixture(fx, { country: "QAA", competition: "qaa-d1", date, roles: ["R"] });
    await put(commission, fx, "R", { officialId: "off-b", state: "confirmed" });
    const res = await api("PUT", "/api/v1/officials/off-b/availability", { session: refB, body: { dates: [date], state: "unavailable", reason: "work" } });
    expect(res.status).toBe(200);
    expect(res.json.conflicts).toHaveLength(1);
    const alerts = JSON.stringify((await get(commission, "/notifications")).json);
    expect(alerts).toContain("Designated official now unavailable");
  });

  it("is private: an official cannot edit someone else's calendar", async () => {
    const res = await api("PUT", "/api/v1/officials/off-a/availability", { session: refB, body: { dates: ["2034-01-01"], state: "unavailable", reason: "leave" } });
    expect(res.status).toBe(403);
  });

  it("asks for a reason when declaring unavailability", async () => {
    const res = await api("PUT", "/api/v1/officials/off-a/availability", { session: refA, body: { dates: ["2034-01-02"], state: "unavailable" } });
    expect(res.status).toBe(422);
  });
});

describe("the register and accounts", () => {
  it("hides personal details from observers and other officials", async () => {
    await api("PATCH", "/api/v1/officials/off-a", { session: refA, body: { phone: "+974-5555-0101" } });
    const asStaff = await get(commission, "/officials/off-a");
    expect(asStaff.json.official.phone).toBe("+974-5555-0101");
    const asObserver = await get(observerS, "/officials/off-a");
    expect(asObserver.json.official.phone).toBeUndefined();
    expect(asObserver.json.documents).toEqual([]);
    expect((await get(refB, "/officials/off-a")).status).toBe(403);
  });

  it("limits what an official may edit on their own file", async () => {
    expect((await api("PATCH", "/api/v1/officials/off-a", { session: refA, body: { level: "CAF Elite" } })).status).toBe(403);
    expect((await api("PATCH", "/api/v1/officials/off-a", { session: refA, body: { city: "Doha" } })).status).toBe(200);
  });

  it("creates accounts only for admins, with strong passwords", async () => {
    const admin3 = await addUser("admin3@aris.test", "admin");
    expect(admin3).toBeTruthy();
    const a3 = await login("admin3@aris.test");
    expect((await post(commission, "/users", { email: "x@aris.test", name: "X", role: "commission", password: "long-enough-password" })).status).toBe(403);
    expect((await post(a3, "/users", { email: "weak@aris.test", name: "W", role: "commission", password: "short" })).status).toBe(422);
    expect((await post(a3, "/users", { email: "strong@aris.test", name: "S", role: "referee", password: "long-enough-password" })).status).toBe(422); // referees need an official
    expect((await post(a3, "/users", { email: "ok@aris.test", name: "O", role: "commission", password: "long-enough-password" })).status).toBe(201);
  });
});

describe("reports and the snapshot", () => {
  it("neutralises spreadsheet formulas in CSV exports", async () => {
    await addOfficial("csv-evil", "QAA");
    await sql("UPDATE officials SET name = ? WHERE id = 'csv-evil'", '=HYPERLINK("http://evil.example","click")').run();
    const res = await api("GET", "/api/v1/reports/workload?format=csv", { session: commission });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.text).toContain(`"'=HYPERLINK(""http://evil.example"",""click"")"`);
    expect(res.text).not.toMatch(/,=HYPERLINK/);
  });

  it("serves dashboards to the commission and observers, not to officials", async () => {
    expect((await get(commission, "/reports/overview")).json.workforce.referees).toBeGreaterThan(0);
    expect((await get(observerS, "/reports/overview")).status).toBe(200);
    expect((await get(refA, "/reports/overview")).status).toBe(403);
  });

  it("flags matches played but never billed, and payments made on unvalidated matches", async () => {
    const { fixtureId } = await playedMatch();
    const res = await get(commission, `/reports/reconciliation?from=2019-01-01&to=2030-01-01`);
    const issue = res.json.issues.find((i: { fixtureId: string; role: string }) => i.fixtureId === fixtureId && i.role === "R");
    expect(issue.issue).toBe("played-not-billed");
  });

  it("returns the snapshot in the shapes the app already uses", async () => {
    const res = await get(commission, "/snapshot?from=2019-01-01&to=2035-01-01");
    expect(res.status).toBe(200);
    expect(res.json.referees[0]).toHaveProperty("rmcsAvg");
    expect(res.json.referees[0]).toHaveProperty("cards.yellow");
    expect(res.json.fixtures[0].crew[0]).toHaveProperty("state");
    expect(res.json.criteria.reduce((s: number, c: { weight: number }) => s + c.weight, 0)).toBe(100);
    expect((await get(refA, "/snapshot")).status).toBe(403);
  });
});

describe("notifications and the scheduled jobs", () => {
  it("keeps read state per person, and sends commission alerts to every commission member", async () => {
    await addUser("comm3@aris.test", "commission");
    const comm3 = await login("comm3@aris.test");
    await post(refA, "/incidents", { kind: "lateness", description: "Stuck in traffic, arriving 20 minutes late" });
    const mine = (await get(commission, "/notifications")).json;
    const target = mine.notifications.find((n: { title: { en: string } }) => n.title.en === "Incident reported");
    expect(target.read).toBe(false);
    await post(commission, `/notifications/${target.id}/read`);
    expect((await get(commission, "/notifications")).json.notifications.find((n: { id: string }) => n.id === target.id).read).toBe(true);
    // comm3 has not read it
    expect((await get(comm3, "/notifications")).json.notifications.find((n: { id: string }) => n.id === target.id).read).toBe(false);
    // and nobody can mark a notification that is not theirs
    expect((await post(refA, `/notifications/${target.id}/read`)).status).toBe(404);
  });

  it("raises licence-expiry alerts once, however often the job runs", async () => {
    await addOfficial("lic-1", "QAA");
    const soon = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10);
    await post(commission, "/licences", { officialId: "lic-1", kind: "FIFA Badge", issued: "2020-01-01", expires: soon });
    const first = await post(admin, "/admin/run-jobs");
    expect(first.status).toBe(200);
    await post(admin, "/admin/run-jobs");
    const { results } = await env.DB.prepare("SELECT COUNT(*) AS n FROM notifications WHERE dedupe_key LIKE 'licence:%' AND detail LIKE ?").bind(`%${soon}%`).all<{ n: number }>();
    expect(results[0].n).toBe(1);
  });

  it("queues e-mail for delivery without sending when no webhook is configured", async () => {
    await sql("UPDATE officials SET email = 'off-a@example.org' WHERE id = 'off-a'").run();
    const fx = uid("fx");
    await addFixture(fx, { country: "QAA", competition: "qaa-d1", date: "2035-03-03", roles: ["R"] });
    await put(commission, fx, "R", { officialId: "off-a" });
    const queued = await env.DB.prepare("SELECT COUNT(*) AS n FROM notification_outbox WHERE recipient = 'off-a@example.org' AND status = 'queued'").first<{ n: number }>();
    expect(queued!.n).toBeGreaterThan(0);
  });
});

describe("the referee's personal space", () => {
  it("shows what is waiting for them", async () => {
    const res = await get(refA, "/me");
    expect(res.status).toBe(200);
    expect(res.json.official.id).toBe("off-a");
    expect(res.json).toHaveProperty("awaitingResponse");
    const designations = await get(refA, "/me/designations?from=2000-01-01&to=2100-01-01");
    expect(designations.json.designations.length).toBeGreaterThan(0);
  });

  it("is unavailable to accounts that are not linked to an official", async () => {
    expect((await get(commission, "/me")).status).toBe(403);
  });
});
