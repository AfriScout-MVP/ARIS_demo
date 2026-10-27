import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { runDaily } from "../../src/cron";
import { sql } from "../helpers";
import { call, create, makePipelineWorld, move, prospectCountry } from "./support";

describe("partnership follow-up reminders", async () => {
  const w = await makePipelineWorld("PR");

  it("reminds the owner once a day of an overdue next step, and leaves closed or future ones alone", async () => {
    for (const c of ["PRB", "PRC", "PRD"]) await prospectCountry(c);
    const late = (await create(w.admin, { country: "PRB", nextStep: "Send the draft agreement", nextStepDue: "2026-01-05" })).json.partnership;
    await create(w.admin, { country: "PRC", nextStep: "Visit", nextStepDue: "2999-01-01" });
    const gone = (await create(w.admin, { country: "PRD", nextStep: "Call", nextStepDue: "2026-01-05" })).json.partnership;
    await move(w.admin, gone.id, { stage: "declined", reason: "Not interested" });

    const first = await runDaily(env);
    await runDaily(env);
    expect(first.partnerships).toBe(1);
    const { results } = await sql("SELECT user_id, audience_role, href FROM notifications WHERE dedupe_key LIKE 'partnership-due:%'").all();
    expect(results).toEqual([{ user_id: w.admin.user.id, audience_role: null, href: "/admin/partnerships" }]);

    // without an active owner, every administrator is told
    await call("PATCH", `/${late.id}`, w.admin, { ownerId: null });
    await sql("DELETE FROM notifications WHERE dedupe_key LIKE 'partnership-due:%'").run();
    await runDaily(env);
    expect(await sql("SELECT user_id, audience_role FROM notifications WHERE dedupe_key LIKE 'partnership-due:%'").all().then((r) => r.results)).toEqual([{ user_id: null, audience_role: "admin" }]);
  });
});
