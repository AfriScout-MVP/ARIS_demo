import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { ApiError, notFound, parseQuery, readJson, today, uuid } from "../lib/http";
import { auditStmt } from "../lib/audit";
import { assertActFor, assertReadOfficial, canActFor, canReadOfficial, isStaff } from "../lib/access";
import { currentUser, staff } from "../middleware/auth";
import { notifyStmts } from "../lib/notify";
import { json, toOfficialFile, type OfficialRow } from "../domain/mappers";

export const officials = new Hono<AppEnv>();

const LEVELS = ["CAF Elite", "FIFA Listed", "National D1", "Regional"] as const;
const STATUSES = ["active", "training", "elite-pool", "unavailable", "retired"] as const; // 'suspended' only comes from a disciplinary decision

const listQuery = z.object({
  kind: z.enum(["referee", "assistant"]).optional(),
  country: z.string().length(3).optional(),
  status: z.string().optional(),
  q: z.string().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
  offset: z.coerce.number().int().min(0).default(0),
});

officials.get("/", async (c) => {
  const user = currentUser(c);
  if (user.role === "referee") throw new ApiError(403, "forbidden", "Use /me for your own file");
  const q = parseQuery(c, listQuery);
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (q.kind) (where.push("kind = ?"), args.push(q.kind));
  if (q.country) (where.push("country_code = ?"), args.push(q.country.toUpperCase()));
  if (q.status) (where.push("status = ?"), args.push(q.status));
  if (q.q) (where.push("(name LIKE ? OR matricule LIKE ?)"), args.push(`%${q.q}%`, `%${q.q}%`));
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM officials ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY name LIMIT ? OFFSET ?`,
  )
    .bind(...args, q.limit, q.offset)
    .all<OfficialRow>();
  const full = isStaff(user);
  return c.json({ officials: results.map((r) => toOfficialFile(r, full)), limit: q.limit, offset: q.offset });
});

const createSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,60}$/, "Lower-case letters, digits and dashes"),
  kind: z.enum(["referee", "assistant"]),
  name: z.string().min(2).max(120),
  countryCode: z.string().length(3),
  level: z.enum(LEVELS),
  matricule: z.string().min(3).max(40).optional(),
  licenceNo: z.string().min(3).max(40).optional(),
  nationality: z.string().max(60).optional(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  city: z.string().max(80).optional(),
  region: z.string().max(80).optional(),
  league: z.string().max(120).optional(),
  email: z.string().email().max(200).optional(),
  phone: z.string().max(40).optional(),
  disciplines: z.array(z.enum(["football", "futsal", "football7"])).min(1).default(["football"]),
  interventionZones: z.array(z.string().max(20)).default([]),
  varQualified: z.boolean().default(false),
  yearsActive: z.number().int().min(0).max(60).default(0),
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
  const b = await readJson(c, createSchema);
  const matricule = b.matricule ?? `ARIS-${b.countryCode.toUpperCase()}-${Math.floor(100000 + Math.random() * 900000)}`;
  try {
    await c.env.DB.batch([
      c.env.DB
        .prepare(
          `INSERT INTO officials (id, kind, matricule, licence_no, name, initials, country_code, nationality, birth_date, city, region, league,
             intervention_zones, disciplines, email, phone, level, var_qualified, years_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          b.id, b.kind, matricule, b.licenceNo ?? null, b.name, initialsOf(b.name), b.countryCode.toUpperCase(), b.nationality ?? null,
          b.birthDate ?? null, b.city ?? null, b.region ?? null, b.league ?? null, JSON.stringify(b.interventionZones),
          JSON.stringify(b.disciplines), b.email ?? null, b.phone ?? null, b.level, b.varQualified ? 1 : 0, b.yearsActive,
        ),
      auditStmt(c.env.DB, actor, { action: "official.create", entity: "official", entityId: b.id, after: { name: b.name, kind: b.kind, matricule }, ip: c.get("ip") }),
    ]);
  } catch (err) {
    const m = String(err);
    if (m.includes("UNIQUE")) throw new ApiError(409, "duplicate", "An official with this id, matricule or licence number already exists");
    if (m.includes("FOREIGN KEY")) throw new ApiError(422, "unknown_country", "Unknown country code");
    throw err;
  }
  const row = await c.env.DB.prepare("SELECT * FROM officials WHERE id = ?").bind(b.id).first<OfficialRow>();
  return c.json({ official: toOfficialFile(row!, true) }, 201);
});

officials.get("/:id", async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  assertReadOfficial(user, id);
  const db = c.env.DB;
  const row = await db.prepare("SELECT * FROM officials WHERE id = ?").bind(id).first<OfficialRow>();
  if (!row) throw notFound("Official");
  const full = canActFor(user, id);
  const [licences, fitness, courses, docs, conflicts] = await db.batch<Record<string, unknown>>([
    db.prepare("SELECT id, kind, issued, expires FROM licences WHERE official_id = ? ORDER BY expires").bind(id),
    db.prepare("SELECT * FROM fitness_tests WHERE official_id = ?").bind(id),
    db.prepare("SELECT c.id, c.kind, c.name, c.provider, c.hours, c.state, e.completed_at AS completedAt FROM course_enrolments e JOIN courses c ON c.id = e.course_id WHERE e.official_id = ?").bind(id),
    db.prepare("SELECT id, kind, filename, content_type AS contentType, size, status, expires_on AS expiresOn, created_at AS createdAt FROM documents WHERE official_id = ? ORDER BY created_at DESC").bind(id),
    db.prepare("SELECT id, kind, subject, note, declared_at AS declaredAt FROM conflicts_of_interest WHERE official_id = ?").bind(id),
  ]);
  return c.json({
    official: toOfficialFile(row, full),
    licences: licences.results,
    fitness: fitness.results[0] ?? null,
    courses: (courses.results as Array<{ name: string }>).map((r) => ({ ...r, name: json(r.name, {}) })),
    // personal papers and declared conflicts: the commission and the official only
    documents: full ? docs.results : [],
    conflicts: full ? conflicts.results : [],
  });
});

const patchSchema = z
  .object({
    name: z.string().min(2).max(120),
    level: z.enum(LEVELS),
    status: z.enum(STATUSES),
    licenceNo: z.string().min(3).max(40).nullable(),
    nationality: z.string().max(60).nullable(),
    birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    city: z.string().max(80).nullable(),
    region: z.string().max(80).nullable(),
    league: z.string().max(120).nullable(),
    email: z.string().email().max(200).nullable(),
    phone: z.string().max(40).nullable(),
    disciplines: z.array(z.enum(["football", "futsal", "football7"])).min(1),
    interventionZones: z.array(z.string().max(20)),
    varQualified: z.boolean(),
    yearsActive: z.number().int().min(0).max(60),
    bio: z.object({ en: z.string().max(1000), fr: z.string().max(1000) }),
  })
  .partial();

// What an official may change about their own file; everything else is the commission's.
const SELF_FIELDS = new Set(["email", "phone", "city", "region", "interventionZones"]);

const COLS: Record<string, string> = {
  name: "name", level: "level", status: "status", licenceNo: "licence_no", nationality: "nationality", birthDate: "birth_date",
  city: "city", region: "region", league: "league", email: "email", phone: "phone", varQualified: "var_qualified", yearsActive: "years_active",
};

officials.patch("/:id", async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  assertActFor(user, id);
  const body = await readJson(c, patchSchema);
  const touched = Object.keys(body);
  if (!isStaff(user)) {
    const forbiddenField = touched.find((k) => !SELF_FIELDS.has(k));
    if (forbiddenField) throw new ApiError(403, "forbidden", `Only the commission can change "${forbiddenField}"`);
  }
  const before = await c.env.DB.prepare("SELECT * FROM officials WHERE id = ?").bind(id).first<OfficialRow>();
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
  if (body.bio) (sets.push("bio_en = ?", "bio_fr = ?"), args.push(body.bio.en, body.bio.fr));
  if (body.name) (sets.push("initials = ?"), args.push(initialsOf(body.name)));
  if (sets.length === 0) return c.json({ official: toOfficialFile(before, true) });
  sets.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')");

  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE officials SET ${sets.join(", ")} WHERE id = ?`).bind(...args, id),
    auditStmt(c.env.DB, user, { action: "official.update", entity: "official", entityId: id, before: { name: before.name, level: before.level, status: before.status }, after: body, ip: c.get("ip") }),
  ]);
  const row = await c.env.DB.prepare("SELECT * FROM officials WHERE id = ?").bind(id).first<OfficialRow>();
  return c.json({ official: toOfficialFile(row!, true) });
});

/* ------------------------------------------------------------------ *
 * Documents — files live in R2, the register keeps their metadata
 * ------------------------------------------------------------------ */

const MAX_BYTES = 8 * 1024 * 1024;

/** The kinds of file we accept, identified by their leading bytes — not by what the client claims. */
function sniff(bytes: Uint8Array): { type: string; ext: string } | null {
  const startsWith = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (startsWith(0x25, 0x50, 0x44, 0x46)) return { type: "application/pdf", ext: "pdf" };
  if (startsWith(0x89, 0x50, 0x4e, 0x47)) return { type: "image/png", ext: "png" };
  if (startsWith(0xff, 0xd8, 0xff)) return { type: "image/jpeg", ext: "jpg" };
  if (startsWith(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45) return { type: "image/webp", ext: "webp" };
  return null;
}

const DOC_KINDS = ["licence", "identity", "medical", "certificate", "attestation", "receipt", "photo", "other"] as const;

officials.post("/:id/documents", async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  assertActFor(user, id);
  if (!c.env.MEDIA) throw new ApiError(503, "storage_unavailable", "Media storage is not configured");

  const form = await c.req.parseBody();
  const file = form.file;
  if (!(file instanceof File)) throw new ApiError(422, "file_required", "Send the file in a multipart field named 'file'");
  const kind = z.enum(DOC_KINDS).safeParse(form.kind);
  if (!kind.success) throw new ApiError(422, "validation_failed", "kind must be one of " + DOC_KINDS.join(", "));
  const expiresOn = typeof form.expiresOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(form.expiresOn) ? form.expiresOn : null;

  if (file.size === 0) throw new ApiError(422, "empty_file", "The file is empty");
  if (file.size > MAX_BYTES) throw new ApiError(413, "too_large", "Files are limited to 8 MB");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const detected = sniff(bytes);
  if (!detected) throw new ApiError(415, "unsupported_type", "Only PDF, PNG, JPEG and WebP files are accepted");
  if (kind.data === "photo" && !detected.type.startsWith("image/")) {
    throw new ApiError(415, "unsupported_type", "A photo must be an image");
  }

  const docId = uuid();
  const key = `officials/${id}/${docId}.${detected.ext}`;
  const filename = file.name.replace(/[^\w.\- ()]/g, "_").slice(0, 120) || `document.${detected.ext}`;

  await c.env.MEDIA.put(key, bytes, { httpMetadata: { contentType: detected.type }, customMetadata: { officialId: id, uploadedBy: user.id } });
  const stmts = [
    c.env.DB
      .prepare("INSERT INTO documents (id, official_id, kind, r2_key, filename, content_type, size, expires_on, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(docId, id, kind.data, key, filename, detected.type, bytes.length, expiresOn, user.id),
    auditStmt(c.env.DB, user, { action: "document.upload", entity: "official", entityId: id, after: { documentId: docId, kind: kind.data, filename }, ip: c.get("ip") }),
  ];
  if (kind.data === "photo") stmts.push(c.env.DB.prepare("UPDATE officials SET photo_key = ? WHERE id = ?").bind(key, id));
  try {
    await c.env.DB.batch(stmts);
  } catch (err) {
    await c.env.MEDIA.delete(key); // never leave an orphan in the bucket
    if (String(err).includes("FOREIGN KEY")) throw notFound("Official");
    throw err;
  }
  return c.json({ document: { id: docId, kind: kind.data, filename, contentType: detected.type, size: bytes.length, status: "pending", expiresOn } }, 201);
});

officials.get("/:id/photo", async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  assertReadOfficial(user, id);
  const row = await c.env.DB.prepare("SELECT photo_key FROM officials WHERE id = ?").bind(id).first<{ photo_key: string | null }>();
  if (!row?.photo_key) throw notFound("Photo");
  const obj = await c.env.MEDIA.get(row.photo_key);
  if (!obj) throw notFound("Photo");
  return new Response(obj.body, { headers: { "content-type": obj.httpMetadata?.contentType ?? "image/jpeg", "cache-control": "private, max-age=300", "x-content-type-options": "nosniff" } });
});

/* ------------------------------------------------------------------ *
 * Availability & conflicts of interest
 * ------------------------------------------------------------------ */

const range = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default(() => today()),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

officials.get("/:id/availability", async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  assertActFor(user, id);
  const q = parseQuery(c, range);
  const to = q.to ?? new Date(new Date(`${q.from}T12:00:00Z`).getTime() + 30 * 86_400_000).toISOString().slice(0, 10);
  const [declared, assigned] = await c.env.DB.batch<Record<string, unknown>>([
    c.env.DB.prepare("SELECT date, state, reason, note FROM availability WHERE official_id = ? AND date BETWEEN ? AND ? ORDER BY date").bind(id, q.from, to),
    c.env.DB.prepare(
      `SELECT f.date, f.id AS fixtureId, f.home, f.away, d.role, d.state FROM designations d JOIN fixtures f ON f.id = d.fixture_id
        WHERE d.official_id = ? AND f.date BETWEEN ? AND ? ORDER BY f.date`,
    ).bind(id, q.from, to),
  ]);
  return c.json({ from: q.from, to, declared: declared.results, designations: assigned.results });
});

const declareSchema = z.object({
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1).max(62),
  state: z.enum(["unavailable", "travelling", "resting"]),
  reason: z.enum(["leave", "work", "injury", "other"]).optional(),
  note: z.string().max(300).optional(),
});

officials.put("/:id/availability", async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  assertActFor(user, id);
  const b = await readJson(c, declareSchema);
  const db = c.env.DB;
  if (b.state === "unavailable" && !b.reason) throw new ApiError(422, "reason_required", "Say why you are unavailable (leave, work, injury or other)");

  const exists = await db.prepare("SELECT name FROM officials WHERE id = ?").bind(id).first<{ name: string }>();
  if (!exists) throw notFound("Official");

  // Declaring a day off that is already designated is allowed — but the commission must hear about it.
  const marksList = b.dates.map(() => "?").join(", ");
  const { results: clashes } = await db
    .prepare(
      `SELECT f.id AS fixtureId, f.date, f.home, f.away, d.role FROM designations d JOIN fixtures f ON f.id = d.fixture_id
        WHERE d.official_id = ? AND d.state <> 'declined' AND f.date IN (${marksList})`,
    )
    .bind(id, ...b.dates)
    .all<{ fixtureId: string; date: string; home: string; away: string; role: string }>();

  const stmts = b.dates.map((date) =>
    db
      .prepare(
        `INSERT INTO availability (official_id, date, state, reason, note, declared_by) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (official_id, date) DO UPDATE SET state = excluded.state, reason = excluded.reason, note = excluded.note,
           declared_by = excluded.declared_by, declared_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
      )
      .bind(id, date, b.state, b.reason ?? null, b.note ?? null, user.id),
  );
  stmts.push(auditStmt(db, user, { action: "availability.declare", entity: "official", entityId: id, after: b, ip: c.get("ip") }));
  for (const clash of clashes) {
    stmts.push(
      ...notifyStmts(db, {
        audienceRole: "commission",
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
  const id = c.req.param("id");
  assertActFor(user, id);
  const date = c.req.param("date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ApiError(422, "validation_failed", "date must be YYYY-MM-DD");
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM availability WHERE official_id = ? AND date = ?").bind(id, date),
    auditStmt(c.env.DB, user, { action: "availability.clear", entity: "official", entityId: id, after: { date }, ip: c.get("ip") }),
  ]);
  return c.json({ ok: true });
});

const conflictSchema = z.object({ kind: z.enum(["club", "team", "country"]), subject: z.string().min(2).max(80), note: z.string().max(300).optional() });

officials.post("/:id/conflicts", async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  assertActFor(user, id);
  const b = await readJson(c, conflictSchema);
  const cid = uuid();
  const subject = b.kind === "country" ? b.subject.toUpperCase() : b.subject.trim();
  try {
    await c.env.DB.batch([
      c.env.DB.prepare("INSERT INTO conflicts_of_interest (id, official_id, kind, subject, note) VALUES (?, ?, ?, ?, ?)").bind(cid, id, b.kind, subject, b.note ?? null),
      auditStmt(c.env.DB, user, { action: "conflict.declare", entity: "official", entityId: id, after: { kind: b.kind, subject }, ip: c.get("ip") }),
    ]);
  } catch (err) {
    if (String(err).includes("UNIQUE")) throw new ApiError(409, "duplicate", "Already declared");
    if (String(err).includes("FOREIGN KEY")) throw notFound("Official");
    throw err;
  }
  return c.json({ conflict: { id: cid, kind: b.kind, subject } }, 201);
});

officials.delete("/:id/conflicts/:conflictId", staff, async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM conflicts_of_interest WHERE id = ? AND official_id = ?").bind(c.req.param("conflictId"), id),
    auditStmt(c.env.DB, user, { action: "conflict.remove", entity: "official", entityId: id, after: { conflictId: c.req.param("conflictId") }, ip: c.get("ip") }),
  ]);
  return c.json({ ok: true });
});

export { canReadOfficial };
