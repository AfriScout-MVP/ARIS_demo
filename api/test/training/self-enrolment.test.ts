import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "../helpers";
import { del, get, makeWorld, post, type World } from "../helpers/evaluation";

let w: World;
beforeAll(async () => {
  w = await makeWorld("TNA", "TNB");
});

const name = { fr: "Lois du jeu 2027", en: "Laws of the game 2027" };
const make = async (s: Parameters<typeof post>[0], extra: object = {}) => (await post(s, "/courses", { name, provider: "Academy", hours: 8, ...extra })).json.id as string;
const enrolled = (c: string, o: string) => sql("SELECT * FROM course_enrolments WHERE course_id = ? AND official_id = ?", c, o).first<Record<string, any>>();

describe("self-enrolment", () => {
  it("lets a referee join an open course of their federation or a platform-wide one, and leave it", async () => {
    const own = await make(w.seatA, { openEnrolment: true });
    const platform = await make(w.admin, { openEnrolment: true });
    const listed = (await get(w.refA1, "/courses")).json.courses.find((c: { id: string }) => c.id === own);
    expect(listed).toMatchObject({ canSelfEnrol: true, myEnrolment: null });
    expect((await post(w.refA1, `/courses/${own}/enrolment`)).status).toBe(201);
    expect((await post(w.refA1, `/courses/${own}/enrolment`)).json.enrolled).toBe(false);
    expect((await post(w.refB1, `/courses/${platform}/enrolment`)).status).toBe(201);
    expect(await enrolled(own, "TNA-ref1")).toMatchObject({ state: "enrolled", self_enrolled: 1 });
    const after = (await get(w.refA1, `/courses/${own}`)).json.course;
    expect(after).toMatchObject({ canSelfEnrol: false, myEnrolment: { officialId: "TNA-ref1", state: "enrolled", selfEnrolled: true } });
    // the federation sees its own official on the course
    expect((await get(w.seatA, `/courses/${own}`)).json.course.officialIds).toEqual(["TNA-ref1"]);
    expect((await del(w.refA1, `/courses/${own}/enrolment`)).status).toBe(200);
    expect(await enrolled(own, "TNA-ref1")).toBeNull();
    expect((await del(w.refA1, `/courses/${own}/enrolment`)).status).toBe(404);
    expect((await sql("SELECT COUNT(*) AS n FROM audit_log WHERE action IN ('course.self_enrol', 'course.self_unenrol') AND entity_id = ?", own).first<{ n: number }>())!.n).toBe(2);
  });

  it("refuses a course that is not open, closed, ended, or another federation's", async () => {
    const shut = await make(w.seatA);
    expect((await post(w.refA1, `/courses/${shut}/enrolment`)).json.error.code).toBe("enrolment_closed");
    const ended = await make(w.seatA, { openEnrolment: true, startsOn: "2020-01-01", endsOn: "2020-02-01" });
    expect((await post(w.refA1, `/courses/${ended}/enrolment`)).json.error.code).toBe("enrolment_closed");
    const closing = await make(w.seatA, { openEnrolment: true });
    await post(w.seatA, `/courses/${closing}/enrol`, { officialIds: ["TNA-ref2"] });
    await del(w.seatA, `/courses/${closing}`);
    expect((await post(w.refA1, `/courses/${closing}/enrolment`)).status).toBe(409);
    const foreign = await make(w.seatB, { openEnrolment: true });
    expect((await post(w.refA1, `/courses/${foreign}/enrolment`)).status).toBe(404);
    expect(await enrolled(foreign, "TNA-ref1")).toBeNull();
    expect((await post(null, `/courses/${foreign}/enrolment`)).status).toBe(401);
    // staff enrol others through /enrol; this is the referee's own door
    expect((await post(w.seatA, `/courses/${shut}/enrolment`)).status).toBe(403);
  });

  it("leaves a federation's enrolment and a finished course on the record", async () => {
    const mandatory = await make(w.seatA, { openEnrolment: true });
    await post(w.seatA, `/courses/${mandatory}/enrol`, { officialIds: ["TNA-ref2"] });
    expect((await del(w.refA2, `/courses/${mandatory}/enrolment`)).json.error.code).toBe("enrolled_by_federation");
    const done = await make(w.seatA, { openEnrolment: true });
    await post(w.refA2, `/courses/${done}/enrolment`);
    await post(w.seatA, `/courses/${done}/complete`, { officialIds: ["TNA-ref2"] });
    expect((await del(w.refA2, `/courses/${done}/enrolment`)).json.error.code).toBe("enrolment_finished");
    expect(await enrolled(done, "TNA-ref2")).not.toBeNull();
  });
});
