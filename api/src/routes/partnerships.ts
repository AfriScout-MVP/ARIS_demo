import { Hono } from "hono";
import { z } from "zod";
import { LOCALES, type AppEnv } from "../env";
import { ApiError, notFound, parseQuery, readJson, today, uuid } from "../lib/http";
import { hashPassword } from "../lib/crypto";
import { auditStmt } from "../lib/audit";
import { currentUser, requireRole } from "../middleware/auth";
import { passwordSchema } from "./auth";

/**
 * The partnership pipeline — the federations ARIS is in talks with, from first contact to a signed agreement and the
 * federation's first seat. Administrators only: until it is onboarded a prospect is nobody's federation.
 *
 *   prospect · contacted · negotiating · on_hold   open stages; any open stage may move to any other
 *   agreement_signed                               from negotiating, with the agreement's reference and date
 *   onboarded                                      only through POST /:id/onboard
 *   declined                                       from any stage but onboarded, with a reason
 *
 * A declined or onboarded partnership is closed; POST /:id/reopen puts it back into talks (a fresh approach after a
 * refusal, or a renegotiation with a federation already on ARIS). DELETE /:id removes an entry made by mistake.
 */
export const partnerships = new Hono<AppEnv>();
partnerships.use("*", requireRole("admin"));

export const STAGES = ["prospect", "contacted", "negotiating", "on_hold", "agreement_signed", "onboarded", "declined"] as const;
export type Stage = (typeof STAGES)[number];
const OPEN: readonly Stage[] = ["prospect", "contacted", "negotiating", "on_hold"];
/** Stages a partnership may be moved to by hand from each stage (onboarding has its own endpoint). */
export const MOVES: Record<Stage, readonly Stage[]> = {
  prospect: ["contacted", "negotiating", "on_hold", "declined"],
  contacted: ["prospect", "negotiating", "on_hold", "declined"],
  negotiating: ["prospect", "contacted", "on_hold", "agreement_signed", "declined"],
  on_hold: ["prospect", "contacted", "negotiating", "declined"],
  agreement_signed: ["negotiating", "on_hold", "declined"],
  onboarded: [],
  declined: [],
};

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const optionalText = (max: number) => z.string().trim().max(max).transform((v) => v || null).nullable();
const codeSchema = z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9-]{1,19}$/, "2-20 letters, digits or dashes");

const SELECT = `SELECT p.id, p.country, c.name AS countryName, c.name_fr AS countryNameFr, c.flag, c.zone, c.active AS countryActive,
       p.federation_name AS federationName, p.federation_code AS federationCode, p.stage, p.priority,
       p.contact_name AS contactName, p.contact_role AS contactRole, p.contact_email AS contactEmail, p.contact_phone AS contactPhone,
       p.owner_user_id AS ownerId, u.name AS ownerName, p.next_step AS nextStep, p.next_step_due AS nextStepDue,
       p.officials_estimate AS officialsEstimate, p.agreement_reference AS agreementReference, p.agreement_signed_on AS agreementSignedOn,
       p.declined_reason AS declinedReason, p.federation_id AS federationId, p.source, p.created_at AS createdAt, p.updated_at AS updatedAt,
       (SELECT MAX(e.occurred_on) FROM partnership_events e WHERE e.partnership_id = p.id AND e.kind <> 'stage') AS lastContactOn,
       (SELECT COUNT(*) FROM partnership_events e WHERE e.partnership_id = p.id) AS events
  FROM partnerships p
  JOIN countries c ON c.code = p.country
  LEFT JOIN users u ON u.id = p.owner_user_id`;

interface Row {
  id: string;
  stage: Stage;
  country: string;
  countryActive: number;
  federationName: string;
  federationCode: string | null;
  nextStepDue: string | null;
  agreementReference: string | null;
  federationId: string | null;
  [k: string]: unknown;
}

const present = (r: Row, t = today()) => ({
  ...r,
  countryActive: r.countryActive === 1,
  overdue: OPEN.includes(r.stage) || r.stage === "agreement_signed" ? r.nextStepDue !== null && r.nextStepDue < t : false,
});

async function load(db: D1Database, id: string) {
  const row = await db.prepare(`${SELECT} WHERE p.id = ?`).bind(id).first<Row>();
  if (!row) throw notFound("Partnership");
  return row;
}

async function assertOwner(db: D1Database, ownerId: string | null | undefined) {
  if (!ownerId) return;
  const u = await db.prepare("SELECT role, active FROM users WHERE id = ?").bind(ownerId).first<{ role: string; active: number }>();
  if (!u || u.role !== "admin" || u.active !== 1) throw new ApiError(422, "invalid_owner", "The owner must be an active administrator");
}

const eventStmt = (db: D1Database, p: { id: string; kind: string; body?: string | null; from?: string | null; to?: string | null; on?: string; actor: string }) =>
  db
    .prepare("INSERT INTO partnership_events (partnership_id, kind, body, from_stage, to_stage, occurred_on, actor_user_id) VALUES (?, ?, ?, ?, ?, COALESCE(?, strftime('%Y-%m-%d','now')), ?)")
    .bind(p.id, p.kind, p.body ?? null, p.from ?? null, p.to ?? null, p.on ?? null, p.actor);

const touch = (db: D1Database, id: string) => db.prepare("UPDATE partnerships SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").bind(id);

const listQuery = z.object({
  stage: z.enum(STAGES).optional(),
  q: z.string().trim().max(80).optional(),
  owner: z.string().max(80).optional(),
});

partnerships.get("/", async (c) => {
  const q = parseQuery(c, listQuery);
  const where: string[] = [];
  const args: string[] = [];
  if (q.stage) (where.push("p.stage = ?"), args.push(q.stage));
  if (q.owner) (where.push("p.owner_user_id = ?"), args.push(q.owner));
  if (q.q) {
    const like = `%${q.q.replace(/[\\%_]/g, "\\$&")}%`;
    const fields = ["p.federation_name", "p.federation_code", "c.name", "c.name_fr", "p.contact_name"];
    where.push(`(${fields.map((f) => `${f} LIKE ? ESCAPE '\\'`).join(" OR ")} OR p.country = ?)`);
    args.push(...fields.map(() => like), q.q.toUpperCase());
  }
  const db = c.env.DB;
  const [{ results }, { results: counts }] = await db.batch<Record<string, unknown>>([
    db.prepare(`${SELECT} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY CASE p.priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END, p.next_step_due IS NULL, p.next_step_due, p.updated_at DESC`).bind(...args),
    db.prepare("SELECT stage, COUNT(*) AS n, COALESCE(SUM(officials_estimate), 0) AS officials FROM partnerships GROUP BY stage"),
  ]);
  const t = today();
  const stages = Object.fromEntries(STAGES.map((s) => [s, { count: 0, officials: 0 }]));
  for (const r of counts as Array<{ stage: Stage; n: number; officials: number }>) stages[r.stage] = { count: r.n, officials: r.officials };
  return c.json({ partnerships: (results as unknown as Row[]).map((r) => present(r, t)), stages });
});

const createSchema = z.object({
  country: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  federationName: z.string().trim().min(2).max(160),
  federationCode: codeSchema.nullable().optional(),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
  contactName: optionalText(120).optional(),
  contactRole: optionalText(120).optional(),
  contactEmail: z.string().trim().toLowerCase().email().max(200).nullable().optional(),
  contactPhone: z.string().trim().regex(/^\+?[0-9 ()-]{6,30}$/, "A phone number").nullable().optional(),
  ownerId: z.string().max(80).nullable().optional(),
  nextStep: optionalText(240).optional(),
  nextStepDue: DATE.nullable().optional(),
  officialsEstimate: z.number().int().min(0).max(100_000).nullable().optional(),
  note: z.string().trim().min(1).max(2000).optional(),
});

partnerships.post("/", async (c) => {
  const actor = currentUser(c);
  const db = c.env.DB;
  const b = await readJson(c, createSchema);

  const country = await db.prepare("SELECT code FROM countries WHERE code = ?").bind(b.country).first();
  if (!country) throw new ApiError(422, "unknown_country", "Add the country to the list first (it can stay inactive)");
  const fed = await db.prepare("SELECT 1 AS x FROM federations WHERE country = ?").bind(b.country).first();
  if (fed) throw new ApiError(409, "already_partner", "This country already has a federation on ARIS");
  const open = await db.prepare("SELECT id FROM partnerships WHERE country = ? AND stage <> 'declined'").bind(b.country).first<{ id: string }>();
  if (open) throw new ApiError(409, "partnership_exists", "There is already an open partnership with this country", { id: open.id });
  const ownerId = b.ownerId === undefined ? actor.id : b.ownerId;
  await assertOwner(db, ownerId);

  const id = uuid();
  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO partnerships (id, country, federation_name, federation_code, priority, contact_name, contact_role, contact_email, contact_phone,
                                     owner_user_id, next_step, next_step_due, officials_estimate)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id, b.country, b.federationName, b.federationCode ?? null, b.priority, b.contactName ?? null, b.contactRole ?? null, b.contactEmail ?? null,
          b.contactPhone ?? null, ownerId, b.nextStep ?? null, b.nextStepDue ?? null, b.officialsEstimate ?? null,
        ),
      eventStmt(db, { id, kind: "stage", to: "prospect", actor: actor.id }),
      ...(b.note ? [eventStmt(db, { id, kind: "note", body: b.note, actor: actor.id })] : []),
      auditStmt(db, actor, { action: "partnership.create", entity: "partnership", entityId: id, after: b, countryCode: b.country, ip: c.get("ip") }),
    ]);
  } catch (err) {
    if (String(err).includes("UNIQUE")) throw new ApiError(409, "partnership_exists", "There is already an open partnership with this country");
    throw err;
  }
  return c.json({ partnership: present(await load(db, id)) }, 201);
});

partnerships.get("/:id", async (c) => {
  const db = c.env.DB;
  const row = await load(db, c.req.param("id"));
  const { results } = await db
    .prepare(
      `SELECT e.id, e.kind, e.body, e.from_stage AS fromStage, e.to_stage AS toStage, e.occurred_on AS occurredOn, e.created_at AS createdAt,
              e.actor_user_id AS actorId, u.name AS actorName
         FROM partnership_events e LEFT JOIN users u ON u.id = e.actor_user_id
        WHERE e.partnership_id = ? ORDER BY e.occurred_on DESC, e.id DESC LIMIT 200`,
    )
    .bind(row.id)
    .all();
  return c.json({ partnership: present(row), events: results, moves: MOVES[row.stage] });
});

const patchSchema = createSchema
  .omit({ country: true, note: true, priority: true })
  .extend({ priority: z.enum(["low", "normal", "high"]) })
  .partial()
  .refine((x) => Object.keys(x).length > 0, "Nothing to change");

const COLUMN: Record<string, string> = {
  federationName: "federation_name",
  federationCode: "federation_code",
  priority: "priority",
  contactName: "contact_name",
  contactRole: "contact_role",
  contactEmail: "contact_email",
  contactPhone: "contact_phone",
  ownerId: "owner_user_id",
  nextStep: "next_step",
  nextStepDue: "next_step_due",
  officialsEstimate: "officials_estimate",
};

partnerships.patch("/:id", async (c) => {
  const actor = currentUser(c);
  const db = c.env.DB;
  const id = c.req.param("id");
  const b = await readJson(c, patchSchema);
  const before = await load(db, id);
  if (before.stage === "onboarded" || before.stage === "declined") throw new ApiError(409, "partnership_closed", `A ${before.stage} partnership can no longer be edited`);
  if (b.ownerId !== undefined) await assertOwner(db, b.ownerId);

  const sets: string[] = [];
  const args: Array<string | number | null> = [];
  for (const [key, value] of Object.entries(b)) {
    sets.push(`${COLUMN[key]} = ?`);
    args.push((value as string | number | null | undefined) ?? null);
  }
  await db.batch([
    db.prepare(`UPDATE partnerships SET ${sets.join(", ")}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).bind(...args, id),
    auditStmt(db, actor, { action: "partnership.update", entity: "partnership", entityId: id, after: b, countryCode: before.country, ip: c.get("ip") }),
  ]);
  return c.json({ partnership: present(await load(db, id)) });
});

const stageSchema = z.object({
  stage: z.enum(STAGES),
  /** Why — required to decline, kept on the timeline otherwise. */
  reason: z.string().trim().min(3).max(1000).optional(),
  agreementReference: z.string().trim().min(2).max(120).optional(),
  agreementSignedOn: DATE.optional(),
});

partnerships.post("/:id/stage", async (c) => {
  const actor = currentUser(c);
  const db = c.env.DB;
  const id = c.req.param("id");
  const b = await readJson(c, stageSchema);
  const p = await load(db, id);
  if (b.stage === p.stage) return c.json({ partnership: present(p) });
  // a renegotiation with a federation that is already on ARIS closes again without creating anything
  const renewal = b.stage === "onboarded" && p.stage === "agreement_signed" && !!p.federationId;
  if (b.stage === "onboarded" && !renewal) throw new ApiError(409, "use_onboard", "Onboard the federation with POST /partnerships/:id/onboard");
  if (!renewal && !MOVES[p.stage].includes(b.stage)) throw new ApiError(409, "bad_transition", `A ${p.stage} partnership cannot move to ${b.stage}`, { allowed: MOVES[p.stage] });

  const sets = ["stage = ?"];
  const args: Array<string | null> = [b.stage];
  if (b.stage === "agreement_signed") {
    const reference = b.agreementReference ?? p.agreementReference;
    if (!reference) throw new ApiError(422, "agreement_required", "Give the agreement's reference");
    if (b.agreementSignedOn && b.agreementSignedOn > today()) throw new ApiError(422, "future_date", "An agreement cannot be signed in the future");
    sets.push("agreement_reference = ?", "agreement_signed_on = ?");
    args.push(reference, b.agreementSignedOn ?? today());
  }
  if (b.stage === "declined") {
    if (!b.reason) throw new ApiError(422, "reason_required", "Say why the partnership is declined");
    sets.push("declined_reason = ?", "next_step = NULL", "next_step_due = NULL");
    args.push(b.reason);
  }

  await db.batch([
    db.prepare(`UPDATE partnerships SET ${sets.join(", ")}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND stage = ?`).bind(...args, id, p.stage),
    eventStmt(db, { id, kind: "stage", body: b.reason ?? null, from: p.stage, to: b.stage, actor: actor.id }),
    auditStmt(db, actor, { action: `partnership.${b.stage}`, entity: "partnership", entityId: id, before: { stage: p.stage }, after: { stage: b.stage }, reason: b.reason, countryCode: p.country, ip: c.get("ip") }),
  ]);
  return c.json({ partnership: present(await load(db, id)) });
});

const eventSchema = z.object({
  kind: z.enum(["note", "call", "email", "meeting"]),
  body: z.string().trim().min(1).max(2000),
  occurredOn: DATE.optional(),
  /** Optionally set the next step in the same go — what a call usually ends with. */
  nextStep: optionalText(240).optional(),
  nextStepDue: DATE.nullable().optional(),
});

partnerships.post("/:id/events", async (c) => {
  const actor = currentUser(c);
  const db = c.env.DB;
  const id = c.req.param("id");
  const b = await readJson(c, eventSchema);
  const p = await load(db, id);
  if (b.occurredOn && b.occurredOn > today()) throw new ApiError(422, "future_date", "Log what has happened; plan what is next as the next step");
  const nextChanges = b.nextStep !== undefined || b.nextStepDue !== undefined;
  if (nextChanges && (p.stage === "onboarded" || p.stage === "declined")) throw new ApiError(409, "partnership_closed", `A ${p.stage} partnership has no next step`);
  await db.batch([
    eventStmt(db, { id, kind: b.kind, body: b.body, on: b.occurredOn, actor: actor.id }),
    nextChanges
      ? db
          .prepare(
            "UPDATE partnerships SET next_step = CASE WHEN ?1 THEN ?2 ELSE next_step END, next_step_due = CASE WHEN ?3 THEN ?4 ELSE next_step_due END, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?5",
          )
          .bind(b.nextStep !== undefined ? 1 : 0, b.nextStep ?? null, b.nextStepDue !== undefined ? 1 : 0, b.nextStepDue ?? null, id)
      : touch(db, id),
    auditStmt(db, actor, { action: "partnership.log", entity: "partnership", entityId: id, after: { kind: b.kind }, countryCode: p.country, ip: c.get("ip") }),
  ]);
  return c.json({ partnership: present(await load(db, id)) }, 201);
});

const onboardSchema = z.object({
  /** The federation as it will exist on ARIS — defaults to what the pipeline recorded. */
  code: codeSchema.optional(),
  name: z.string().trim().min(2).max(120).optional(),
  /** Its first seat: the person who will run the federation's space. */
  seat: z.object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().toLowerCase().email().max(200),
    locale: z.enum(LOCALES as [string, ...string[]]).default("fr"),
    password: passwordSchema,
  }),
});

/**
 * The agreement is signed: switch the country on, create the federation and its first seat, and close the pipeline
 * entry — all in one batch, so a clash on any of them leaves nothing half-created.
 */
partnerships.post("/:id/onboard", async (c) => {
  const actor = currentUser(c);
  const db = c.env.DB;
  const id = c.req.param("id");
  const b = await readJson(c, onboardSchema);
  const p = await load(db, id);
  if (p.stage !== "agreement_signed") throw new ApiError(409, "not_signed", "Only a partnership with a signed agreement can be onboarded");
  const code = b.code ?? p.federationCode;
  if (!code) throw new ApiError(422, "code_required", "Give the federation's code");
  const name = b.name ?? p.federationName;

  const [fedClash, codeClash, emailClash] = await db.batch<Record<string, unknown>>([
    db.prepare("SELECT 1 AS x FROM federations WHERE country = ?").bind(p.country),
    db.prepare("SELECT 1 AS x FROM federations WHERE code = ? COLLATE NOCASE").bind(code),
    db.prepare("SELECT 1 AS x FROM users WHERE email = ? COLLATE NOCASE").bind(b.seat.email),
  ]);
  if (fedClash.results.length) throw new ApiError(409, "federation_exists", "This country already has a federation");
  if (codeClash.results.length) throw new ApiError(409, "federation_code_taken", "A federation with this code already exists");
  if (emailClash.results.length) throw new ApiError(409, "email_taken", "An account with this e-mail already exists");

  const fedId = uuid();
  const userId = uuid();
  const ip = c.get("ip");
  try {
    await db.batch([
      db.prepare("UPDATE countries SET active = 1 WHERE code = ?").bind(p.country),
      db.prepare("INSERT INTO federations (id, code, name, country, agreement_reference) VALUES (?, ?, ?, ?, ?)").bind(fedId, code, name, p.country, p.agreementReference),
      db
        .prepare("INSERT INTO users (id, email, name, role, federation_id, locale, password_hash, must_change_password) VALUES (?, ?, ?, 'federation', ?, ?, ?, 1)")
        .bind(userId, b.seat.email, b.seat.name, fedId, b.seat.locale, await hashPassword(b.seat.password)),
      db
        .prepare(
          "UPDATE partnerships SET stage = 'onboarded', federation_id = ?, federation_code = ?, federation_name = ?, next_step = NULL, next_step_due = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND stage = 'agreement_signed'",
        )
        .bind(fedId, code, name, id),
      eventStmt(db, { id, kind: "stage", from: "agreement_signed", to: "onboarded", body: `${code} · ${b.seat.email}`, actor: actor.id }),
      ...(p.countryActive === 1 ? [] : [auditStmt(db, actor, { action: "country.activate", entity: "country", entityId: p.country, countryCode: p.country, ip })]),
      auditStmt(db, actor, { action: "federation.create", entity: "federation", entityId: fedId, after: { code, name, country: p.country, partnershipId: id }, countryCode: p.country, ip }),
      auditStmt(db, actor, { action: "user.create", entity: "user", entityId: userId, after: { email: b.seat.email, role: "federation", federationId: fedId }, countryCode: p.country, ip }),
      auditStmt(db, actor, { action: "partnership.onboarded", entity: "partnership", entityId: id, after: { federationId: fedId }, countryCode: p.country, ip }),
    ]);
  } catch (err) {
    const text = String(err);
    if (text.includes("users.email")) throw new ApiError(409, "email_taken", "An account with this e-mail already exists");
    if (text.includes("federations.code")) throw new ApiError(409, "federation_code_taken", "A federation with this code already exists");
    if (text.includes("federations.country")) throw new ApiError(409, "federation_exists", "This country already has a federation");
    throw err;
  }
  return c.json({ partnership: present(await load(db, id)), federationId: fedId, seatId: userId }, 201);
});

const reopenSchema = z.object({
  /** Where the talks pick up again. */
  stage: z.enum(["prospect", "contacted", "negotiating"]).default("contacted"),
  reason: z.string().trim().min(3).max(1000),
});

/**
 * Put a closed partnership back into talks: a declined one when the federation comes back to the table, an onboarded
 * one for a renegotiation (it keeps its federation, and closes again with a plain stage move once re-signed).
 */
partnerships.post("/:id/reopen", async (c) => {
  const actor = currentUser(c);
  const db = c.env.DB;
  const id = c.req.param("id");
  const b = await readJson(c, reopenSchema);
  const p = await load(db, id);
  if (p.stage !== "declined" && p.stage !== "onboarded") throw new ApiError(409, "not_closed", "Only a declined or onboarded partnership can be reopened");
  if (p.stage === "declined") {
    const open = await db.prepare("SELECT id FROM partnerships WHERE country = ? AND stage <> 'declined' AND id <> ?").bind(p.country, id).first<{ id: string }>();
    if (open) throw new ApiError(409, "partnership_exists", "There is already an open partnership with this country", { id: open.id });
  }
  try {
    await db.batch([
      db
        .prepare("UPDATE partnerships SET stage = ?, declined_reason = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND stage = ?")
        .bind(b.stage, id, p.stage),
      eventStmt(db, { id, kind: "stage", body: b.reason, from: p.stage, to: b.stage, actor: actor.id }),
      auditStmt(db, actor, { action: "partnership.reopen", entity: "partnership", entityId: id, before: { stage: p.stage }, after: { stage: b.stage }, reason: b.reason, countryCode: p.country, ip: c.get("ip") }),
    ]);
  } catch (err) {
    if (String(err).includes("UNIQUE")) throw new ApiError(409, "partnership_exists", "There is already an open partnership with this country");
    throw err;
  }
  return c.json({ partnership: present(await load(db, id)) });
});

/** Remove an entry made by mistake, with its timeline. The audit log keeps what it was; a federation it led to stays. */
partnerships.delete("/:id", async (c) => {
  const actor = currentUser(c);
  const db = c.env.DB;
  const id = c.req.param("id");
  const p = await load(db, id);
  await db.batch([
    db.prepare("DELETE FROM partnership_events WHERE partnership_id = ?").bind(id),
    db.prepare("DELETE FROM partnerships WHERE id = ?").bind(id),
    auditStmt(db, actor, {
      action: "partnership.delete",
      entity: "partnership",
      entityId: id,
      before: { country: p.country, federationName: p.federationName, stage: p.stage, federationId: p.federationId },
      countryCode: p.country,
      ip: c.get("ip"),
    }),
  ]);
  return c.json({ ok: true });
});
