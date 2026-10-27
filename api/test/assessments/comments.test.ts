import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "../helpers";
import { addPlayedMatch, get, makeWorld, post, type World } from "../helpers/evaluation";

let w: World;
let released: string;
let hidden: string;
beforeAll(async () => {
  w = await makeWorld("ACA", "ACB");
  const insert = async (matchId: string, published: number) => {
    const id = `asm-${matchId}`;
    await sql(
      "INSERT INTO assessments (id, match_id, referee_id, observer_id, state, filed_at, published, overall, marks, notes) VALUES (?, ?, 'ACA-ref1', 'ACA-obs', 'filed', '2026-01-01T00:00:00Z', ?, 7.4, '{}', '{\"fr\":\"\",\"en\":\"\"}')",
      id, matchId, published,
    ).run();
    return id;
  };
  released = await insert((await addPlayedMatch({ country: "ACA", competition: "ACA-d1", referee: "ACA-ref1" })).matchId, 1);
  hidden = await insert((await addPlayedMatch({ country: "ACA", competition: "ACA-d1", referee: "ACA-ref1" })).matchId, 0);
});

const notices = async (s: Parameters<typeof get>[0]) => JSON.stringify((await get(s, "/notifications")).json);

describe("comments on an assessment", () => {
  it("lets the assessed referee comment and contest a released report, and tells the federation", async () => {
    expect((await post(w.refA1, `/assessments/${released}/comments`, { body: "Thank you for the feedback." })).status).toBe(201);
    const contest = await post(w.refA1, `/assessments/${released}/comments`, { kind: "contest", body: "The offside at 63' was correctly flagged by AR1." });
    expect(contest.status).toBe(201);
    expect(contest.json.comment).toMatchObject({ kind: "contest", authorRole: "referee" });
    const thread = await get(w.refA1, `/assessments/${released}/comments`);
    expect(thread.json.comments.map((k: { kind: string }) => k.kind)).toEqual(["comment", "contest"]);
    expect(thread.json.contest).toBe("open");
    expect(await notices(w.seatA)).toContain("Assessment contested");
    expect(await notices(w.seatB)).not.toContain("Assessment contested");
    expect((await sql("SELECT COUNT(*) AS n FROM audit_log WHERE action IN ('assessment.comment', 'assessment.contest') AND entity_id = ?", released).first<{ n: number }>())!.n).toBe(2);
  });

  it("puts it in the federation's inbox until it answers, and the answer reaches the referee", async () => {
    const inbox = await get(w.seatA, "/assessment-comments");
    expect(inbox.json.threads.map((t: { assessmentId: string }) => t.assessmentId)).toEqual([released]);
    expect(inbox.json.threads[0]).toMatchObject({ lastKind: "contest", contested: true, refereeId: "ACA-ref1" });
    expect((await get(w.seatB, "/assessment-comments")).json.threads).toEqual([]);
    expect((await get(w.refA1, "/assessment-comments")).status).toBe(403);
    // staff only answer
    expect((await post(w.seatA, `/assessments/${released}/comments`, { kind: "contest", body: "Nope" })).status).toBe(422);
    const reply = await post(w.seatA, `/assessments/${released}/comments`, { body: "The panel reviewed the clip and keeps the mark." });
    expect(reply.json.comment.kind).toBe("response");
    expect((await get(w.refA1, `/assessments/${released}/comments`)).json.contest).toBe("answered");
    expect(await notices(w.refA1)).toContain("Reply to your assessment comment");
    expect((await get(w.seatA, "/assessment-comments")).json.threads).toEqual([]);
    expect((await get(w.seatA, "/assessment-comments?status=all")).json.threads).toHaveLength(1);
    expect((await get(w.admin, `/assessments/${released}/comments`)).json.comments).toHaveLength(3);
  });

  it("is closed to everybody else", async () => {
    // not yet released to the referee: it does not exist for them
    expect((await post(w.refA1, `/assessments/${hidden}/comments`, { body: "Can I see it?" })).status).toBe(404);
    expect((await get(w.refA1, `/assessments/${hidden}/comments`)).status).toBe(404);
    // another referee, the observer who wrote it, another country
    expect((await get(w.refA2, `/assessments/${released}/comments`)).status).toBe(404);
    expect((await get(w.obsA, `/assessments/${released}/comments`)).status).toBe(404);
    expect((await get(w.seatB, `/assessments/${released}/comments`)).status).toBe(404);
    expect((await post(w.seatB, `/assessments/${released}/comments`, { body: "Cross-border reply" })).status).toBe(404);
    expect((await get(null, `/assessments/${released}/comments`)).status).toBe(401);
    expect((await post(w.refA1, `/assessments/${released}/comments`, { body: "x" })).status).toBe(422);
    expect((await post(w.refA1, `/assessments/${released}/comments`, { kind: "response", body: "I answer myself" })).status).toBe(422);
    expect((await get(w.refA1, "/assessments/nope/comments")).status).toBe(404);
    expect((await sql("SELECT COUNT(*) AS n FROM assessment_comments").first<{ n: number }>())!.n).toBe(3);
  });
});
