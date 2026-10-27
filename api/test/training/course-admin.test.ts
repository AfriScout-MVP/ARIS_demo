import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "../helpers";
import { del, get, makeWorld, patch, post, type World } from "../helpers/evaluation";

let w: World;
beforeAll(async () => {
  w = await makeWorld("TMA", "TMB");
});

const name = { fr: "Arbitrage vidéo", en: "Video refereeing" };
const make = async (s: Parameters<typeof post>[0], extra: object = {}) => (await post(s, "/courses", { name, provider: "CAF Academy", hours: 20, ...extra })).json.id as string;
const course = (id: string) => sql("SELECT * FROM courses WHERE id = ?", id).first<Record<string, any>>();
const enrolment = (c: string, o: string) => sql("SELECT * FROM course_enrolments WHERE course_id = ? AND official_id = ?", c, o).first<Record<string, any>>();

describe("course management", () => {
  it("creates a course with dates and reads it back by id", async () => {
    const id = await make(w.seatA, { startsOn: "2027-01-10", endsOn: "2027-01-20", openEnrolment: true });
    const res = await get(w.seatA, `/courses/${id}`);
    expect(res.status).toBe(200);
    expect(res.json.course).toMatchObject({ id, startsOn: "2027-01-10", endsOn: "2027-01-20", openEnrolment: true, closed: false, enrolments: [], name });
    expect((await post(w.seatA, "/courses", { name, provider: "X Academy", hours: 2, startsOn: "2027-02-10", endsOn: "2027-02-01" })).status).toBe(422);
  });

  it("is edited by its owner: a federation its own, the administrator the platform-wide ones", async () => {
    const own = await make(w.seatA);
    expect((await patch(w.seatA, `/courses/${own}`, { hours: 30, endsOn: "2027-06-30", openEnrolment: true })).status).toBe(200);
    expect(await course(own)).toMatchObject({ hours: 30, ends_on: "2027-06-30", open_enrolment: 1 });
    expect((await patch(w.seatA, `/courses/${own}`, { startsOn: "2027-07-01" })).status).toBe(422);
    expect((await patch(w.seatA, `/courses/${own}`, { hours: 0 })).status).toBe(422);
    const platform = await make(w.admin);
    expect((await patch(w.seatA, `/courses/${platform}`, { hours: 5 })).status).toBe(403);
    expect((await patch(w.admin, `/courses/${platform}`, { hours: 5 })).status).toBe(200);
    // another federation's course does not exist for it
    expect((await patch(w.seatB, `/courses/${own}`, { hours: 1 })).status).toBe(404);
    expect((await get(w.seatB, `/courses/${own}`)).status).toBe(404);
    expect((await get(w.refB1, `/courses/${own}`)).status).toBe(404);
    expect((await course(own))!.hours).toBe(30);
    expect((await patch(w.refA1, `/courses/${own}`, { hours: 1 })).status).toBe(403);
    expect((await patch(null, `/courses/${own}`, { hours: 1 })).status).toBe(401);
    expect((await sql("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'course.update' AND entity_id = ?", own).first<{ n: number }>())!.n).toBe(1);
  });

  it("deletes an unused course, and closes one with enrolments", async () => {
    const empty = await make(w.seatA);
    expect((await del(w.seatB, `/courses/${empty}`)).status).toBe(404);
    expect((await del(w.refA1, `/courses/${empty}`)).status).toBe(403);
    expect((await del(w.seatA, `/courses/${empty}`)).json).toMatchObject({ deleted: true, closed: false });
    expect(await course(empty)).toBeNull();
    const used = await make(w.seatA, { openEnrolment: true });
    await post(w.seatA, `/courses/${used}/enrol`, { officialIds: ["TMA-ref1"] });
    expect((await del(w.seatA, `/courses/${used}`)).json).toMatchObject({ deleted: false, closed: true });
    expect(await course(used)).toMatchObject({ open_enrolment: 0 });
    expect((await course(used))!.closed_at).not.toBeNull();
    expect(await enrolment(used, "TMA-ref1")).not.toBeNull();
    expect((await post(w.seatA, `/courses/${used}/enrol`, { officialIds: ["TMA-ref2"] })).json.error.code).toBe("course_closed");
    expect((await get(w.seatA, `/courses/${used}`)).json.course.closed).toBe(true);
  });

  it("records each official's result and exam score, and unenrols those still in progress", async () => {
    const exam = await make(w.seatA, { kind: "exam" });
    await post(w.seatA, `/courses/${exam}/enrol`, { officialIds: ["TMA-ref1", "TMA-ref2", "TMA-obs"] });
    expect((await patch(w.seatA, `/courses/${exam}/enrolments/TMA-ref1`, { state: "completed", examScore: 87.5 })).json).toMatchObject({ state: "completed", examScore: 87.5 });
    expect(await enrolment(exam, "TMA-ref1")).toMatchObject({ state: "completed", exam_score: 87.5 });
    expect((await enrolment(exam, "TMA-ref1"))!.completed_at).not.toBeNull();
    expect((await patch(w.seatA, `/courses/${exam}/enrolments/TMA-ref2`, { state: "failed", examScore: 41 })).status).toBe(200);
    expect((await patch(w.seatA, `/courses/${exam}/enrolments/TMA-ref2`, { examScore: 120 })).status).toBe(422);
    expect((await patch(w.seatA, `/courses/${exam}/enrolments/TMA-ref2`, {})).status).toBe(422);
    expect((await patch(w.seatA, `/courses/${exam}/enrolments/TMA-as1`, { state: "completed" })).status).toBe(404);
    expect((await patch(w.seatB, `/courses/${exam}/enrolments/TMA-ref2`, { state: "completed" })).status).toBe(404);
    expect((await patch(w.refA1, `/courses/${exam}/enrolments/TMA-ref1`, { examScore: 100 })).status).toBe(403);
    // a finished result stays; the one still in progress is taken off
    const off = await post(w.seatA, `/courses/${exam}/unenrol`, { officialIds: ["TMA-ref1", "TMA-obs"] });
    expect(off.json).toMatchObject({ removed: 1, kept: 1 });
    expect(await enrolment(exam, "TMA-obs")).toBeNull();
    expect(await enrolment(exam, "TMA-ref1")).not.toBeNull();
    expect((await post(w.seatA, `/courses/${exam}/unenrol`, { officialIds: ["TMB-ref1"] })).status).toBe(404);
    // nobody left in progress: the course reads as completed for older clients
    expect((await course(exam))!.state).toBe("completed");
    const listed = (await get(w.seatA, "/courses")).json.courses.find((c: { id: string }) => c.id === exam);
    expect(listed.enrolments.map((e: { officialId: string; state: string; examScore: number }) => [e.officialId, e.state, e.examScore])).toEqual(
      expect.arrayContaining([["TMA-ref1", "completed", 87.5], ["TMA-ref2", "failed", 41]]),
    );
  });
});
