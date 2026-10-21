import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { ApiError, chunk, forbidden, marks, notFound, parseQuery, readJson, today, uuid } from "../lib/http";
import { auditStmt } from "../lib/audit";
import { assertCountry, assertReadOfficial, countryFilter, inCountry, isAdmin } from "../lib/access";
import type { Localized } from "../lib/localized";
import { currentUser, staff } from "../middleware/auth";
import { json } from "../domain/mappers";

export const licences = new Hono<AppEnv>();
export const courses = new Hono<AppEnv>();
export const fitness = new Hono<AppEnv>();

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const KINDS = ["FIFA Badge", "CAF Elite Panel", "National D1", "VAR Certification", "Fitness Clearance"] as const;

function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ *
 * Licences — categories, levels and expiry dates (the country of the official)
 * ------------------------------------------------------------------ */

licences.get("/", staff, async (c) => {
  const user = currentUser(c);
  const q = parseQuery(c, z.object({ expiringWithin: z.coerce.number().int().min(0).max(730).optional(), officialId: z.string().optional(), country: z.string().length(3).optional() }));
  const scope = countryFilter(user, "o.country_code");
  const where: string[] = [scope.sql];
  const args: (string | number)[] = [...scope.params];
  if (q.expiringWithin !== undefined) (where.push("l.expires <= ?"), args.push(addDays(today(), q.expiringWithin)));
  if (q.officialId) (where.push("l.official_id = ?"), args.push(q.officialId));
  if (q.country) (where.push("o.country_code = ?"), args.push(q.country.toUpperCase()));
  const { results } = await c.env.DB.prepare(
    `SELECT l.id, l.official_id AS officialId, o.name AS officialName, o.country_code AS countryCode, l.kind, l.issued, l.expires
       FROM licences l JOIN officials o ON o.id = l.official_id WHERE ${where.join(" AND ")} ORDER BY l.expires LIMIT 500`,
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
  const db = c.env.DB;
  const access = await assertReadOfficial(db, user, b.officialId);
  const id = `lic-${uuid().slice(0, 10)}`;
  await db.batch([
    db.prepare("INSERT INTO licences (id, official_id, kind, issued, expires) VALUES (?, ?, ?, ?, ?)").bind(id, b.officialId, b.kind, b.issued, b.expires),
    // a valid VAR certification is what makes a referee selectable for VAR / AVAR
    ...(b.kind === "VAR Certification" && b.expires >= today() ? [db.prepare("UPDATE officials SET var_qualified = 1 WHERE id = ?").bind(b.officialId)] : []),
    auditStmt(db, user, { action: "licence.add", entity: "official", entityId: b.officialId, after: b, countryCode: access.countryCode, ip: c.get("ip") }),
  ]);
  return c.json({ id }, 201);
});

licences.patch("/:id", staff, async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const b = await readJson(c, z.object({ issued: dateSchema.optional(), expires: dateSchema.optional() }));
  const db = c.env.DB;
  const row = await db
    .prepare("SELECT l.official_id AS officialId, l.kind, l.issued, l.expires, o.country_code AS countryCode FROM licences l JOIN officials o ON o.id = l.official_id WHERE l.id = ?")
    .bind(id)
    .first<{ officialId: string; kind: string; issued: string; expires: string; countryCode: string }>();
  if (!row) throw notFound("Licence");
  assertCountry(user, row.countryCode, "Licence");
  const issued = b.issued ?? row.issued;
  const expires = b.expires ?? row.expires;
  if (expires < issued) throw new ApiError(422, "validation_failed", "A licence cannot expire before it was issued");
  await db.batch([
    db.prepare("UPDATE licences SET issued = ?, expires = ? WHERE id = ?").bind(issued, expires, id),
    auditStmt(db, user, { action: "licence.renew", entity: "official", entityId: row.officialId, before: row, after: { issued, expires }, countryCode: row.countryCode, ip: c.get("ip") }),
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
  const db = c.env.DB;
  const access = await assertReadOfficial(db, user, officialId);
  const failed = b.test1.result === "failed" || b.test2.result === "failed";
  if (failed && !b.retestDate) throw new ApiError(422, "retest_required", "A failed test needs a retest date");
  await db.batch([
    db
      .prepare(
        `INSERT INTO fitness_tests (official_id, date, test1_result, best_sprint, test2_result, laps, retest_date) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (official_id) DO UPDATE SET date = excluded.date, test1_result = excluded.test1_result, best_sprint = excluded.best_sprint,
           test2_result = excluded.test2_result, laps = excluded.laps, retest_date = excluded.retest_date`,
      )
      .bind(officialId, b.date, b.test1.result, b.test1.bestSprint, b.test2.result, b.test2.laps, failed ? b.retestDate : null),
    auditStmt(db, user, { action: "fitness.record", entity: "official", entityId: officialId, after: { date: b.date, failed }, countryCode: access.countryCode, ip: c.get("ip") }),
  ]);
  return c.json({ ok: true });
});

/* ------------------------------------------------------------------ *
 * Courses, exams and camps.
 * federation_id NULL = offered platform-wide (created by an administrator);
 * otherwise run by one federation for its own officials.
 * ------------------------------------------------------------------ */

interface CourseRow {
  id: string;
  federation_id: string | null;
  fed_country: string | null;
}

/** A course the caller may see. Platform-wide ones are visible to everybody; a federation's own only to it (and admins). */
async function loadCourse(db: D1Database, user: ReturnType<typeof currentUser>, id: string) {
  const row = await db
    .prepare("SELECT c.id, c.federation_id, f.country AS fed_country FROM courses c LEFT JOIN federations f ON f.id = c.federation_id WHERE c.id = ?")
    .bind(id)
    .first<CourseRow>();
  if (!row) throw notFound("Course");
  if (user.role === "federation" && row.federation_id !== null && row.federation_id !== user.federationId) throw notFound("Course");
  return row;
}

courses.get("/", async (c) => {
  const user = currentUser(c);
  const db = c.env.DB;
  const enrolScope: string[] = [];
  const enrolArgs: string[] = [];
  const where: string[] = [];
  const whereArgs: string[] = [];
  if (user.role === "admin") {
    enrolScope.push("1 = 1");
  } else if (user.role === "federation") {
    // only its own officials are listed as enrolled, even on a platform-wide course
    enrolScope.push("o.country_code = ?");
    enrolArgs.push(user.country ?? "");
    where.push("(c.federation_id IS NULL OR c.federation_id = ?)");
    whereArgs.push(user.federationId ?? "");
  } else {
    if (!user.officialId) throw forbidden();
    const mine = await db
      .prepare("SELECT f.id AS federationId FROM officials o LEFT JOIN federations f ON f.country = o.country_code WHERE o.id = ?")
      .bind(user.officialId)
      .first<{ federationId: string | null }>();
    enrolScope.push("o.id = ?");
    enrolArgs.push(user.officialId);
    where.push("(c.federation_id IS NULL OR c.federation_id = ?)");
    whereArgs.push(mine?.federationId ?? "");
  }
  const { results } = await db
    .prepare(
      `SELECT c.id, c.kind, c.name, c.provider, c.federation_id AS federationId, c.hours, c.state, GROUP_CONCAT(e.official_id) AS officialIds
         FROM courses c
         LEFT JOIN (SELECT ce.course_id, ce.official_id FROM course_enrolments ce JOIN officials o ON o.id = ce.official_id WHERE ${enrolScope.join(" AND ")}) e ON e.course_id = c.id
        ${where.length ? "WHERE " + where.join(" AND ") : ""} GROUP BY c.id ORDER BY c.id`,
    )
    .bind(...enrolArgs, ...whereArgs)
    .all<{ name: string; officialIds: string | null } & Record<string, unknown>>();
  return c.json({ courses: results.map((r) => ({ ...r, name: json<Localized>(r.name, { fr: "", en: "" }), officialIds: r.officialIds ? r.officialIds.split(",") : [] })) });
});

const courseSchema = z.object({
  /** Admin only: run the course for one federation. Absent or null = platform-wide. */
  federationId: z.string().max(80).nullable().optional(),
  kind: z.enum(["course", "exam", "camp"]).default("course"),
  name: z.object({ fr: z.string().min(2).max(120), en: z.string().min(2).max(120), es: z.string().max(120).optional(), de: z.string().max(120).optional() }),
  provider: z.string().min(2).max(80),
  hours: z.number().int().min(1).max(400),
  state: z.enum(["enrolled", "completed", "not-started"]).default("not-started"),
});

courses.post("/", staff, async (c) => {
  const user = currentUser(c);
  const b = await readJson(c, courseSchema);
  const db = c.env.DB;
  let federationId: string | null;
  let countryCode: string | null = null;
  if (user.role === "federation") {
    if (b.federationId === null) throw forbidden("Platform-wide courses are created by the administrator");
    if (b.federationId !== undefined && b.federationId !== user.federationId) throw notFound("Federation");
    federationId = user.federationId;
    countryCode = user.country;
  } else {
    federationId = b.federationId ?? null;
    if (federationId) {
      const fed = await db.prepare("SELECT country FROM federations WHERE id = ?").bind(federationId).first<{ country: string }>();
      if (!fed) throw notFound("Federation");
      countryCode = fed.country;
    }
  }
  const id = `course-${uuid().slice(0, 8)}`;
  await db.batch([
    db.prepare("INSERT INTO courses (id, kind, name, provider, federation_id, hours, state) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, b.kind, JSON.stringify(b.name), b.provider, federationId, b.hours, b.state),
    auditStmt(db, user, { action: "course.create", entity: "course", entityId: id, after: { name: b.name.en, federationId }, countryCode, ip: c.get("ip") }),
  ]);
  return c.json({ id, federationId }, 201);
});

const officialsBody = z.object({ officialIds: z.array(z.string()).min(1).max(200) });

/**
 * Every official must exist and be one the caller may act on (its own country for a federation seat),
 * and, on a federation's own course, belong to that federation's country. Anything else is a 404 and nothing changes.
 */
async function checkOfficials(db: D1Database, user: ReturnType<typeof currentUser>, course: CourseRow, officialIds: string[]) {
  const ids = [...new Set(officialIds)];
  const rows: Array<{ id: string; country_code: string }> = [];
  for (const part of chunk(ids)) {
    const { results } = await db.prepare(`SELECT id, country_code FROM officials WHERE id IN (${marks(part.length)})`).bind(...part).all<{ id: string; country_code: string }>();
    rows.push(...results);
  }
  if (rows.length !== ids.length || rows.some((r) => !inCountry(user, r.country_code))) throw notFound("Official");
  if (course.fed_country && rows.some((r) => r.country_code !== course.fed_country)) {
    throw new ApiError(422, "official_not_eligible", "This course is run for another federation's officials");
  }
  return { ids, countries: [...new Set(rows.map((r) => r.country_code))] };
}

courses.post("/:id/enrol", staff, async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const { officialIds } = await readJson(c, officialsBody);
  const db = c.env.DB;
  const course = await loadCourse(db, user, id);
  const { ids, countries } = await checkOfficials(db, user, course, officialIds);
  await db.batch([
    ...ids.map((o) => db.prepare("INSERT OR IGNORE INTO course_enrolments (course_id, official_id) VALUES (?, ?)").bind(id, o)),
    auditStmt(db, user, { action: "course.enrol", entity: "course", entityId: id, after: { count: ids.length }, countryCode: user.country ?? (countries.length === 1 ? countries[0] : course.fed_country), ip: c.get("ip") }),
  ]);
  return c.json({ ok: true, enrolled: ids.length });
});

courses.post("/:id/complete", staff, async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const { officialIds } = await readJson(c, officialsBody);
  const db = c.env.DB;
  const course = await loadCourse(db, user, id);
  const { ids, countries } = await checkOfficials(db, user, course, officialIds);
  // A platform-wide course spans federations: only an administrator closes it for everybody.
  const closable = isAdmin(user) || course.federation_id !== null;
  const res = await db.batch([
    ...ids.map((o) => db.prepare("UPDATE course_enrolments SET completed_at = ? WHERE course_id = ? AND official_id = ? AND completed_at IS NULL").bind(today(), id, o)),
    ...(closable
      ? [db.prepare("UPDATE courses SET state = 'completed' WHERE id = ? AND NOT EXISTS (SELECT 1 FROM course_enrolments WHERE course_id = ? AND completed_at IS NULL)").bind(id, id)]
      : []),
    auditStmt(db, user, { action: "course.complete", entity: "course", entityId: id, after: { officialIds: ids }, countryCode: user.country ?? (countries.length === 1 ? countries[0] : course.fed_country), ip: c.get("ip") }),
  ]);
  const completed = res.slice(0, ids.length).reduce((n, r) => n + (r.meta.changes ?? 0), 0);
  return c.json({ ok: true, completed });
});
