import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { ApiError, chunk, forbidden, marks, notFound, parseQuery, readJson, today, uuid } from "../lib/http";
import { auditStmt } from "../lib/audit";
import { assertCountry, assertReadOfficial, countryFilter, inCountry, isAdmin } from "../lib/access";
import type { Localized } from "../lib/localized";
import { currentUser, requireRole, staff } from "../middleware/auth";
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
    auditStmt(db, user, { action: "licence.add", entity: "official", entityId: b.officialId, after: b, countryCode: access.countryCode, ip: c.get("ip") }),
  ]);
  // a valid VAR certification is what makes a referee selectable for VAR / AVAR
  if (b.kind === "VAR Certification") await syncVarQualification(db, b.officialId);
  return c.json({ id }, 201);
});

licences.patch("/:id", staff, async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const b = await readJson(c, z.object({ kind: z.enum(KINDS).optional(), issued: dateSchema.optional(), expires: dateSchema.optional() }));
  const db = c.env.DB;
  const row = await loadLicence(db, user, id);
  const kind = b.kind ?? row.kind;
  const issued = b.issued ?? row.issued;
  const expires = b.expires ?? row.expires;
  if (expires < issued) throw new ApiError(422, "validation_failed", "A licence cannot expire before it was issued");
  await db.batch([
    db.prepare("UPDATE licences SET kind = ?, issued = ?, expires = ? WHERE id = ?").bind(kind, issued, expires, id),
    auditStmt(db, user, {
      action: kind !== row.kind ? "licence.change_kind" : "licence.renew",
      entity: "official",
      entityId: row.officialId,
      before: { kind: row.kind, issued: row.issued, expires: row.expires },
      after: { kind, issued, expires },
      countryCode: row.countryCode,
      ip: c.get("ip"),
    }),
  ]);
  // a VAR certificate gained, lost or moved changes who may sit in the VAR room
  if (row.kind === "VAR Certification" || kind === "VAR Certification") await syncVarQualification(db, row.officialId);
  return c.json({ ok: true });
});

// Removing a licence rewrites an official's record: an administrator's call only (a wrong entry is corrected, not deleted, by a federation).
licences.delete("/:id", requireRole("admin"), async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const db = c.env.DB;
  const row = await loadLicence(db, user, id);
  await db.batch([
    db.prepare("DELETE FROM licences WHERE id = ?").bind(id),
    auditStmt(db, user, { action: "licence.delete", entity: "official", entityId: row.officialId, before: { id, kind: row.kind, issued: row.issued, expires: row.expires }, countryCode: row.countryCode, ip: c.get("ip") }),
  ]);
  if (row.kind === "VAR Certification") await syncVarQualification(db, row.officialId);
  return c.json({ ok: true });
});

/** A licence the caller may change: of an official of its own country (404 otherwise). */
async function loadLicence(db: D1Database, user: ReturnType<typeof currentUser>, id: string) {
  const row = await db
    .prepare("SELECT l.official_id AS officialId, l.kind, l.issued, l.expires, o.country_code AS countryCode FROM licences l JOIN officials o ON o.id = l.official_id WHERE l.id = ?")
    .bind(id)
    .first<{ officialId: string; kind: (typeof KINDS)[number]; issued: string; expires: string; countryCode: string }>();
  if (!row) throw notFound("Licence");
  assertCountry(user, row.countryCode, "Licence");
  return row;
}

/**
 * VAR eligibility follows the VAR certificates on file: an official holding a valid one is selectable for VAR / AVAR,
 * one whose every certificate has expired no longer is. An official with no certificate on file keeps the flag staff
 * set by hand. Idempotent; the daily job runs it for everyone, a licence change for the official concerned.
 */
export async function syncVarQualification(db: D1Database, onlyOfficialId?: string) {
  const { results } = await db
    .prepare(
      `SELECT o.id, o.country_code AS countryCode, o.var_qualified AS current,
              EXISTS (SELECT 1 FROM licences l WHERE l.official_id = o.id AND l.kind = 'VAR Certification' AND l.expires >= ?1) AS valid
         FROM officials o
        WHERE EXISTS (SELECT 1 FROM licences l WHERE l.official_id = o.id AND l.kind = 'VAR Certification') AND (?2 IS NULL OR o.id = ?2)`,
    )
    .bind(today(), onlyOfficialId ?? null)
    .all<{ id: string; countryCode: string; current: number; valid: number }>();
  const changed = results.filter((r) => r.current !== r.valid);
  for (const part of chunk(changed, 40)) {
    await db.batch(
      part.flatMap((r) => [
        db.prepare("UPDATE officials SET var_qualified = ? WHERE id = ?").bind(r.valid, r.id),
        auditStmt(db, null, { action: r.valid ? "official.var_qualified" : "official.var_lapsed", entity: "official", entityId: r.id, countryCode: r.countryCode }),
      ]),
    );
  }
  return changed.map((r) => ({ officialId: r.id, varQualified: r.valid === 1 }));
}

/* ------------------------------------------------------------------ *
 * Physical tests — every test is kept in fitness_test_history; fitness_tests holds the latest one
 * per official, which is what the snapshot, the reports and the retest reminders read.
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
  const retest = failed ? b.retestDate : null;
  const id = `fit-${uuid().slice(0, 12)}`;
  await db.batch([
    db
      .prepare(
        `INSERT INTO fitness_test_history (id, official_id, date, test1_result, best_sprint, test2_result, laps, retest_date, recorded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, officialId, b.date, b.test1.result, b.test1.bestSprint, b.test2.result, b.test2.laps, retest, user.id),
    // the current row follows the most recent test: entering an older one fills the history without rewinding it
    db
      .prepare(
        `INSERT INTO fitness_tests (official_id, date, test1_result, best_sprint, test2_result, laps, retest_date) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (official_id) DO UPDATE SET date = excluded.date, test1_result = excluded.test1_result, best_sprint = excluded.best_sprint,
           test2_result = excluded.test2_result, laps = excluded.laps, retest_date = excluded.retest_date
         WHERE excluded.date >= fitness_tests.date`,
      )
      .bind(officialId, b.date, b.test1.result, b.test1.bestSprint, b.test2.result, b.test2.laps, retest),
    auditStmt(db, user, { action: "fitness.record", entity: "official", entityId: officialId, after: { id, date: b.date, failed }, countryCode: access.countryCode, ip: c.get("ip") }),
  ]);
  return c.json({ ok: true, id });
});

/** `/officials/:id/...` reads that belong to the training register. */
export const officialTraining = new Hono<AppEnv>();

// The official themself, their federation or an administrator; another referee 403, another country 404.
officialTraining.get("/:id/fitness", async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const db = c.env.DB;
  await assertReadOfficial(db, user, id);
  const q = parseQuery(c, z.object({ limit: z.coerce.number().int().min(1).max(100).default(50), offset: z.coerce.number().int().min(0).default(0) }));
  const COLS = "date, test1_result AS test1Result, best_sprint AS bestSprint, test2_result AS test2Result, laps, retest_date AS retestDate";
  const [history, current] = await db.batch<FitnessHistoryRow>([
    // a current row older than the history table (seeded, or filed before it existed) still shows as an entry
    db
      .prepare(
        `SELECT id, ${COLS}, recorded_at AS recordedAt FROM fitness_test_history WHERE official_id = ?1
         UNION ALL
         SELECT 'current', ${COLS}, NULL FROM fitness_tests t WHERE t.official_id = ?1
           AND NOT EXISTS (SELECT 1 FROM fitness_test_history h WHERE h.official_id = t.official_id AND h.date = t.date)
         ORDER BY date DESC, recordedAt DESC LIMIT ?2 OFFSET ?3`,
      )
      .bind(id, q.limit + 1, q.offset),
    db.prepare(`SELECT 'current' AS id, ${COLS}, NULL AS recordedAt FROM fitness_tests WHERE official_id = ?`).bind(id),
  ]);
  const toTest = (r: FitnessHistoryRow) => ({
    id: r.id,
    date: r.date,
    test1: { result: r.test1Result, bestSprint: r.bestSprint },
    test2: { result: r.test2Result, laps: r.laps },
    retestDate: r.retestDate,
    passed: r.test1Result === "passed" && r.test2Result === "passed",
    recordedAt: r.recordedAt,
  });
  const rows = history.results;
  return c.json({
    current: current.results[0] ? toTest(current.results[0]) : null,
    history: rows.slice(0, q.limit).map(toTest),
    limit: q.limit,
    offset: q.offset,
    hasMore: rows.length > q.limit,
  });
});

interface FitnessHistoryRow {
  id: string;
  date: string;
  test1Result: "passed" | "failed";
  bestSprint: number;
  test2Result: "passed" | "failed";
  laps: number;
  retestDate: string | null;
  recordedAt: string | null;
}

/* ------------------------------------------------------------------ *
 * Courses, exams and camps.
 * federation_id NULL = offered platform-wide (created by an administrator);
 * otherwise run by one federation for its own officials.
 * Each enrolment carries its own state (enrolled → completed | failed) and exam score; `courses.state`
 * is still maintained (completed once nobody is left enrolled) so older clients keep reading it.
 * ------------------------------------------------------------------ */

interface CourseRow {
  id: string;
  federation_id: string | null;
  fed_country: string | null;
  state: string;
  open_enrolment: number;
  closed_at: string | null;
  ends_on: string | null;
}

type Caller = ReturnType<typeof currentUser>;

/** The country of a referee's own file (their federation's courses are the ones they may see). */
async function ownCountry(db: D1Database, user: Caller) {
  if (!user.officialId) throw forbidden();
  const row = await db.prepare("SELECT country_code AS country FROM officials WHERE id = ?").bind(user.officialId).first<{ country: string }>();
  if (!row) throw forbidden();
  return row.country;
}

/**
 * A course the caller may see. Platform-wide ones are visible to everybody; a federation's own only to it,
 * to the officials of its country and to admins. Anything else is a 404.
 */
async function loadCourse(db: D1Database, user: Caller, id: string) {
  const row = await db
    .prepare(
      `SELECT c.id, c.federation_id, f.country AS fed_country, c.state, c.open_enrolment, c.closed_at, c.ends_on
         FROM courses c LEFT JOIN federations f ON f.id = c.federation_id WHERE c.id = ?`,
    )
    .bind(id)
    .first<CourseRow>();
  if (!row) throw notFound("Course");
  if (user.role === "federation" && row.federation_id !== null && row.federation_id !== user.federationId) throw notFound("Course");
  if (user.role === "referee" && row.federation_id !== null && row.fed_country !== (await ownCountry(db, user))) throw notFound("Course");
  return row;
}

/** A course the caller may change: a federation its own ones; the platform-wide ones are the administrator's. */
async function loadOwnedCourse(db: D1Database, user: Caller, id: string) {
  const row = await loadCourse(db, user, id);
  if (user.role === "federation" && row.federation_id === null) throw forbidden("Platform-wide courses are managed by the administrator");
  return row;
}

/** Open to self-enrolment: staff opened it, it is not closed or finished, and it has not ended. */
const selfEnrolOpen = (r: Pick<CourseRow, "open_enrolment" | "closed_at" | "state" | "ends_on">, day = today()) =>
  r.open_enrolment === 1 && !r.closed_at && r.state !== "completed" && (!r.ends_on || r.ends_on >= day);

const COURSE_COLS = `c.id, c.kind, c.name, c.provider, c.federation_id AS federationId, c.hours, c.state, c.starts_on AS startsOn, c.ends_on AS endsOn,
  c.open_enrolment AS openEnrolment, c.closed_at AS closedAt`;
const ENROLMENT_COLS = `ce.course_id AS courseId, ce.official_id AS officialId, o.name AS officialName, o.country_code AS countryCode, ce.state, ce.exam_score AS examScore,
  ce.completed_at AS completedAt, ce.enrolled_at AS enrolledAt, ce.self_enrolled AS selfEnrolled`;

interface ApiCourseRow {
  id: string;
  name: string;
  state: string;
  openEnrolment: number;
  closedAt: string | null;
  endsOn: string | null;
  federationId: string | null;
}
interface EnrolmentRow {
  courseId: string;
  officialId: string;
  selfEnrolled: number;
  [k: string]: unknown;
}

const toEnrolment = ({ courseId: _c, selfEnrolled, ...e }: EnrolmentRow) => ({ ...e, selfEnrolled: selfEnrolled === 1 });

function toCourse(r: ApiCourseRow, enrolments: EnrolmentRow[], me?: string | null) {
  const mine = me ? enrolments.find((e) => e.officialId === me) : undefined;
  return {
    ...r,
    name: json<Localized>(r.name, { fr: "", en: "" }),
    openEnrolment: r.openEnrolment === 1,
    closed: r.closedAt !== null,
    officialIds: enrolments.map((e) => e.officialId),
    enrolments: enrolments.map(toEnrolment),
    // referees only: their own enrolment, and whether they may sign up themselves
    ...(me !== undefined
      ? { myEnrolment: mine ? toEnrolment(mine) : null, canSelfEnrol: !mine && selfEnrolOpen({ open_enrolment: r.openEnrolment, closed_at: r.closedAt, state: r.state, ends_on: r.endsOn }) }
      : {}),
  };
}

/** Which enrolments the caller may see: everything (admin), its own officials (federation), their own (referee). */
function enrolmentScope(user: Caller): { sql: string; args: string[] } {
  if (user.role === "admin") return { sql: "1 = 1", args: [] };
  if (user.role === "federation") return { sql: "o.country_code = ?", args: [user.country ?? ""] };
  return { sql: "o.id = ?", args: [user.officialId ?? ""] };
}

courses.get("/", async (c) => {
  const user = currentUser(c);
  const db = c.env.DB;
  const where: string[] = [];
  const whereArgs: string[] = [];
  if (user.role === "federation") {
    where.push("(c.federation_id IS NULL OR c.federation_id = ?)");
    whereArgs.push(user.federationId ?? "");
  } else if (user.role === "referee") {
    const country = await ownCountry(db, user);
    where.push("(c.federation_id IS NULL OR c.federation_id IN (SELECT id FROM federations WHERE country = ?))");
    whereArgs.push(country);
  }
  const visible = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const scope = enrolmentScope(user);
  const [list, enrolled] = await db.batch<Record<string, unknown>>([
    db.prepare(`SELECT ${COURSE_COLS} FROM courses c ${visible} ORDER BY COALESCE(c.starts_on, '9999'), c.id`).bind(...whereArgs),
    db
      .prepare(
        `SELECT ${ENROLMENT_COLS} FROM course_enrolments ce JOIN officials o ON o.id = ce.official_id
          WHERE ${scope.sql} AND ce.course_id IN (SELECT c.id FROM courses c ${visible}) ORDER BY o.name`,
      )
      .bind(...scope.args, ...whereArgs),
  ]);
  const byCourse = new Map<string, EnrolmentRow[]>();
  for (const e of enrolled.results as unknown as EnrolmentRow[]) byCourse.set(e.courseId, [...(byCourse.get(e.courseId) ?? []), e]);
  const me = user.role === "referee" ? user.officialId : undefined;
  return c.json({ courses: (list.results as unknown as ApiCourseRow[]).map((r) => toCourse(r, byCourse.get(r.id) ?? [], me)) });
});

courses.get("/:id", async (c) => {
  const user = currentUser(c);
  const db = c.env.DB;
  const course = await loadCourse(db, user, c.req.param("id"));
  const scope = enrolmentScope(user);
  const [row, enrolled] = await db.batch<Record<string, unknown>>([
    db.prepare(`SELECT ${COURSE_COLS} FROM courses c WHERE c.id = ?`).bind(course.id),
    db
      .prepare(`SELECT ${ENROLMENT_COLS} FROM course_enrolments ce JOIN officials o ON o.id = ce.official_id WHERE ce.course_id = ? AND ${scope.sql} ORDER BY o.name`)
      .bind(course.id, ...scope.args),
  ]);
  const me = user.role === "referee" ? user.officialId : undefined;
  return c.json({ course: toCourse(row.results[0] as unknown as ApiCourseRow, enrolled.results as unknown as EnrolmentRow[], me) });
});

const nameSchema = z.object({ fr: z.string().min(2).max(120), en: z.string().min(2).max(120), es: z.string().max(120).optional(), de: z.string().max(120).optional() });
const datesInOrder = (v: { startsOn?: string | null; endsOn?: string | null }) => !v.startsOn || !v.endsOn || v.endsOn >= v.startsOn;

const courseSchema = z
  .object({
    /** Admin only: run the course for one federation. Absent or null = platform-wide. */
    federationId: z.string().max(80).nullable().optional(),
    kind: z.enum(["course", "exam", "camp"]).default("course"),
    name: nameSchema,
    provider: z.string().min(2).max(80),
    hours: z.number().int().min(1).max(400),
    state: z.enum(["enrolled", "completed", "not-started"]).default("not-started"),
    startsOn: dateSchema.nullable().default(null),
    endsOn: dateSchema.nullable().default(null),
    openEnrolment: z.boolean().default(false),
  })
  .refine(datesInOrder, { message: "A course cannot end before it starts", path: ["endsOn"] });

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
    db
      .prepare("INSERT INTO courses (id, kind, name, provider, federation_id, hours, state, starts_on, ends_on, open_enrolment) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, b.kind, JSON.stringify(b.name), b.provider, federationId, b.hours, b.state, b.startsOn, b.endsOn, b.openEnrolment ? 1 : 0),
    auditStmt(db, user, { action: "course.create", entity: "course", entityId: id, after: { name: b.name.en, federationId }, countryCode, ip: c.get("ip") }),
  ]);
  return c.json({ id, federationId }, 201);
});

const coursePatch = z
  .object({
    kind: z.enum(["course", "exam", "camp"]),
    name: nameSchema,
    provider: z.string().min(2).max(80),
    hours: z.number().int().min(1).max(400),
    startsOn: dateSchema.nullable(),
    endsOn: dateSchema.nullable(),
    openEnrolment: z.boolean(),
  })
  .partial();

courses.patch("/:id", staff, async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const b = await readJson(c, coursePatch);
  const db = c.env.DB;
  const course = await loadOwnedCourse(db, user, id);
  const before = (await db.prepare("SELECT starts_on AS startsOn, ends_on AS endsOn FROM courses WHERE id = ?").bind(id).first<{ startsOn: string | null; endsOn: string | null }>())!;
  const startsOn = b.startsOn !== undefined ? b.startsOn : before.startsOn;
  const endsOn = b.endsOn !== undefined ? b.endsOn : before.endsOn;
  if (!datesInOrder({ startsOn, endsOn })) throw new ApiError(422, "validation_failed", "A course cannot end before it starts", [{ path: "endsOn", message: "A course cannot end before it starts" }]);
  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  if (b.kind) (sets.push("kind = ?"), args.push(b.kind));
  if (b.name) (sets.push("name = ?"), args.push(JSON.stringify(b.name)));
  if (b.provider) (sets.push("provider = ?"), args.push(b.provider));
  if (b.hours) (sets.push("hours = ?"), args.push(b.hours));
  if (b.startsOn !== undefined) (sets.push("starts_on = ?"), args.push(b.startsOn));
  if (b.endsOn !== undefined) (sets.push("ends_on = ?"), args.push(b.endsOn));
  if (b.openEnrolment !== undefined) (sets.push("open_enrolment = ?"), args.push(b.openEnrolment ? 1 : 0));
  if (sets.length === 0) return c.json({ ok: true, changed: false });
  await db.batch([
    db.prepare(`UPDATE courses SET ${sets.join(", ")} WHERE id = ?`).bind(...args, id),
    auditStmt(db, user, { action: "course.update", entity: "course", entityId: id, after: b, countryCode: course.fed_country, ip: c.get("ip") }),
  ]);
  return c.json({ ok: true, changed: true });
});

// Without enrolments the course goes; with any, it is closed instead (no new enrolments) so its history stays.
courses.delete("/:id", staff, async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const db = c.env.DB;
  const course = await loadOwnedCourse(db, user, id);
  const used = await db.prepare("SELECT COUNT(*) AS n FROM course_enrolments WHERE course_id = ?").bind(id).first<{ n: number }>();
  if (!used?.n) {
    await db.batch([
      db.prepare("DELETE FROM courses WHERE id = ?").bind(id),
      auditStmt(db, user, { action: "course.delete", entity: "course", entityId: id, countryCode: course.fed_country, ip: c.get("ip") }),
    ]);
    return c.json({ ok: true, deleted: true, closed: false });
  }
  if (!course.closed_at) {
    await db.batch([
      db.prepare("UPDATE courses SET closed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), open_enrolment = 0 WHERE id = ?").bind(id),
      auditStmt(db, user, { action: "course.close", entity: "course", entityId: id, after: { enrolments: used.n }, countryCode: course.fed_country, ip: c.get("ip") }),
    ]);
  }
  return c.json({ ok: true, deleted: false, closed: true });
});

const officialsBody = z.object({ officialIds: z.array(z.string()).min(1).max(200) });

/**
 * Every official must exist and be one the caller may act on (its own country for a federation seat),
 * and, on a federation's own course, belong to that federation's country. Anything else is a 404 and nothing changes.
 */
async function checkOfficials(db: D1Database, user: Caller, course: CourseRow, officialIds: string[]) {
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

const auditCountry = (user: Caller, countries: string[], course: CourseRow) => user.country ?? (countries.length === 1 ? countries[0] : course.fed_country);

/** Once nobody is left in progress, a course its owner may close for everybody reads as completed (the old course-wide state). */
const legacyCompleteStmt = (db: D1Database, user: Caller, course: CourseRow) =>
  isAdmin(user) || course.federation_id !== null
    ? [
        db
          .prepare(
            `UPDATE courses SET state = 'completed' WHERE id = ?1
               AND NOT EXISTS (SELECT 1 FROM course_enrolments WHERE course_id = ?1 AND state = 'enrolled')
               AND EXISTS (SELECT 1 FROM course_enrolments WHERE course_id = ?1)`,
          )
          .bind(course.id),
      ]
    : [];

courses.post("/:id/enrol", staff, async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const { officialIds } = await readJson(c, officialsBody);
  const db = c.env.DB;
  const course = await loadCourse(db, user, id);
  if (course.closed_at) throw new ApiError(409, "course_closed", "This course is closed");
  const { ids, countries } = await checkOfficials(db, user, course, officialIds);
  await db.batch([
    ...ids.map((o) => db.prepare("INSERT OR IGNORE INTO course_enrolments (course_id, official_id, enrolled_at) VALUES (?, ?, ?)").bind(id, o, today())),
    // someone new is in progress: a course read as completed is no longer
    db.prepare("UPDATE courses SET state = 'enrolled' WHERE id = ? AND state = 'completed'").bind(id),
    auditStmt(db, user, { action: "course.enrol", entity: "course", entityId: id, after: { count: ids.length }, countryCode: auditCountry(user, countries, course), ip: c.get("ip") }),
  ]);
  return c.json({ ok: true, enrolled: ids.length });
});

// Takes officials off a course. A finished enrolment (completed or failed) is history and stays.
courses.post("/:id/unenrol", staff, async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const { officialIds } = await readJson(c, officialsBody);
  const db = c.env.DB;
  const course = await loadCourse(db, user, id);
  const { ids, countries } = await checkOfficials(db, user, course, officialIds);
  const res = await db.batch([
    ...ids.map((o) => db.prepare("DELETE FROM course_enrolments WHERE course_id = ? AND official_id = ? AND state = 'enrolled'").bind(id, o)),
    ...legacyCompleteStmt(db, user, course),
    auditStmt(db, user, { action: "course.unenrol", entity: "course", entityId: id, after: { officialIds: ids }, countryCode: auditCountry(user, countries, course), ip: c.get("ip") }),
  ]);
  const removed = res.slice(0, ids.length).reduce((n, r) => n + (r.meta.changes ?? 0), 0);
  return c.json({ ok: true, removed, kept: ids.length - removed });
});

courses.post("/:id/complete", staff, async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const { officialIds } = await readJson(c, officialsBody);
  const db = c.env.DB;
  const course = await loadCourse(db, user, id);
  const { ids, countries } = await checkOfficials(db, user, course, officialIds);
  // A platform-wide course spans federations: only an administrator closes it for everybody.
  const res = await db.batch([
    ...ids.map((o) =>
      db.prepare("UPDATE course_enrolments SET completed_at = ?, state = 'completed' WHERE course_id = ? AND official_id = ? AND state = 'enrolled'").bind(today(), id, o),
    ),
    ...legacyCompleteStmt(db, user, course),
    auditStmt(db, user, { action: "course.complete", entity: "course", entityId: id, after: { officialIds: ids }, countryCode: auditCountry(user, countries, course), ip: c.get("ip") }),
  ]);
  const completed = res.slice(0, ids.length).reduce((n, r) => n + (r.meta.changes ?? 0), 0);
  return c.json({ ok: true, completed });
});

const enrolmentPatch = z
  .object({ state: z.enum(["enrolled", "completed", "failed"]).optional(), examScore: z.number().min(0).max(100).nullable().optional() })
  .refine((v) => v.state !== undefined || v.examScore !== undefined, { message: "Give a state or an exam score" });

// One official's result on a course: their state and, for an exam, the score.
courses.patch("/:id/enrolments/:officialId", staff, async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const officialId = c.req.param("officialId");
  const b = await readJson(c, enrolmentPatch);
  const db = c.env.DB;
  const course = await loadCourse(db, user, id);
  const { countries } = await checkOfficials(db, user, course, [officialId]);
  const before = await db
    .prepare("SELECT state, exam_score AS examScore FROM course_enrolments WHERE course_id = ? AND official_id = ?")
    .bind(id, officialId)
    .first<{ state: string; examScore: number | null }>();
  if (!before) throw notFound("Enrolment");
  const state = b.state ?? before.state;
  const examScore = b.examScore !== undefined ? b.examScore : before.examScore;
  await db.batch([
    db
      .prepare(
        `UPDATE course_enrolments SET state = ?1, exam_score = ?2,
           completed_at = CASE WHEN ?1 = 'enrolled' THEN NULL WHEN state = ?1 THEN completed_at ELSE ?3 END
         WHERE course_id = ?4 AND official_id = ?5`,
      )
      .bind(state, examScore, today(), id, officialId),
    ...(state === "enrolled" ? [db.prepare("UPDATE courses SET state = 'enrolled' WHERE id = ? AND state = 'completed'").bind(id)] : legacyCompleteStmt(db, user, course)),
    auditStmt(db, user, { action: "course.result", entity: "course", entityId: id, before, after: { officialId, state, examScore }, countryCode: auditCountry(user, countries, course), ip: c.get("ip") }),
  ]);
  return c.json({ ok: true, state, examScore });
});

/* ---- a referee's own enrolment ---- */

courses.post("/:id/enrolment", requireRole("referee"), async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const db = c.env.DB;
  const course = await loadCourse(db, user, id);
  const country = await ownCountry(db, user);
  const already = await db.prepare("SELECT 1 AS x FROM course_enrolments WHERE course_id = ? AND official_id = ?").bind(id, user.officialId).first();
  if (already) return c.json({ ok: true, enrolled: false });
  if (!selfEnrolOpen(course)) throw new ApiError(409, "enrolment_closed", "This course is not open for enrolment");
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO course_enrolments (course_id, official_id, enrolled_at, self_enrolled) VALUES (?, ?, ?, 1)").bind(id, user.officialId, today()),
    auditStmt(db, user, { action: "course.self_enrol", entity: "course", entityId: id, after: { officialId: user.officialId }, countryCode: country, ip: c.get("ip") }),
  ]);
  return c.json({ ok: true, enrolled: true }, 201);
});

// A referee leaves a course they joined themselves, while it is in progress; a federation's enrolment is the federation's to undo.
courses.delete("/:id/enrolment", requireRole("referee"), async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const db = c.env.DB;
  await loadCourse(db, user, id);
  const country = await ownCountry(db, user);
  const row = await db
    .prepare("SELECT state, self_enrolled AS self FROM course_enrolments WHERE course_id = ? AND official_id = ?")
    .bind(id, user.officialId)
    .first<{ state: string; self: number }>();
  if (!row) throw notFound("Enrolment");
  if (row.state !== "enrolled") throw new ApiError(409, "enrolment_finished", "A finished course stays on your record");
  if (row.self !== 1) throw new ApiError(409, "enrolled_by_federation", "Your federation enrolled you: ask it to take you off this course");
  await db.batch([
    db.prepare("DELETE FROM course_enrolments WHERE course_id = ? AND official_id = ? AND state = 'enrolled' AND self_enrolled = 1").bind(id, user.officialId),
    auditStmt(db, user, { action: "course.self_unenrol", entity: "course", entityId: id, after: { officialId: user.officialId }, countryCode: country, ip: c.get("ip") }),
  ]);
  return c.json({ ok: true });
});
