import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { ApiError, notFound, parseQuery, readJson, today, uuid } from "../lib/http";
import { auditStmt } from "../lib/audit";
import { currentUser, staff } from "../middleware/auth";
import { json } from "../domain/mappers";
import { addDays } from "../domain/engine-ctx";

export const licences = new Hono<AppEnv>();
export const courses = new Hono<AppEnv>();
export const fitness = new Hono<AppEnv>();

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const KINDS = ["FIFA Badge", "CAF Elite Panel", "National D1", "VAR Certification", "Fitness Clearance"] as const;

/* ------------------------------------------------------------------ *
 * Licences — categories, levels and expiry dates
 * ------------------------------------------------------------------ */

licences.get("/", staff, async (c) => {
  const q = parseQuery(c, z.object({ expiringWithin: z.coerce.number().int().min(0).max(730).optional(), officialId: z.string().optional(), country: z.string().length(3).optional() }));
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (q.expiringWithin !== undefined) (where.push("l.expires <= ?"), args.push(addDays(today(), q.expiringWithin)));
  if (q.officialId) (where.push("l.official_id = ?"), args.push(q.officialId));
  if (q.country) (where.push("o.country_code = ?"), args.push(q.country.toUpperCase()));
  const { results } = await c.env.DB.prepare(
    `SELECT l.id, l.official_id AS officialId, o.name AS officialName, o.country_code AS countryCode, l.kind, l.issued, l.expires
       FROM licences l JOIN officials o ON o.id = l.official_id ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY l.expires LIMIT 500`,
  )
    .bind(...args)
    .all<{ expires: string } & Record<string, unknown>>();
  const t = today();
  return c.json({ licences: results.map((l) => ({ ...l, state: l.expires < t ? "expired" : l.expires <= addDays(t, 90) ? "expiring" : "valid" })) });
});

const licenceSchema = z
  .object({ officialId: z.string(), kind: z.enum(KINDS), issued: dateSchema, expires: dateSchema })
  .refine((v) => v.expires >= v.issued, { message: "A licence cannot expire before it was issued", path: ["expires"] });

licences.post("/", staff, async (c) => {
  const user = currentUser(c);
  const b = await readJson(c, licenceSchema);
  const id = `lic-${uuid().slice(0, 10)}`;
  try {
    await c.env.DB.batch([
      c.env.DB.prepare("INSERT INTO licences (id, official_id, kind, issued, expires) VALUES (?, ?, ?, ?, ?)").bind(id, b.officialId, b.kind, b.issued, b.expires),
      // a valid VAR certification is what makes a referee selectable for VAR / AVAR
      ...(b.kind === "VAR Certification" && b.expires >= today() ? [c.env.DB.prepare("UPDATE officials SET var_qualified = 1 WHERE id = ?").bind(b.officialId)] : []),
      auditStmt(c.env.DB, user, { action: "licence.add", entity: "official", entityId: b.officialId, after: b, ip: c.get("ip") }),
    ]);
  } catch (err) {
    if (String(err).includes("FOREIGN KEY")) throw new ApiError(422, "unknown_official", "Unknown official");
    throw err;
  }
  return c.json({ id }, 201);
});

licences.patch("/:id", staff, async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const b = await readJson(c, z.object({ issued: dateSchema.optional(), expires: dateSchema.optional() }));
  const row = await c.env.DB.prepare("SELECT official_id AS officialId, kind, issued, expires FROM licences WHERE id = ?").bind(id).first<{ officialId: string; kind: string; issued: string; expires: string }>();
  if (!row) throw notFound("Licence");
  const issued = b.issued ?? row.issued;
  const expires = b.expires ?? row.expires;
  if (expires < issued) throw new ApiError(422, "validation_failed", "A licence cannot expire before it was issued");
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE licences SET issued = ?, expires = ? WHERE id = ?").bind(issued, expires, id),
    auditStmt(c.env.DB, user, { action: "licence.renew", entity: "official", entityId: row.officialId, before: row, after: { issued, expires }, ip: c.get("ip") }),
  ]);
  return c.json({ ok: true });
});

/* ------------------------------------------------------------------ *
 * Physical tests
 * ------------------------------------------------------------------ */

const fitnessSchema = z.object({
  date: dateSchema,
  test1: z.object({ result: z.enum(["passed", "failed"]), bestSprint: z.number().min(3).max(15) }),
  test2: z.object({ result: z.enum(["passed", "failed"]), laps: z.number().int().min(0).max(100) }),
  retestDate: dateSchema.nullable().default(null),
});

fitness.put("/:officialId", staff, async (c) => {
  const user = currentUser(c);
  const officialId = c.req.param("officialId");
  const b = await readJson(c, fitnessSchema);
  const failed = b.test1.result === "failed" || b.test2.result === "failed";
  if (failed && !b.retestDate) throw new ApiError(422, "retest_required", "A failed test needs a retest date");
  try {
    await c.env.DB.batch([
      c.env.DB
        .prepare(
          `INSERT INTO fitness_tests (official_id, date, test1_result, best_sprint, test2_result, laps, retest_date) VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (official_id) DO UPDATE SET date = excluded.date, test1_result = excluded.test1_result, best_sprint = excluded.best_sprint,
             test2_result = excluded.test2_result, laps = excluded.laps, retest_date = excluded.retest_date`,
        )
        .bind(officialId, b.date, b.test1.result, b.test1.bestSprint, b.test2.result, b.test2.laps, failed ? b.retestDate : null),
      auditStmt(c.env.DB, user, { action: "fitness.record", entity: "official", entityId: officialId, after: { date: b.date, failed }, ip: c.get("ip") }),
    ]);
  } catch (err) {
    if (String(err).includes("FOREIGN KEY")) throw new ApiError(422, "unknown_official", "Unknown official");
    throw err;
  }
  return c.json({ ok: true });
});

/* ------------------------------------------------------------------ *
 * Courses, exams and camps
 * ------------------------------------------------------------------ */

courses.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT c.id, c.kind, c.name, c.provider, c.hours, c.state, GROUP_CONCAT(e.official_id) AS officialIds
       FROM courses c LEFT JOIN course_enrolments e ON e.course_id = c.id GROUP BY c.id ORDER BY c.id`,
  ).all<{ name: string; officialIds: string | null } & Record<string, unknown>>();
  return c.json({ courses: results.map((r) => ({ ...r, name: json(r.name, {}), officialIds: r.officialIds ? r.officialIds.split(",") : [] })) });
});

const courseSchema = z.object({
  kind: z.enum(["course", "exam", "camp"]).default("course"),
  name: z.object({ en: z.string().min(2).max(120), fr: z.string().min(2).max(120) }),
  provider: z.string().min(2).max(80),
  hours: z.number().int().min(1).max(400),
  state: z.enum(["enrolled", "completed", "not-started"]).default("not-started"),
});

courses.post("/", staff, async (c) => {
  const user = currentUser(c);
  const b = await readJson(c, courseSchema);
  const id = `course-${uuid().slice(0, 8)}`;
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO courses (id, kind, name, provider, hours, state) VALUES (?, ?, ?, ?, ?, ?)").bind(id, b.kind, JSON.stringify(b.name), b.provider, b.hours, b.state),
    auditStmt(c.env.DB, user, { action: "course.create", entity: "course", entityId: id, after: { name: b.name.en }, ip: c.get("ip") }),
  ]);
  return c.json({ id }, 201);
});

courses.post("/:id/enrol", staff, async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const { officialIds } = await readJson(c, z.object({ officialIds: z.array(z.string()).min(1).max(200) }));
  try {
    await c.env.DB.batch([
      ...officialIds.map((o) => c.env.DB.prepare("INSERT OR IGNORE INTO course_enrolments (course_id, official_id) VALUES (?, ?)").bind(id, o)),
      auditStmt(c.env.DB, user, { action: "course.enrol", entity: "course", entityId: id, after: { count: officialIds.length }, ip: c.get("ip") }),
    ]);
  } catch (err) {
    if (String(err).includes("FOREIGN KEY")) throw new ApiError(422, "unknown_reference", "Unknown course or official");
    throw err;
  }
  return c.json({ ok: true, enrolled: officialIds.length });
});

courses.post("/:id/complete", staff, async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const { officialIds } = await readJson(c, z.object({ officialIds: z.array(z.string()).min(1).max(200) }));
  await c.env.DB.batch([
    ...officialIds.map((o) => c.env.DB.prepare("UPDATE course_enrolments SET completed_at = ? WHERE course_id = ? AND official_id = ?").bind(today(), id, o)),
    // the course is completed once nobody enrolled is still outstanding
    c.env.DB.prepare("UPDATE courses SET state = 'completed' WHERE id = ? AND NOT EXISTS (SELECT 1 FROM course_enrolments WHERE course_id = ? AND completed_at IS NULL)").bind(id, id),
    auditStmt(c.env.DB, user, { action: "course.complete", entity: "course", entityId: id, after: { officialIds }, ip: c.get("ip") }),
  ]);
  return c.json({ ok: true });
});
