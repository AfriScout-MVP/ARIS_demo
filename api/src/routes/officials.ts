import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { ApiError, notFound, parseQuery, readJson, today, uuid } from "../lib/http";
import { auditStmt } from "../lib/audit";
import { assertActFor, assertCountry, assertReadOfficial, countryFilter, isAdmin, isStaff } from "../lib/access";
import { commitMedia, readUpload, type MediaKind } from "../lib/media";
import { localParts } from "../lib/time";
import { currentUser, staff } from "../middleware/auth";
import { notifyStmts } from "../lib/notify";
import { json, mediaUrl, toOfficialFile, type OfficialRow } from "../domain/mappers";

export const officials = new Hono<AppEnv>();

const LEVELS = ["CAF Elite", "FIFA Listed", "National D1", "Regional"] as const;
const STATUSES = ["active", "training", "elite-pool", "unavailable", "retired"] as const; // 'suspended' only comes from a disciplinary decision
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const shiftDay = (iso: string, days: number) => new Date(new Date(`${iso}T12:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);

/** Copy kept in the database: French and English always, Spanish and German when translated. */
const bioSchema = z.object({
  fr: z.string().max(1000),
  en: z.string().max(1000),
  es: z.string().max(1000).optional(),
  de: z.string().max(1000).optional(),
});

/* ------------------------------------------------------------------ *
 * The register
 * ------------------------------------------------------------------ */

const listQuery = z.object({
  kind: z.enum(["referee", "assistant"]).optional(),
  country: z.string().length(3).optional(),
  status: z.string().max(20).optional(),
  q: z.string().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
  offset: z.coerce.number().int().min(0).default(0),
});

officials.get("/", staff, async (c) => {
  const user = currentUser(c);
  const q = parseQuery(c, listQuery);
  const scope = countryFilter(user, "country_code");
  const where = [scope.sql];
  const args: (string | number)[] = [...scope.params];
  if (q.kind) (where.push("kind = ?"), args.push(q.kind));
  if (q.country) (where.push("country_code = ?"), args.push(q.country.toUpperCase()));
  if (q.status) (where.push("status = ?"), args.push(q.status));
  if (q.q) {
    const like = `%${q.q.replace(/[\\%_]/g, "\\$&")}%`;
    where.push("(name LIKE ? ESCAPE '\\' OR matricule LIKE ? ESCAPE '\\')");
    args.push(like, like);
  }
  const { results } = await c.env.DB.prepare(`SELECT * FROM officials WHERE ${where.join(" AND ")} ORDER BY name, id LIMIT ? OFFSET ?`)
    .bind(...args, q.limit, q.offset)
    .all<OfficialRow>();
  return c.json({ officials: results.map((r) => toOfficialFile(r, true)), limit: q.limit, offset: q.offset });
});

const createSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,60}$/, "Lower-case letters, digits and dashes").optional(),
  kind: z.enum(["referee", "assistant"]),
  name: z.string().trim().min(2).max(120),
  /** A federation seat's officials are always its own country's; an admin must say which. */
  countryCode: z.string().trim().toUpperCase().length(3).optional(),
  level: z.enum(LEVELS),
  status: z.enum(STATUSES).default("active"),
  /** Only an admin may choose the registration number; otherwise it is generated per country (ARIS-MAR-R0001). */
  matricule: z.string().min(3).max(40).optional(),
  licenceNo: z.string().min(3).max(40).optional(),
  nationality: z.string().max(60).optional(),
  birthDate: DATE.optional(),
  city: z.string().max(80).optional(),
  region: z.string().max(80).optional(),
  league: z.string().max(120).optional(),
  email: z.string().email().max(200).optional(),
  phone: z.string().max(40).optional(),
  disciplines: z.array(z.enum(["football", "futsal", "football7"])).min(1).default(["football"]),
  interventionZones: z.array(z.string().max(20)).default([]),
  varQualified: z.boolean().default(false),
  yearsActive: z.number().int().min(0).max(60).default(0),
  bio: bioSchema.optional(),
});

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase())
    .slice(0, 3)
    .join("");

officials.post("/", staff, async (c) => {
  const actor = currentUser(c);
  const db = c.env.DB;
  const b = await readJson(c, createSchema);

  let country = b.countryCode;
  if (!isAdmin(actor)) {
    country ??= actor.country!;
    assertCountry(actor, country, "Country"); // another country: 404
    if (b.matricule) throw new ApiError(403, "forbidden", "The registration number is generated for you");
  } else if (!country) {
    throw new ApiError(422, "validation_failed", "countryCode is required", [{ path: "countryCode", message: "Choose the official's country" }]);
  }
  const known = await db.prepare("SELECT 1 AS x FROM countries WHERE code = ?").bind(country).first();
  if (!known) throw new ApiError(422, "unknown_country", "Unknown country code");

  const id = b.id ?? `off-${uuid().replace(/-/g, "").slice(0, 10)}`;
  const prefix = `ARIS-${country}-R`;
  const insert = () =>
    db
      .prepare(
        `INSERT INTO officials (id, kind, matricule, licence_no, name, initials, country_code, nationality, birth_date, city, region, league,
           intervention_zones, disciplines, email, phone, level, status, var_qualified, years_active, bio)
         VALUES (?, ?, COALESCE(?, ? || printf('%04d', (SELECT COALESCE(MAX(CAST(substr(matricule, ?) AS INTEGER)), 0) + 1 FROM officials WHERE matricule LIKE ?))),
                 ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id, b.kind, b.matricule ?? null, prefix, prefix.length + 1, `${prefix}%`,
        b.licenceNo ?? null, b.name, initialsOf(b.name), country, b.nationality ?? null, b.birthDate ?? null, b.city ?? null,
        b.region ?? null, b.league ?? null, JSON.stringify(b.interventionZones), JSON.stringify(b.disciplines), b.email ?? null,
        b.phone ?? null, b.level, b.status, b.varQualified ? 1 : 0, b.yearsActive, JSON.stringify(b.bio ?? { fr: "", en: "" }),
      );

  // two registrations in the same instant can draw the same number: the UNIQUE index refuses one, which simply tries again
  for (let attempt = 0; ; attempt++) {
    try {
      await db.batch([
        insert(),
        auditStmt(db, actor, { action: "official.create", entity: "official", entityId: id, after: { name: b.name, kind: b.kind, level: b.level }, countryCode: country, ip: c.get("ip") }),
      ]);
      break;
    } catch (err) {
      const m = String(err);
      if (m.includes("officials.matricule") && !b.matricule && attempt < 3) continue;
      if (m.includes("UNIQUE")) throw new ApiError(409, "duplicate", "An official with this id, matricule or licence number already exists");
      if (m.includes("FOREIGN KEY")) throw new ApiError(422, "unknown_country", "Unknown country code");
      throw err;
    }
  }
  const row = await db.prepare("SELECT * FROM officials WHERE id = ?").bind(id).first<OfficialRow>();
  return c.json({ official: toOfficialFile(row!, true) }, 201);
});

officials.get("/:id", async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const db = c.env.DB;
  await assertReadOfficial(db, user, id);
  const row = await db.prepare("SELECT * FROM officials WHERE id = ?").bind(id).first<OfficialRow>();
  if (!row) throw notFound("Official");
  const [licences, fitness, courses, docs, conflicts] = await db.batch<Record<string, unknown>>([
    db.prepare("SELECT id, kind, issued, expires FROM licences WHERE official_id = ? ORDER BY expires").bind(id),
    db.prepare("SELECT * FROM fitness_tests WHERE official_id = ?").bind(id),
    db.prepare("SELECT c.id, c.kind, c.name, c.provider, c.hours, c.state, e.completed_at AS completedAt FROM course_enrolments e JOIN courses c ON c.id = e.course_id WHERE e.official_id = ?").bind(id),
    db.prepare(
      `SELECT d.id, d.kind, m.filename, m.content_type AS contentType, m.size, d.status, d.expires_on AS expiresOn, d.created_at AS createdAt, d.media_id AS mediaId
         FROM documents d JOIN media_assets m ON m.id = d.media_id WHERE d.official_id = ? ORDER BY d.created_at DESC`,
    ).bind(id),
    db.prepare("SELECT id, kind, subject, note, declared_at AS declaredAt FROM conflicts_of_interest WHERE official_id = ?").bind(id),
  ]);
  return c.json({
    // the caller is the official or their federation / an admin (assertReadOfficial refused everyone else): the whole file
    official: toOfficialFile(row, true),
    licences: licences.results,
    fitness: fitness.results[0] ?? null,
    courses: (courses.results as Array<{ name: string }>).map((r) => ({ ...r, name: json(r.name, {}) })),
    documents: (docs.results as Array<{ mediaId: string }>).map((d) => ({ ...d, url: mediaUrl(d.mediaId) })),
    conflicts: conflicts.results,
  });
});

const patchSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    level: z.enum(LEVELS),
    status: z.enum(STATUSES),
    licenceNo: z.string().min(3).max(40).nullable(),
    nationality: z.string().max(60).nullable(),
    birthDate: DATE.nullable(),
    city: z.string().max(80).nullable(),
    region: z.string().max(80).nullable(),
    league: z.string().max(120).nullable(),
    email: z.string().email().max(200).nullable(),
    phone: z.string().max(40).nullable(),
    disciplines: z.array(z.enum(["football", "futsal", "football7"])).min(1),
    interventionZones: z.array(z.string().max(20)),
    varQualified: z.boolean(),
    yearsActive: z.number().int().min(0).max(60),
    bio: bioSchema,
  })
  .partial();

// What an official may change about their own file; everything else is the federation's.
const SELF_FIELDS = new Set(["email", "phone", "city", "region", "interventionZones"]);

const COLS: Record<string, string> = {
  name: "name", level: "level", status: "status", licenceNo: "licence_no", nationality: "nationality", birthDate: "birth_date",
  city: "city", region: "region", league: "league", email: "email", phone: "phone", varQualified: "var_qualified", yearsActive: "years_active",
};

officials.patch("/:id", async (c) => {
  const user = currentUser(c);
  const db = c.env.DB;
  const id = c.req.param("id");
  const access = await assertActFor(db, user, id);
  const body = await readJson(c, patchSchema);
  if (!isStaff(user)) {
    const forbiddenField = Object.keys(body).find((k) => !SELF_FIELDS.has(k));
    if (forbiddenField) throw new ApiError(403, "forbidden", `Only the federation can change "${forbiddenField}"`);
  }
  const before = await db.prepare("SELECT * FROM officials WHERE id = ?").bind(id).first<OfficialRow>();
  if (!before) throw notFound("Official");
  // A suspension is a disciplinary decision, never an edit — and it is lifted the same way.
  if (before.status === "suspended" && body.status) {
    throw new ApiError(409, "suspended", "This official is suspended by a disciplinary decision; the status changes with the case");
  }

  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  for (const [key, value] of Object.entries(body)) {
    if (key in COLS) {
      sets.push(`${COLS[key]} = ?`);
      args.push(typeof value === "boolean" ? (value ? 1 : 0) : (value as string | number | null));
    }
  }
  if (body.disciplines) (sets.push("disciplines = ?"), args.push(JSON.stringify(body.disciplines)));
  if (body.interventionZones) (sets.push("intervention_zones = ?"), args.push(JSON.stringify(body.interventionZones)));
  if (body.bio) (sets.push("bio = ?"), args.push(JSON.stringify(body.bio)));
  if (body.name) (sets.push("initials = ?"), args.push(initialsOf(body.name)));
  if (sets.length === 0) return c.json({ official: toOfficialFile(before, true) });
  sets.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')");

  try {
    await db.batch([
      db.prepare(`UPDATE officials SET ${sets.join(", ")} WHERE id = ?`).bind(...args, id),
      auditStmt(db, user, {
        action: "official.update",
        entity: "official",
        entityId: id,
        before: { name: before.name, level: before.level, status: before.status },
        after: body,
        countryCode: access.countryCode,
        ip: c.get("ip"),
      }),
    ]);
  } catch (err) {
    if (String(err).includes("UNIQUE")) throw new ApiError(409, "duplicate", "Another official already has this licence number");
    throw err;
  }
  const row = await db.prepare("SELECT * FROM officials WHERE id = ?").bind(id).first<OfficialRow>();
  return c.json({ official: toOfficialFile(row!, true) });
});

/* ------------------------------------------------------------------ *
 * Documents and the photo — files live in R2 (lib/media), the register keeps what each is for
 * ------------------------------------------------------------------ */

const DOC_KINDS = ["licence", "identity", "medical", "certificate", "attestation", "receipt", "photo", "other"] as const;

officials.post("/:id/documents", async (c) => {
  const user = currentUser(c);
  const db = c.env.DB;
  const id = c.req.param("id");
  const access = await assertActFor(db, user, id);
  const { upload, fields } = await readUpload(c);
  const kind = z.enum(DOC_KINDS).safeParse(fields.kind);
  if (!kind.success) throw new ApiError(422, "validation_failed", "kind must be one of " + DOC_KINDS.join(", "));
  const expiresOn = DATE.safeParse(fields.expiresOn).success ? fields.expiresOn : null;
  if (kind.data === "photo" && !upload.type.startsWith("image/")) throw new ApiError(415, "unsupported_type", "A photo must be an image");

  const docId = uuid();
  const isPhoto = kind.data === "photo";
  const current = isPhoto ? await db.prepare("SELECT photo_media_id FROM officials WHERE id = ?").bind(id).first<{ photo_media_id: string | null }>() : null;
  const mediaKind: MediaKind = isPhoto ? "photo" : kind.data === "receipt" ? "receipt" : "document";
  const media = await commitMedia(c.env, {
    upload,
    user,
    ip: c.get("ip"),
    kind: mediaKind,
    visibility: "private",
    ownerType: "official",
    ownerId: id,
    replaces: [current?.photo_media_id], // a new photo replaces the old one
    then: (mediaId) => [
      db.prepare("INSERT INTO documents (id, official_id, kind, media_id, expires_on, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)").bind(docId, id, kind.data, mediaId, expiresOn, user.id),
      ...(isPhoto ? [db.prepare("UPDATE officials SET photo_media_id = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").bind(mediaId, id)] : []),
    ],
    audit: { action: "document.upload", entity: "official", entityId: id, countryCode: access.countryCode, after: { documentId: docId, kind: kind.data } },
  });
  return c.json(
    { document: { id: docId, kind: kind.data, filename: upload.filename, contentType: upload.type, size: upload.bytes.length, status: "pending", expiresOn, mediaId: media.id, url: mediaUrl(media.id) } },
    201,
  );
});

// The photo is a private file of the official: it is served by /media/:id after the same access check.
officials.get("/:id/photo", async (c) => {
  const user = currentUser(c);
  const db = c.env.DB;
  const id = c.req.param("id");
  await assertReadOfficial(db, user, id);
  const row = await db.prepare("SELECT photo_media_id FROM officials WHERE id = ?").bind(id).first<{ photo_media_id: string | null }>();
  if (!row?.photo_media_id) throw notFound("Photo");
  return c.redirect(mediaUrl(row.photo_media_id)!, 302);
});

/* ------------------------------------------------------------------ *
 * Availability & conflicts of interest
 * ------------------------------------------------------------------ */

/**
 * Designations of an official whose LOCAL kickoff date (at the fixture's country) falls in [from, to].
 * Fixtures are stored in UTC, so the SQL window is widened by a day and the exact test is done on local dates.
 */
async function designationsBetween(db: D1Database, officialId: string, from: string, to: string, { includeDeclined = true } = {}) {
  const { results } = await db
    .prepare(
      `SELECT f.id AS fixtureId, f.kickoff_at AS kickoffAt, ht.name AS home, aw.name AS away, d.role, d.state, k.timezone AS tz
         FROM designations d
         JOIN fixtures f ON f.id = d.fixture_id
         JOIN teams ht ON ht.id = f.home_team_id
         JOIN teams aw ON aw.id = f.away_team_id
         LEFT JOIN countries k ON k.code = f.country_code
        WHERE d.official_id = ? AND f.date BETWEEN ? AND ? AND f.status <> 'cancelled' ${includeDeclined ? "" : "AND d.state <> 'declined'"}
        ORDER BY f.kickoff_at`,
    )
    .bind(officialId, shiftDay(from, -1), shiftDay(to, 1))
    .all<{ fixtureId: string; kickoffAt: string; home: string; away: string; role: string; state: string; tz: string | null }>();
  return results
    .map(({ tz, ...r }) => {
      const local = localParts(r.kickoffAt, tz ?? "UTC");
      return { ...r, date: local.date, kickoff: local.time };
    })
    .filter((r) => r.date >= from && r.date <= to);
}

const range = z.object({ from: DATE.default(() => today()), to: DATE.optional() });

officials.get("/:id/availability", async (c) => {
  const user = currentUser(c);
  const db = c.env.DB;
  const id = c.req.param("id");
  await assertActFor(db, user, id);
  const q = parseQuery(c, range);
  const to = q.to ?? shiftDay(q.from, 30);
  const [declared, assigned] = await Promise.all([
    db.prepare("SELECT date, state, reason, note FROM availability WHERE official_id = ? AND date BETWEEN ? AND ? ORDER BY date").bind(id, q.from, to).all(),
    designationsBetween(db, id, q.from, to),
  ]);
  return c.json({ from: q.from, to, declared: declared.results, designations: assigned });
});

const declareSchema = z.object({
  dates: z.array(DATE).min(1).max(62),
  state: z.enum(["unavailable", "travelling", "resting"]),
  reason: z.enum(["leave", "work", "injury", "other"]).optional(),
  note: z.string().max(300).optional(),
});

officials.put("/:id/availability", async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const db = c.env.DB;
  const access = await assertActFor(db, user, id);
  const b = await readJson(c, declareSchema);
  if (b.state === "unavailable" && !b.reason) throw new ApiError(422, "reason_required", "Say why you are unavailable (leave, work, injury or other)");

  const exists = await db.prepare("SELECT name FROM officials WHERE id = ?").bind(id).first<{ name: string }>();
  if (!exists) throw notFound("Official");

  // Declaring a day off that is already designated is allowed — but the federation must hear about it.
  const days = new Set(b.dates);
  const sorted = [...days].sort();
  const clashes = (await designationsBetween(db, id, sorted[0], sorted[sorted.length - 1], { includeDeclined: false })).filter((r) => days.has(r.date));

  const stmts = b.dates.map((date) =>
    db
      .prepare(
        `INSERT INTO availability (official_id, date, state, reason, note, declared_by) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (official_id, date) DO UPDATE SET state = excluded.state, reason = excluded.reason, note = excluded.note,
           declared_by = excluded.declared_by, declared_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
      )
      .bind(id, date, b.state, b.reason ?? null, b.note ?? null, user.id),
  );
  stmts.push(auditStmt(db, user, { action: "availability.declare", entity: "official", entityId: id, after: b, countryCode: access.countryCode, ip: c.get("ip") }));
  for (const clash of clashes) {
    stmts.push(
      ...notifyStmts(db, {
        audienceRole: "federation",
        countryCode: access.countryCode,
        dedupeKey: `avail-clash:${id}:${clash.fixtureId}:${b.dates.join(",")}`.slice(0, 200),
        title: { en: "Designated official now unavailable", fr: "Officiel désigné devenu indisponible" },
        detail: {
          en: `${exists.name} declared ${b.state} on ${clash.date}, but is ${clash.role} for ${clash.home} vs ${clash.away}.`,
          fr: `${exists.name} a déclaré une indisponibilité le ${clash.date}, mais est ${clash.role} pour ${clash.home} – ${clash.away}.`,
        },
        tone: "red",
        href: "/calendar",
      }),
    );
  }
  await db.batch(stmts);
  return c.json({ ok: true, declared: b.dates.length, conflicts: clashes });
});

officials.delete("/:id/availability/:date", async (c) => {
  const user = currentUser(c);
  const db = c.env.DB;
  const id = c.req.param("id");
  const access = await assertActFor(db, user, id);
  const date = c.req.param("date");
  if (!DATE.safeParse(date).success) throw new ApiError(422, "validation_failed", "date must be YYYY-MM-DD");
  // an official withdraws their own days off from today on; a past day is the record of what happened (staff may still correct it)
  if (!isStaff(user) && date < today()) throw new ApiError(409, "past_date", "A day that has passed can no longer be withdrawn");
  const declared = await db.prepare("SELECT state FROM availability WHERE official_id = ? AND date = ?").bind(id, date).first<{ state: string }>();
  if (!declared) throw notFound("Declared day");
  await db.batch([
    db.prepare("DELETE FROM availability WHERE official_id = ? AND date = ?").bind(id, date),
    auditStmt(db, user, { action: "availability.clear", entity: "official", entityId: id, before: { date, state: declared.state }, after: { date }, countryCode: access.countryCode, ip: c.get("ip") }),
  ]);
  return c.json({ ok: true });
});

const conflictSchema = z.object({ kind: z.enum(["club", "team", "country"]), subject: z.string().trim().min(2).max(80), note: z.string().max(300).optional() });

officials.post("/:id/conflicts", async (c) => {
  const user = currentUser(c);
  const db = c.env.DB;
  const id = c.req.param("id");
  const access = await assertActFor(db, user, id);
  const b = await readJson(c, conflictSchema);
  const cid = uuid();
  const subject = b.kind === "country" ? b.subject.toUpperCase() : b.subject;
  // the engine matches a country by its code: free text there would be stored and never block anything
  if (b.kind === "country" && !(await db.prepare("SELECT 1 AS x FROM countries WHERE code = ?").bind(subject).first())) {
    throw new ApiError(422, "unknown_country", "A country conflict names a country by its code");
  }
  try {
    await db.batch([
      db.prepare("INSERT INTO conflicts_of_interest (id, official_id, kind, subject, note) VALUES (?, ?, ?, ?, ?)").bind(cid, id, b.kind, subject, b.note ?? null),
      auditStmt(db, user, { action: "conflict.declare", entity: "official", entityId: id, after: { kind: b.kind, subject }, countryCode: access.countryCode, ip: c.get("ip") }),
    ]);
  } catch (err) {
    if (String(err).includes("UNIQUE")) throw new ApiError(409, "duplicate", "Already declared");
    throw err;
  }
  return c.json({ conflict: { id: cid, kind: b.kind, subject } }, 201);
});

// The official withdraws their own declaration; their federation (or an admin) may remove one too.
officials.delete("/:id/conflicts/:conflictId", async (c) => {
  const user = currentUser(c);
  const db = c.env.DB;
  const id = c.req.param("id");
  const conflictId = c.req.param("conflictId");
  const access = await assertActFor(db, user, id);
  const exists = await db.prepare("SELECT 1 AS x FROM conflicts_of_interest WHERE id = ? AND official_id = ?").bind(conflictId, id).first();
  if (!exists) throw notFound("Conflict");
  await db.batch([
    db.prepare("DELETE FROM conflicts_of_interest WHERE id = ? AND official_id = ?").bind(conflictId, id),
    auditStmt(db, user, { action: "conflict.remove", entity: "official", entityId: id, after: { conflictId }, countryCode: access.countryCode, ip: c.get("ip") }),
  ]);
  return c.json({ ok: true });
});
