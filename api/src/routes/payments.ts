import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { ApiError, forbidden, notFound, parseQuery, readJson, uuid } from "../lib/http";
import { auditStmt } from "../lib/audit";
import { isStaff } from "../lib/access";
import { notifyOfficialStmts, notifyStmts } from "../lib/notify";
import { currentUser, staff } from "../middleware/auth";

export const payments = new Hono<AppEnv>();
export const feeScales = new Hono<AppEnv>();
export const advances = new Hono<AppEnv>();

const ROLES = ["R", "AR1", "AR2", "FOURTH", "VAR", "AVAR", "OBS"] as const;
const TIERS = ["d1", "d2", "cup", "continental"] as const;

/* ------------------------------------------------------------------ *
 * Fee scales — per competition tier (or competition) and role
 * ------------------------------------------------------------------ */

feeScales.get("/", staff, async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, tier, competition_id AS competitionId, role, amount, transport, lodging, meals, currency, effective_from AS effectiveFrom
       FROM fee_scales ORDER BY tier, competition_id, role`,
  ).all();
  return c.json({ scales: results });
});

const scaleSchema = z.object({
  tier: z.enum(TIERS),
  competitionId: z.string().max(60).nullable().default(null),
  role: z.enum(ROLES),
  amount: z.number().int().min(0).max(100_000_000),
  transport: z.number().int().min(0).default(0),
  lodging: z.number().int().min(0).default(0),
  meals: z.number().int().min(0).default(0),
  currency: z.string().length(3).default("XOF"),
});

feeScales.put("/", staff, async (c) => {
  const user = currentUser(c);
  const b = await readJson(c, scaleSchema);
  const id = uuid();
  try {
    await c.env.DB.batch([
      c.env.DB
        .prepare(
          `INSERT INTO fee_scales (id, tier, competition_id, role, amount, transport, lodging, meals, currency)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (tier, role, IFNULL(competition_id, '')) DO UPDATE SET
             amount = excluded.amount, transport = excluded.transport, lodging = excluded.lodging, meals = excluded.meals, currency = excluded.currency`,
        )
        .bind(id, b.tier, b.competitionId, b.role, b.amount, b.transport, b.lodging, b.meals, b.currency.toUpperCase()),
      auditStmt(c.env.DB, user, { action: "feescale.set", entity: "fee_scale", entityId: `${b.tier}/${b.competitionId ?? "*"}/${b.role}`, after: b, ip: c.get("ip") }),
    ]);
  } catch (err) {
    if (String(err).includes("FOREIGN KEY")) throw new ApiError(422, "unknown_competition", "Unknown competition");
    throw err;
  }
  return c.json({ ok: true });
});

/* ------------------------------------------------------------------ *
 * Payments
 * ------------------------------------------------------------------ */

const COLUMNS = `p.id, p.fixture_id AS fixtureId, p.role, p.official_id AS officialId, o.name AS officialName,
  p.base, p.transport, p.lodging, p.meals, p.bonus, p.deduction, p.total, p.currency, p.status,
  p.presence_confirmed AS presenceConfirmed, p.match_validated AS matchValidated, p.expenses_verified AS expensesVerified,
  p.validated_at AS validatedAt, p.paid_at AS paidAt, p.payment_ref AS paymentRef, p.contest_note AS contestNote, p.created_at AS createdAt,
  f.home, f.away, f.date, f.city, f.competition_id AS competitionId`;
const FROM = "FROM payments p JOIN officials o ON o.id = p.official_id JOIN fixtures f ON f.id = p.fixture_id";

interface PaymentRow {
  id: string;
  officialId: string;
  status: string;
  presenceConfirmed: number;
  matchValidated: number;
  expensesVerified: number;
  fixtureId: string;
  total: number;
}

async function loadPayment(db: D1Database, id: string) {
  const row = await db.prepare(`SELECT ${COLUMNS} ${FROM} WHERE p.id = ?`).bind(id).first<PaymentRow & Record<string, unknown>>();
  if (!row) throw notFound("Payment");
  return row;
}

const asBool = (r: Record<string, unknown>) => ({
  ...r,
  presenceConfirmed: r.presenceConfirmed === 1,
  matchValidated: r.matchValidated === 1,
  expensesVerified: r.expensesVerified === 1,
});

const listQuery = z.object({
  status: z.enum(["due", "validated", "paid", "contested", "cancelled"]).optional(),
  officialId: z.string().optional(),
  fixtureId: z.string().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

payments.get("/", async (c) => {
  const user = currentUser(c);
  const q = parseQuery(c, listQuery);
  const where: string[] = [];
  const args: (string | number)[] = [];
  // officials only ever see their own money
  if (!isStaff(user)) {
    if (!user.officialId) throw forbidden();
    (where.push("p.official_id = ?"), args.push(user.officialId));
  } else if (q.officialId) (where.push("p.official_id = ?"), args.push(q.officialId));
  if (q.status) (where.push("p.status = ?"), args.push(q.status));
  if (q.fixtureId) (where.push("p.fixture_id = ?"), args.push(q.fixtureId));
  if (q.from) (where.push("f.date >= ?"), args.push(q.from));
  if (q.to) (where.push("f.date <= ?"), args.push(q.to));
  const { results } = await c.env.DB.prepare(`SELECT ${COLUMNS} ${FROM} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY f.date DESC, p.role LIMIT ?`)
    .bind(...args, q.limit)
    .all<Record<string, unknown>>();
  return c.json({ payments: results.map(asBool) });
});

const generateSchema = z.object({ fixtureId: z.string().min(1) });

// Creates the amounts due for a match from the fee scale. Nothing is paid by this.
payments.post("/generate", staff, async (c) => {
  const user = currentUser(c);
  const { fixtureId } = await readJson(c, generateSchema);
  const db = c.env.DB;
  const fixture = await db
    .prepare("SELECT f.id, f.designation_status AS status, c.tier, c.id AS competitionId FROM fixtures f JOIN competitions c ON c.id = f.competition_id WHERE f.id = ?")
    .bind(fixtureId)
    .first<{ id: string; status: string; tier: string; competitionId: string }>();
  if (!fixture) throw notFound("Fixture");
  if (fixture.status !== "validated" && fixture.status !== "published") {
    throw new ApiError(409, "not_validated", "Amounts are generated once the crew is validated");
  }

  const { results: slots } = await db
    .prepare("SELECT role, official_id FROM designations WHERE fixture_id = ? AND state = 'confirmed' AND official_id IS NOT NULL")
    .bind(fixtureId)
    .all<{ role: string; official_id: string }>();

  const stmts: D1PreparedStatement[] = [];
  const missing: string[] = [];
  for (const slot of slots) {
    const scale = await db
      .prepare(
        `SELECT amount, transport, lodging, meals, currency FROM fee_scales
          WHERE role = ?1 AND (competition_id = ?2 OR (competition_id IS NULL AND tier = ?3))
          ORDER BY competition_id IS NULL LIMIT 1`,
      )
      .bind(slot.role, fixture.competitionId, fixture.tier)
      .first<{ amount: number; transport: number; lodging: number; meals: number; currency: string }>();
    if (!scale) {
      missing.push(slot.role);
      continue;
    }
    stmts.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO payments (id, fixture_id, role, official_id, base, transport, lodging, meals, currency)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(uuid(), fixtureId, slot.role, slot.official_id, scale.amount, scale.transport, scale.lodging, scale.meals, scale.currency),
    );
  }
  stmts.push(auditStmt(db, user, { action: "payment.generate", entity: "fixture", entityId: fixtureId, after: { lines: stmts.length, missingScale: missing }, ip: c.get("ip") }));
  const res = await db.batch(stmts);
  const created = res.slice(0, -1).reduce((n, r) => n + (r.meta.changes ?? 0), 0);
  return c.json({ created, missingScale: missing }, created ? 201 : 200);
});

payments.get("/:id", async (c) => {
  const user = currentUser(c);
  const row = await loadPayment(c.env.DB, c.req.param("id"));
  if (!isStaff(user) && user.officialId !== row.officialId) throw notFound("Payment");
  return c.json({ payment: asBool(row) });
});

const adjustSchema = z
  .object({
    transport: z.number().int().min(0),
    lodging: z.number().int().min(0),
    meals: z.number().int().min(0),
    bonus: z.number().int().min(0),
    deduction: z.number().int().min(0),
    presenceConfirmed: z.boolean(),
    matchValidated: z.boolean(),
    expensesVerified: z.boolean(),
    reason: z.string().min(3).max(300).optional(),
  })
  .partial();

const FLAGS: Record<string, string> = { presenceConfirmed: "presence_confirmed", matchValidated: "match_validated", expensesVerified: "expenses_verified" };

payments.patch("/:id", staff, async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const b = await readJson(c, adjustSchema);
  const db = c.env.DB;
  const before = await loadPayment(db, id);
  if (before.status === "paid" || before.status === "cancelled") throw new ApiError(409, "closed", `A ${before.status} payment can no longer be edited`);

  const { reason, ...fields } = b;
  const money = ["transport", "lodging", "meals", "bonus", "deduction"].filter((k) => k in fields);
  if (money.length && !reason) throw new ApiError(422, "reason_required", "Changing an amount needs a written reason");

  const sets: string[] = [];
  const args: (string | number)[] = [];
  for (const k of money) (sets.push(`${k} = ?`), args.push((fields as Record<string, number>)[k]));
  for (const [k, col] of Object.entries(FLAGS)) {
    const v = (fields as Record<string, boolean | undefined>)[k];
    if (v !== undefined) (sets.push(`${col} = ?`), args.push(v ? 1 : 0));
  }
  if (sets.length === 0) return c.json({ payment: asBool(before) });
  // any edit after validation sends the line back for another look
  if (before.status === "validated") sets.push("status = 'due'", "validated_by = NULL", "validated_at = NULL");

  await db.batch([
    db.prepare(`UPDATE payments SET ${sets.join(", ")} WHERE id = ?`).bind(...args, id),
    auditStmt(db, user, { action: "payment.adjust", entity: "payment", entityId: id, before: { total: before.total, status: before.status }, after: fields, reason, ip: c.get("ip") }),
  ]);
  return c.json({ payment: asBool(await loadPayment(db, id)) });
});

payments.post("/:id/validate", staff, async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const db = c.env.DB;
  const p = await loadPayment(db, id);
  if (p.status === "validated") return c.json({ payment: asBool(p) });
  if (p.status !== "due") throw new ApiError(409, "bad_state", `A ${p.status} payment cannot be validated`);
  const missing = [
    p.presenceConfirmed === 1 ? null : "presenceConfirmed",
    p.matchValidated === 1 ? null : "matchValidated",
    p.expensesVerified === 1 ? null : "expensesVerified",
  ].filter(Boolean);
  if (missing.length) {
    throw new ApiError(409, "checks_missing", "Presence, match validation and expense checks must all be confirmed first", { missing });
  }
  await db.batch([
    db.prepare("UPDATE payments SET status = 'validated', validated_by = ?, validated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND status = 'due'").bind(user.id, id),
    auditStmt(db, user, { action: "payment.validate", entity: "payment", entityId: id, after: { total: p.total }, ip: c.get("ip") }),
  ]);
  return c.json({ payment: asBool(await loadPayment(db, id)) });
});

const paySchema = z.object({ reference: z.string().min(3).max(80) });

payments.post("/:id/pay", staff, async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const { reference } = await readJson(c, paySchema);
  const db = c.env.DB;
  const p = await loadPayment(db, id);
  if (p.status === "paid") return c.json({ payment: asBool(p) });
  // Only a validated line can be paid; "validated" already implies the three checks.
  if (p.status !== "validated") throw new ApiError(409, "not_validated", "Only a validated payment can be marked as paid");
  await db.batch([
    db.prepare("UPDATE payments SET status = 'paid', paid_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), payment_ref = ? WHERE id = ? AND status = 'validated'").bind(reference, id),
    auditStmt(db, user, { action: "payment.pay", entity: "payment", entityId: id, after: { reference, total: p.total }, ip: c.get("ip") }),
    ...(await notifyOfficialStmts(db, p.officialId, {
      title: { en: "Payment sent", fr: "Paiement effectué" },
      detail: { en: `${p.total} ${p.currency} — ref. ${reference}`, fr: `${p.total} ${p.currency} — réf. ${reference}` },
      tone: "pitch",
      href: "/me",
    })),
  ]);
  return c.json({ payment: asBool(await loadPayment(db, id)) });
});

const contestSchema = z.object({ note: z.string().min(5).max(500) });

// The official disputes an amount; staff then resolve it.
payments.post("/:id/contest", async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const { note } = await readJson(c, contestSchema);
  const db = c.env.DB;
  const p = await loadPayment(db, id);
  if (!isStaff(user) && user.officialId !== p.officialId) throw notFound("Payment");
  if (p.status !== "due" && p.status !== "validated") throw new ApiError(409, "bad_state", "Only an unpaid amount can be contested");
  await db.batch([
    db.prepare("UPDATE payments SET status = 'contested', contest_note = ? WHERE id = ? AND status IN ('due','validated')").bind(note, id),
    auditStmt(db, user, { action: "payment.contest", entity: "payment", entityId: id, reason: note, ip: c.get("ip") }),
    ...notifyStmts(db, {
      audienceRole: "commission",
      dedupeKey: `contest:${id}`,
      title: { en: "Payment contested", fr: "Indemnité contestée" },
      detail: { en: `${p.officialName}: ${note}`, fr: `${p.officialName} : ${note}` },
      tone: "amber",
      href: "/reports",
    }),
  ]);
  return c.json({ payment: asBool(await loadPayment(db, id)) });
});

const resolveSchema = z.object({ outcome: z.enum(["due", "cancelled"]), note: z.string().min(3).max(500) });

payments.post("/:id/resolve", staff, async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const b = await readJson(c, resolveSchema);
  const db = c.env.DB;
  const p = await loadPayment(db, id);
  if (p.status !== "contested") throw new ApiError(409, "bad_state", "Only a contested payment can be resolved");
  await db.batch([
    db.prepare("UPDATE payments SET status = ?, contest_note = NULL, validated_by = NULL, validated_at = NULL WHERE id = ?").bind(b.outcome, id),
    auditStmt(db, user, { action: "payment.resolve", entity: "payment", entityId: id, after: { outcome: b.outcome }, reason: b.note, ip: c.get("ip") }),
  ]);
  return c.json({ payment: asBool(await loadPayment(db, id)) });
});

payments.post("/:id/cancel", staff, async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const { note } = await readJson(c, z.object({ note: z.string().min(3).max(300) }));
  const db = c.env.DB;
  const p = await loadPayment(db, id);
  if (p.status === "paid") throw new ApiError(409, "bad_state", "A paid line cannot be cancelled; record a correction instead");
  await db.batch([
    db.prepare("UPDATE payments SET status = 'cancelled' WHERE id = ? AND status <> 'paid'").bind(id),
    auditStmt(db, user, { action: "payment.cancel", entity: "payment", entityId: id, reason: note, ip: c.get("ip") }),
  ]);
  return c.json({ payment: asBool(await loadPayment(db, id)) });
});

/* ------------------------------------------------------------------ *
 * Advances
 * ------------------------------------------------------------------ */

advances.get("/", async (c) => {
  const user = currentUser(c);
  const where = isStaff(user) ? "" : "WHERE a.official_id = ?";
  const stmt = c.env.DB.prepare(
    `SELECT a.id, a.official_id AS officialId, o.name AS officialName, a.fixture_id AS fixtureId, a.amount, a.currency, a.justification, a.status, a.requested_at AS requestedAt, a.decided_at AS decidedAt
       FROM advances a JOIN officials o ON o.id = a.official_id ${where} ORDER BY a.requested_at DESC LIMIT 200`,
  );
  const { results } = await (isStaff(user) ? stmt : stmt.bind(user.officialId ?? "")).all();
  return c.json({ advances: results });
});

const advanceSchema = z.object({
  officialId: z.string().optional(),
  fixtureId: z.string().optional(),
  amount: z.number().int().min(1).max(10_000_000),
  justification: z.string().min(5).max(500),
});

advances.post("/", async (c) => {
  const user = currentUser(c);
  const b = await readJson(c, advanceSchema);
  const officialId = isStaff(user) ? b.officialId : user.officialId;
  if (!officialId) throw new ApiError(422, "official_required", "Say which official the advance is for");
  const id = uuid();
  try {
    await c.env.DB.batch([
      c.env.DB.prepare("INSERT INTO advances (id, official_id, fixture_id, amount, justification) VALUES (?, ?, ?, ?, ?)").bind(id, officialId, b.fixtureId ?? null, b.amount, b.justification),
      auditStmt(c.env.DB, user, { action: "advance.request", entity: "advance", entityId: id, after: { officialId, amount: b.amount }, ip: c.get("ip") }),
    ]);
  } catch (err) {
    if (String(err).includes("FOREIGN KEY")) throw new ApiError(422, "unknown_reference", "Unknown official or fixture");
    throw err;
  }
  return c.json({ advance: { id, officialId, amount: b.amount, status: "requested" } }, 201);
});

const decideSchema = z.object({ status: z.enum(["approved", "paid", "settled", "rejected"]) });

// Allowed moves: requested → approved | rejected, approved → paid, paid → settled.
const NEXT: Record<string, string[]> = { requested: ["approved", "rejected"], approved: ["paid", "rejected"], paid: ["settled"] };

advances.post("/:id/decide", staff, async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const { status } = await readJson(c, decideSchema);
  const row = await c.env.DB.prepare("SELECT status FROM advances WHERE id = ?").bind(id).first<{ status: string }>();
  if (!row) throw notFound("Advance");
  if (!NEXT[row.status]?.includes(status)) throw new ApiError(409, "bad_state", `An advance that is ${row.status} cannot become ${status}`);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE advances SET status = ?, decided_by = ?, decided_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").bind(status, user.id, id),
    auditStmt(c.env.DB, user, { action: `advance.${status}`, entity: "advance", entityId: id, ip: c.get("ip") }),
  ]);
  return c.json({ ok: true, status });
});
