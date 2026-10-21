import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { addFixture, sql } from "../helpers";
import { get, makeWorld, official, post, type World } from "../helpers/evaluation";
import { syncSuspensions } from "../../src/routes/discipline";

let w: World;
beforeAll(async () => {
  w = await makeWorld("DSA", "DSB");
});

const newCase = async (officialId: string) => (await post(w.seatA, "/cases", { officialId, summary: "Two overturned calls on matchday 14" })).json.case.id as string;
const suspend = (id: string, extra: object = {}) =>
  post(w.seatA, `/cases/${id}/decide`, { sanction: "suspension", decision: "Suspended for the season", decisionRef: "FED-DISC-2026-14", suspensionFrom: "2020-01-01", suspensionTo: "2099-12-31", ...extra });

describe("suspensions", () => {
  it("needs the decision reference and both dates, and the dates in order", async () => {
    const id = await newCase("DSA-ref1");
    for (const missing of ["decisionRef", "suspensionFrom", "suspensionTo"]) {
      const res = await suspend(id, { [missing]: undefined });
      expect(res.status).toBe(422);
    }
    expect((await suspend(id, { suspensionFrom: "2030-02-01", suspensionTo: "2030-01-01" })).status).toBe(422);
    expect((await sql("SELECT status FROM officials WHERE id = 'DSA-ref1'").first<{ status: string }>())!.status).toBe("active");
  });

  it("is enforced by the database as well: no suspension without a reference or dates", async () => {
    const id = await newCase("DSA-ref1");
    await expect(sql("UPDATE disciplinary_cases SET status = 'decided', sanction = 'suspension' WHERE id = ?", id).run()).rejects.toThrow(/CHECK/);
  });

  it("suspends from the decision when the window has started, remembers the status, and lists the matches to replace", async () => {
    await sql("UPDATE officials SET status = 'elite-pool' WHERE id = 'DSA-ref2'").run();
    await addFixture("fx-ds-1", { country: "DSA", competition: "DSA-d1", date: "2032-05-05", roles: ["R"] });
    await sql("UPDATE designations SET official_id = 'DSA-ref2', state = 'confirmed' WHERE fixture_id = 'fx-ds-1'").run();
    const id = await newCase("DSA-ref2");
    const res = await suspend(id);
    expect(res.status).toBe(200);
    expect(res.json.case).toMatchObject({ status: "decided", sanction: "suspension", decisionRef: "FED-DISC-2026-14" });
    expect(res.json.statusChanges).toEqual([{ officialId: "DSA-ref2", to: "suspended" }]);
    expect(res.json.affectedDesignations).toEqual([{ fixtureId: "fx-ds-1", date: "2032-05-05", home: "Home FC", away: "Away FC", role: "R" }]);
    expect(await official("DSA-ref2")).toMatchObject({ status: "suspended", status_before_suspension: "elite-pool" });
    const alert = (await get(w.seatA, "/notifications")).json.notifications.find((n: { title: { en: string } }) => n.title.en === "Replace a suspended official");
    expect(alert.title.fr).toBe("Remplacer un officiel suspendu");
    const audit = await sql("SELECT country_code FROM audit_log WHERE action = 'official.suspended' AND entity_id = 'DSA-ref2'").first<{ country_code: string }>();
    expect(audit!.country_code).toBe("DSA");

    // closing the case lifts it and puts the previous status back
    await post(w.seatA, `/cases/${id}/close`, { note: "Overturned on appeal" });
    expect(await official("DSA-ref2")).toMatchObject({ status: "elite-pool", status_before_suspension: null });
  });

  it("waits for a future window, then the daily job suspends and later reinstates", async () => {
    const id = await newCase("DSA-as1");
    const future = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    const later = new Date(Date.now() + 9 * 86_400_000).toISOString().slice(0, 10);
    await suspend(id, { suspensionFrom: future, suspensionTo: later });
    expect((await official("DSA-as1")).status).toBe("active");
    // the window opens: pull it to today and run the job
    await sql("UPDATE disciplinary_cases SET suspension_from = date('now') WHERE id = ?", id).run();
    expect((await syncSuspensions(env.DB)).map((c) => c.officialId)).toContain("DSA-as1");
    expect((await official("DSA-as1")).status).toBe("suspended");
    expect((await syncSuspensions(env.DB)).map((c) => c.officialId)).not.toContain("DSA-as1"); // idempotent
    // the window ends: push it into the past
    await sql("UPDATE disciplinary_cases SET suspension_from = '2020-01-01', suspension_to = '2020-02-01' WHERE id = ?", id).run();
    expect((await syncSuspensions(env.DB)).map((c) => c.officialId)).toContain("DSA-as1");
    expect(await official("DSA-as1")).toMatchObject({ status: "active", status_before_suspension: null });
    const back = (await sql("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'official.reinstated' AND entity_id = 'DSA-as1'").first<{ n: number }>())!.n;
    expect(back).toBe(1);
  });

  it("retires an official removed from the list", async () => {
    const id = await newCase("DSA-as2");
    const res = await post(w.seatA, `/cases/${id}/decide`, { sanction: "removal", decision: "Removed from the list" });
    expect(res.status).toBe(200);
    expect((await official("DSA-as2")).status).toBe("retired");
  });

  it("leaves another country's officials untouched when it refuses", async () => {
    const id = await newCase("DSA-as3");
    expect((await post(w.seatB, `/cases/${id}/decide`, { sanction: "removal", decision: "Meddling removal" })).status).toBe(404);
    expect((await official("DSA-as3")).status).toBe("active");
  });
});
