import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { ApiError, forbidden, notFound, parseQuery, readJson, today, uuid } from "../lib/http";
import { auditStmt } from "../lib/audit";
import { assertCountry, assertReadOfficial, CONTINENTAL, countryFilter, isAdmin, isStaff } from "../lib/access";
import { localized } from "../lib/localized";
import { notifyOfficialStmts, notifyStmts } from "../lib/notify";
import { csvResponse } from "../lib/csv";
import { commitMedia, readUpload } from "../lib/media";
import { currentUser, staff } from "../middleware/auth";
import { mediaUrl } from "../domain/mappers";
import { assertFixtureLink } from "../domain/official-links";

export const payments = new Hono<AppEnv>();
export const feeScales = new Hono<AppEnv>();
export const advances = new Hono<AppEnv>();

const ROLES = ["R", "AR1", "AR2", "FOURTH", "VAR", "AVAR", "OBS"] as const;
const TIERS = ["d1", "d2", "cup", "continental"] as const;
const countryParam = z.string().length(3).transform((v) => v.toUpperCase());
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
/** The platform's first season: a scale written without a date applies from the start. */
const BASELINE = "2026-07-01";

/* ------------------------------------------------------------------ *
 * Fee scales — per federation, per competition tier (or competition) and role.
 * Rows without a federation are the platform defaults: only an administrator changes them.
 *
 * A scale is dated (`effective_from`) and keeps its history: a new amount from a later date is a new row, and the
 * scale applied to a match is the most recent one in force on the match date. `inForce` marks the row that applies
 * today; a scale that has not started yet can still be withdrawn (DELETE), one that has applied is history.
 * ------------------------------------------------------------------ */

/** Same scale, other date: the rows of one key (federation / tier / role / competition). */
const SAME_KEY = `IFNULL(x.federation_id, '') = IFNULL(fs.federation_id, '') AND x.tier = fs.tier AND x.role = fs.role
  AND IFNULL(x.competition_id, '') = IFNULL(fs.competition_id, '')`;

const SCALE_COLS = `fs.id, fs.tier, fs.competition_id AS competitionId, fs.federation_id AS federationId, fe.code AS federationCode, fs.role,
  fs.amount, fs.transport, fs.lodging, fs.meals, fs.currency, fs.effective_from AS effectiveFrom,
  fs.effective_from = (SELECT MAX(x.effective_from) FROM fee_scales x WHERE ${SAME_KEY} AND x.effective_from <= ?1) AS inForce`;

feeScales.get("/", staff, async (c) => {
  const user = currentUser(c);
  const q = parseQuery(c, z.object({ federationId: z.string().max(80).optional() }));
  const where: string[] = [];
  const args: string[] = [today()];
  if (user.role === "federation") {
    // its own scales, plus the platform defaults it falls back on (read only)
    where.push("(fs.federation_id IS NULL OR fs.federation_id = ?)");
    args.push(user.federationId ?? "");
  } else if (q.federationId === "default") {
    where.push("fs.federation_id IS NULL");
  } else if (q.federationId) {
    where.push("fs.federation_id = ?");
    args.push(q.federationId);
  }
  const { results } = await c.env.DB.prepare(
    `SELECT ${SCALE_COLS} FROM fee_scales fs LEFT JOIN federations fe ON fe.id = fs.federation_id
      ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY fs.federation_id IS NOT NULL, fe.code, fs.tier, fs.competition_id, fs.role, fs.effective_from DESC`,
  )
    .bind(...args)
    .all<{ federationId: string | null; inForce: number | null } & Record<string, unknown>>();
  return c.json({ scales: results.map((r) => ({ ...r, inForce: r.inForce === 1, readonly: user.role === "federation" && r.federationId === null })) });
});

const scaleSchema = z.object({
  /** Admin only: whose scale. Absent or null = the platform default. A federation can only ever write its own. */
  federationId: z.string().max(80).nullable().optional(),
  tier: z.enum(TIERS),
  competitionId: z.string().max(60).nullable().default(null),
  role: z.enum(ROLES),
  amount: z.number().int().min(0).max(100_000_000),
  transport: z.number().int().min(0).default(0),
  lodging: z.number().int().min(0).default(0),
  meals: z.number().int().min(0).default(0),
  currency: z.string().length(3).optional(),
  /** From when this scale applies. Absent: the scale in force today is edited in place (or one is started from the baseline). */
  effectiveFrom: dateSchema.optional(),
});

feeScales.put("/", staff, async (c) => {
  const user = currentUser(c);
  const b = await readJson(c, scaleSchema);
  const db = c.env.DB;

  let federationId: string | null;
  if (user.role === "federation") {
    if (b.federationId === null) throw forbidden("Platform default scales are managed by the administrator");
    if (b.federationId !== undefined && b.federationId !== user.federationId) throw notFound("Federation");
    federationId = user.federationId;
  } else {
    federationId = b.federationId ?? null;
  }

  // a federation's scales are in its country's currency
  let country: string | null = null;
  let currency = b.currency?.toUpperCase() ?? "XOF";
  if (federationId) {
    const fed = await db
      .prepare("SELECT f.country, c.currency FROM federations f JOIN countries c ON c.code = f.country WHERE f.id = ?")
      .bind(federationId)
      .first<{ country: string; currency: string }>();
    if (!fed) throw notFound("Federation");
    country = fed.country;
    if (b.currency && b.currency.toUpperCase() !== fed.currency) {
      throw new ApiError(422, "currency_mismatch", `This federation's scales are in ${fed.currency}`, { expected: fed.currency });
    }
    currency = fed.currency;
  }

  if (b.competitionId) {
    const comp = await db.prepare("SELECT country_code AS countryCode FROM competitions WHERE id = ?").bind(b.competitionId).first<{ countryCode: string }>();
    // a federation can only price its own country's competitions; a foreign or unknown id looks the same
    if (!comp || (user.role === "federation" && comp.countryCode !== country)) throw notFound("Competition");
    if (country && comp.countryCode !== country) throw new ApiError(422, "competition_mismatch", "That competition belongs to another federation");
  }

  // Without a date, the scale in force today is the one being edited; a dated write adds (or edits) that dated row.
  const inForce = await db
    .prepare(
      `SELECT MAX(effective_from) AS d FROM fee_scales
        WHERE IFNULL(federation_id, '') = IFNULL(?1, '') AND tier = ?2 AND role = ?3 AND IFNULL(competition_id, '') = IFNULL(?4, '') AND effective_from <= ?5`,
    )
    .bind(federationId, b.tier, b.role, b.competitionId, today())
    .first<{ d: string | null }>();
  const effectiveFrom = b.effectiveFrom ?? inForce?.d ?? BASELINE;

  await db.batch([
    db
      .prepare(
        `INSERT INTO fee_scales (id, tier, competition_id, federation_id, role, amount, transport, lodging, meals, currency, effective_from)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (IFNULL(federation_id, ''), tier, role, IFNULL(competition_id, ''), effective_from) DO UPDATE SET
           amount = excluded.amount, transport = excluded.transport, lodging = excluded.lodging, meals = excluded.meals, currency = excluded.currency`,
      )
      .bind(uuid(), b.tier, b.competitionId, federationId, b.role, b.amount, b.transport, b.lodging, b.meals, currency, effectiveFrom),
    auditStmt(db, user, {
      action: "feescale.set",
      entity: "fee_scale",
      entityId: `${federationId ?? "default"}/${b.tier}/${b.competitionId ?? "*"}/${b.role}@${effectiveFrom}`,
      after: { ...b, federationId, currency, effectiveFrom },
      countryCode: country,
      ip: c.get("ip"),
    }),
  ]);
  return c.json({ ok: true, federationId, effectiveFrom });
});

// Withdraw a scale that has not started yet. One that has applied (or applies today) is history: write a new dated
// scale instead. A federation removes only its own; the platform defaults are the administrator's.
feeScales.delete("/:id", staff, async (c) => {
  const user = currentUser(c);
  const db = c.env.DB;
  const row = await db
    .prepare(
      `SELECT fs.id, fs.federation_id AS federationId, fe.country, fs.tier, fs.role, fs.competition_id AS competitionId, fs.amount, fs.effective_from AS effectiveFrom
         FROM fee_scales fs LEFT JOIN federations fe ON fe.id = fs.federation_id WHERE fs.id = ?`,
    )
    .bind(c.req.param("id"))
    .first<{ id: string; federationId: string | null; country: string | null; tier: string; role: string; competitionId: string | null; amount: number; effectiveFrom: string }>();
  if (!row) throw notFound("Fee scale");
  if (user.role === "federation") {
    if (row.federationId === null) throw forbidden("Platform default scales are managed by the administrator");
    if (row.federationId !== user.federationId) throw notFound("Fee scale");
  }
  if (row.effectiveFrom <= today()) {
    throw new ApiError(409, "in_force", "This scale has already applied; write a new dated scale instead of deleting it", { effectiveFrom: row.effectiveFrom });
  }
  await db.batch([
    db.prepare("DELETE FROM fee_scales WHERE id = ? AND effective_from > ?").bind(row.id, today()),
    auditStmt(db, user, { action: "feescale.delete", entity: "fee_scale", entityId: row.id, before: row, countryCode: row.country, ip: c.get("ip") }),
  ]);
  return c.json({ ok: true });
});


/* ------------------------------------------------------------------ *
 * Payments — a payment belongs to the country that runs the fixture: the federation that pays it.
 * A neutral official from abroad is paid (and seen) by the host federation, in its currency and on its
 * scales; continental ties (CAF) are the administrator's. The official's home country is reported
 * alongside as `officialCountryCode`, and the official always sees their own lines.
 * ------------------------------------------------------------------ */

const COLUMNS = `p.id, p.fixture_id AS fixtureId, p.role, p.official_id AS officialId, o.name AS officialName, f.country_code AS countryCode, o.country_code AS officialCountryCode,
  p.base, p.transport, p.lodging, p.meals, p.bonus, p.deduction, p.total, p.currency, p.status,
  p.presence_confirmed AS presenceConfirmed, p.match_validated AS matchValidated, p.expenses_verified AS expensesVerified,
  p.validated_at AS validatedAt, p.paid_at AS paidAt, p.payment_ref AS paymentRef, p.contest_note AS contestNote, p.created_at AS createdAt,
  ht.name AS home, aw.name AS away, f.date, f.kickoff_at AS kickoffAt, s.city AS city, f.competition_id AS competitionId,
  (SELECT COALESCE(SUM(pc.delta), 0) FROM payment_corrections pc WHERE pc.payment_id = p.id) AS correctionTotal,
  (SELECT COALESCE(SUM(ad.amount), 0) FROM advances ad WHERE ad.payment_id = p.id) AS advanceDeduction`;
const FROM = `FROM payments p JOIN officials o ON o.id = p.official_id JOIN fixtures f ON f.id = p.fixture_id
  JOIN teams ht ON ht.id = f.home_team_id JOIN teams aw ON aw.id = f.away_team_id LEFT JOIN stadiums s ON s.id = f.stadium_id`;

interface PaymentRow {
  id: string;
  officialId: string;
  officialName: string;
  countryCode: string;
  status: string;
  presenceConfirmed: number;
  matchValidated: number;
  expensesVerified: number;
  fixtureId: string;
  total: number;
  currency: string;
  correctionTotal: number;
  advanceDeduction: number;
}

/** What the official actually receives: the line, plus its corrections, minus the advances settled on it. */
const netOf = (r: { total: unknown; correctionTotal: unknown; advanceDeduction: unknown }) =>
  Number(r.total) + Number(r.correctionTotal ?? 0) - Number(r.advanceDeduction ?? 0);

/** Loads a payment the caller may see: staff of the paying country (404 otherwise), a referee their own. */
async function loadPayment(db: D1Database, user: ReturnType<typeof currentUser>, id: string) {
  const row = await db.prepare(`SELECT ${COLUMNS} ${FROM} WHERE p.id = ?`).bind(id).first<PaymentRow & Record<string, unknown>>();
  if (!row) throw notFound("Payment");
  if (isStaff(user)) assertCountry(user, row.countryCode, "Payment");
  else if (!user.officialId || user.officialId !== row.officialId) throw notFound("Payment");
  return row;
}

const asBool = (r: Record<string, unknown>) => ({
  ...r,
  presenceConfirmed: r.presenceConfirmed === 1,
  matchValidated: r.matchValidated === 1,
  expensesVerified: r.expensesVerified === 1,
  net: netOf(r as never),
});

const dateParam = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const listQuery = z.object({
  status: z.enum(["due", "validated", "paid", "contested", "cancelled"]).optional(),
  officialId: z.string().optional(),
  fixtureId: z.string().optional(),
  country: countryParam.optional(),
  from: dateParam.optional(),
  to: dateParam.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
  /** `csv`: the same rows (up to CSV_MAX, from the start) as a spreadsheet file. */
  format: z.enum(["json", "csv"]).default("json"),
});

const CSV_MAX = 5000;
const CSV_COLUMNS = [
  "id", "date", "countryCode", "competitionId", "fixtureId", "home", "away", "role", "officialId", "officialName", "officialCountryCode",
  "base", "transport", "lodging", "meals", "bonus", "deduction", "total", "correctionTotal", "advanceDeduction", "net", "currency", "status",
  "validatedAt", "paidAt", "paymentRef",
];

payments.get("/", async (c) => {
  const user = currentUser(c);
  const q = parseQuery(c, listQuery);
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (isStaff(user)) {
    const scope = countryFilter(user, "f.country_code");
    where.push(scope.sql);
    args.push(...scope.params);
    if (q.country) (where.push("f.country_code = ?"), args.push(q.country));
    if (q.officialId) (where.push("p.official_id = ?"), args.push(q.officialId));
  } else {
    // officials only ever see their own money
    if (!user.officialId) throw forbidden();
    (where.push("p.official_id = ?"), args.push(user.officialId));
  }
  if (q.status) (where.push("p.status = ?"), args.push(q.status));
  if (q.fixtureId) (where.push("p.fixture_id = ?"), args.push(q.fixtureId));
  if (q.from) (where.push("f.date >= ?"), args.push(q.from));
  if (q.to) (where.push("f.date <= ?"), args.push(q.to));
  const csv = q.format === "csv";
  // one more row than asked tells whether there is a next page
  const limit = csv ? CSV_MAX : q.limit + 1;
  const offset = csv ? 0 : q.offset;
  const { results } = await c.env.DB.prepare(`SELECT ${COLUMNS} ${FROM} WHERE ${where.join(" AND ")} ORDER BY f.date DESC, p.role, p.id LIMIT ? OFFSET ?`)
    .bind(...args, limit, offset)
    .all<Record<string, unknown>>();
  if (csv) {
    return csvResponse(`payments-${today()}.csv`, results.map((r) => ({ ...r, net: netOf(r as never) })), CSV_COLUMNS);
  }
  const more = results.length > q.limit;
  return c.json({ payments: results.slice(0, q.limit).map(asBool), limit: q.limit, offset: q.offset, nextOffset: more ? q.offset + q.limit : null });
});

const generateSchema = z.object({ fixtureId: z.string().min(1) });

interface ScaleRow {
  role: string;
  competitionId: string | null;
  federationId: string | null;
  amount: number;
  transport: number;
  lodging: number;
  meals: number;
  currency: string;
  effectiveFrom: string;
}

/**
 * One version per scale: the one in force on `date` (the latest started on or before it). A match older than a
 * scale's first version is priced on that first version — there was no other scale for it.
 */
function inForceOn(rows: ScaleRow[], date: string) {
  const byKey = new Map<string, ScaleRow[]>();
  for (const r of rows) {
    const key = `${r.federationId ?? ""}|${r.competitionId ?? ""}|${r.currency}`;
    byKey.set(key, [...(byKey.get(key) ?? []), r]);
  }
  return [...byKey.values()].map((versions) => {
    const sorted = versions.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
    return sorted.filter((v) => v.effectiveFrom <= date).at(-1) ?? sorted[0];
  });
}

// Creates the amounts due for a match from the fee scales. Nothing is paid by this.


//
// The scale used for a line is the most specific one that exists:
//   a scale for this competition (the federation's, else the platform's)  >  the federation's tier scale  >  the platform default.
// The currency is the one of the country that runs the fixture; continental ties keep the scale's own currency.
// There is no exchange rate in ARIS, so a scale written in another currency (a platform default in XOF for a
// federation paid in MAD, say) is never used: copying its number across would pay the wrong amount. Those roles
// are reported in `currencyMismatch` and stay without a line until a scale in the right currency exists.
payments.post("/generate", staff, async (c) => {
  const user = currentUser(c);
  const { fixtureId } = await readJson(c, generateSchema);
  const db = c.env.DB;
  const fixture = await db
    .prepare(
      `SELECT f.id, f.country_code AS countryCode, f.designation_status AS status, f.status AS fixtureStatus, f.date, c.tier, c.id AS competitionId,
              fe.id AS federationId, co.currency AS countryCurrency
         FROM fixtures f JOIN competitions c ON c.id = f.competition_id
         LEFT JOIN federations fe ON fe.country = f.country_code LEFT JOIN countries co ON co.code = f.country_code
        WHERE f.id = ?`,
    )
    .bind(fixtureId)
    .first<{ id: string; countryCode: string; status: string; fixtureStatus: string; date: string; tier: string; competitionId: string; federationId: string | null; countryCurrency: string | null }>();
  if (!fixture) throw notFound("Fixture");
  assertCountry(user, fixture.countryCode, "Fixture");
  // a cancelled match is worked by nobody: nothing is owed for it
  if (fixture.fixtureStatus === "cancelled") throw new ApiError(409, "fixture_cancelled", "This match was cancelled; no amounts are due for it");
  if (fixture.status !== "validated" && fixture.status !== "published") {
    throw new ApiError(409, "not_validated", "Amounts are generated once the crew is validated");
  }

  const [{ results: slots }, { results: scales }, { results: existing }] = await db.batch<Record<string, unknown>>([
    db.prepare("SELECT role, official_id FROM designations WHERE fixture_id = ? AND state = 'confirmed' AND official_id IS NOT NULL").bind(fixtureId),
    db
      .prepare(
        `SELECT role, competition_id AS competitionId, federation_id AS federationId, amount, transport, lodging, meals, currency, effective_from AS effectiveFrom
           FROM fee_scales
          WHERE (competition_id = ?1 OR (competition_id IS NULL AND tier = ?2)) AND (federation_id IS NULL OR federation_id = ?3)`,
      )
      .bind(fixture.competitionId, fixture.tier, fixture.federationId),
    db.prepare("SELECT role, official_id AS officialId, status FROM payments WHERE fixture_id = ?").bind(fixtureId),
  ]);
  const lineFor = new Map((existing as Array<{ role: string; officialId: string; status: string }>).map((l) => [l.role, l]));
  // rank 0 = competition-specific; rank 1 = tier. Within a rank the federation's own row beats the platform default.
  const rank = (s: ScaleRow) => (s.competitionId ? 0 : 2) + (s.federationId ? 0 : 1);

  const currency = fixture.countryCurrency;
  const stmts: D1PreparedStatement[] = [];
  const missing: string[] = [];
  const mismatched: string[] = [];
  const defaultsUsed: string[] = [];
  const reissued: string[] = [];
  const heldByPrevious: string[] = [];
  for (const slot of slots as Array<{ role: string; official_id: string }>) {
    const line = lineFor.get(slot.role);
    if (line && line.officialId === slot.official_id) continue; // already billed to this official
    if (line && line.status !== "cancelled") {
      // a line still open (or paid) for someone who no longer holds the slot: a person must sort it out
      heldByPrevious.push(slot.role);
      continue;
    }
    const forRole = inForceOn(
      (scales as unknown as ScaleRow[]).filter((s) => s.role === slot.role),
      fixture.date,
    );
    const usable = currency ? forRole.filter((s) => s.currency.toUpperCase() === currency.toUpperCase()) : forRole;
    const best = usable.sort((a, b) => rank(a) - rank(b))[0];
    if (!best) {
      (forRole.length ? mismatched : missing).push(slot.role);
      continue;
    }
    if (fixture.federationId && !best.federationId) defaultsUsed.push(slot.role);
    if (line) reissued.push(slot.role);
    // A cancelled line left by an official who was replaced is issued afresh to the one who holds the slot now:
    // a new id, the scale's amounts, and none of the old line's checks, adjustments or references.
    stmts.push(
      db
        .prepare(
          `INSERT INTO payments (id, fixture_id, role, official_id, base, transport, lodging, meals, currency)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (fixture_id, role) DO UPDATE SET
             id = excluded.id, official_id = excluded.official_id, base = excluded.base, transport = excluded.transport,
             lodging = excluded.lodging, meals = excluded.meals, currency = excluded.currency, bonus = 0, deduction = 0,
             status = 'due', presence_confirmed = 0, match_validated = 0, expenses_verified = 0, validated_by = NULL,
             validated_at = NULL, paid_at = NULL, payment_ref = NULL, contest_note = NULL,
             created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE payments.status = 'cancelled' AND payments.official_id <> excluded.official_id`,
        )
        .bind(uuid(), fixtureId, slot.role, slot.official_id, best.amount, best.transport, best.lodging, best.meals, currency ?? best.currency),
    );
  }
  const lines = stmts.length;
  stmts.push(auditStmt(db, user, { action: "payment.generate", entity: "fixture", entityId: fixtureId, after: { lines, missingScale: missing, currencyMismatch: mismatched, defaultScaleUsed: defaultsUsed, reissued, heldByPrevious }, countryCode: fixture.countryCode, ip: c.get("ip") }));
  const res = await db.batch(stmts);
  const created = res.slice(0, lines).reduce((n, r) => n + (r.meta.changes ?? 0), 0);
  return c.json({ created, missingScale: missing, currencyMismatch: mismatched, defaultScaleUsed: defaultsUsed, reissued, heldByPrevious }, created ? 201 : 200);
});

payments.get("/:id", async (c) => {
  const user = currentUser(c);
  const db = c.env.DB;
  const row = await loadPayment(db, user, c.req.param("id"));
  // receipts / justifications uploaded for this payment (the documents module owns the files),
  // the correction lines recorded against it and the advances settled on it
  const [receipts, corrections, settled] = await db.batch<Record<string, unknown>>([
    db
      .prepare(
        `SELECT d.id, d.kind, d.status, d.media_id AS mediaId, m.filename, m.content_type AS contentType, d.created_at AS createdAt
           FROM documents d JOIN media_assets m ON m.id = d.media_id WHERE d.payment_id = ? ORDER BY d.created_at`,
      )
      .bind(row.id),
    db
      .prepare(
        `SELECT pc.id, pc.delta, pc.reason, pc.created_at AS createdAt, u.name AS createdBy
           FROM payment_corrections pc LEFT JOIN users u ON u.id = pc.created_by WHERE pc.payment_id = ? ORDER BY pc.created_at, pc.id`,
      )
      .bind(row.id),
    db.prepare("SELECT id, amount, currency, justification, decided_at AS settledAt FROM advances WHERE payment_id = ? ORDER BY decided_at").bind(row.id),
  ]);
  return c.json({
    payment: {
      ...asBool(row),
      receipts: (receipts.results as Array<{ mediaId: string }>).map((r) => ({ ...r, url: mediaUrl(r.mediaId) })),
      corrections: corrections.results,
      advances: settled.results,
    },
  });
});

const correctionSchema = z.object({
  /** What is owed on top (positive) or taken back (negative), in the line's currency. */
  delta: z
    .number()
    .int()
    .min(-100_000_000)
    .max(100_000_000)
    .refine((v) => v !== 0, "A correction changes the amount"),
  reason: z.string().trim().min(3).max(300),
});

// A paid line is never edited: what was paid wrong is put right by a correction line linked to it. The line keeps
// what was paid; `net` (total + corrections - settled advances) is what the official is owed in the end.
payments.post("/:id/correction", staff, async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const b = await readJson(c, correctionSchema);
  const db = c.env.DB;
  const p = await loadPayment(db, user, id);
  if (p.status !== "paid") throw new ApiError(409, "not_paid", "Only a paid line is corrected this way; an unpaid line is edited directly");
  const before = netOf(p);
  const after = before + b.delta;
  // ARIS does not invoice its officials: a correction can take a line back to zero, never below
  if (after < 0) throw new ApiError(422, "negative_total", "The correction takes back more than was paid", { net: before, delta: b.delta });
  const correctionId = uuid();
  await db.batch([
    db.prepare("INSERT INTO payment_corrections (id, payment_id, delta, reason, created_by) VALUES (?, ?, ?, ?, ?)").bind(correctionId, id, b.delta, b.reason, user.id),
    auditStmt(db, user, { action: "payment.correct", entity: "payment", entityId: id, before: { net: before }, after: { net: after, delta: b.delta, correctionId }, reason: b.reason, countryCode: p.countryCode, ip: c.get("ip") }),
    ...(await notifyOfficialStmts(db, p.officialId, {
      title: localized("Correction d'une indemnité", "Payment corrected"),
      detail: localized(
        `${b.delta > 0 ? "+" : ""}${b.delta} ${p.currency} — ${b.reason.slice(0, 120)}`,
        `${b.delta > 0 ? "+" : ""}${b.delta} ${p.currency} — ${b.reason.slice(0, 120)}`,
      ),
      tone: b.delta > 0 ? "pitch" : "amber",
      href: "/me",
    })),
  ]);
  return c.json({ payment: asBool(await loadPayment(db, user, id)), correction: { id: correctionId, delta: b.delta, reason: b.reason } }, 201);
});

// Staff attach the proof of a payment (bank slip, signed receipt): PDF, PNG, JPEG or WebP, through the media pipeline.
// The file is owned by the payment, so the paying federation, an admin and the official paid can open it.
payments.post("/:id/receipts", staff, async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const db = c.env.DB;
  const p = await loadPayment(db, user, id);
  if (p.status === "cancelled") throw new ApiError(409, "closed", "A cancelled line takes no receipt");
  const { upload } = await readUpload(c);
  const docId = uuid();
  const media = await commitMedia(c.env, {
    upload,
    user,
    ip: c.get("ip"),
    kind: "receipt",
    visibility: "private",
    ownerType: "payment",
    ownerId: id,
    then: (mediaId) => [
      // filed by staff, so already checked
      db
        .prepare("INSERT INTO documents (id, official_id, kind, media_id, status, payment_id, uploaded_by) VALUES (?, ?, 'receipt', ?, 'verified', ?, ?)")
        .bind(docId, p.officialId, mediaId, id, user.id),
    ],
    audit: { action: "payment.receipt", entity: "payment", entityId: id, countryCode: p.countryCode, after: { documentId: docId } },
  });
  return c.json(
    { receipt: { id: docId, kind: "receipt", status: "verified", mediaId: media.id, filename: upload.filename, contentType: upload.type, url: mediaUrl(media.id) } },
    201,
  );
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
  const before = await loadPayment(db, user, id);
  if (before.status === "paid" || before.status === "cancelled") throw new ApiError(409, "closed", `A ${before.status} payment can no longer be edited`);

  const { reason, ...fields } = b;
  const money = ["transport", "lodging", "meals", "bonus", "deduction"].filter((k) => k in fields);
  if (money.length && !reason) throw new ApiError(422, "reason_required", "Changing an amount needs a written reason");
  if (money.length) {
    const next = { ...(before as unknown as Record<string, number>), ...(fields as Record<string, number>) };
    const total = (before.base as unknown as number) + next.transport + next.lodging + next.meals + next.bonus - next.deduction;
    // a deduction can take a line to zero, never below: ARIS does not invoice its officials
    if (total < 0) throw new ApiError(422, "negative_total", "The deduction is larger than the amount due", { total });
  }

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
    auditStmt(db, user, { action: "payment.adjust", entity: "payment", entityId: id, before: { total: before.total, status: before.status }, after: fields, reason, countryCode: before.countryCode, ip: c.get("ip") }),
  ]);
  return c.json({ payment: asBool(await loadPayment(db, user, id)) });
});

payments.post("/:id/validate", staff, async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const db = c.env.DB;
  const p = await loadPayment(db, user, id);
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
    auditStmt(db, user, { action: "payment.validate", entity: "payment", entityId: id, after: { total: p.total }, countryCode: p.countryCode, ip: c.get("ip") }),
  ]);
  return c.json({ payment: asBool(await loadPayment(db, user, id)) });
});

const paySchema = z.object({ reference: z.string().min(3).max(80) });

payments.post("/:id/pay", staff, async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const { reference } = await readJson(c, paySchema);
  const db = c.env.DB;
  const p = await loadPayment(db, user, id);
  if (p.status === "paid") return c.json({ payment: asBool(p) });
  // Only a validated line can be paid; "validated" already implies the three checks (and the database insists on them too).
  if (p.status !== "validated") throw new ApiError(409, "not_validated", "Only a validated payment can be marked as paid");
  await db.batch([
    db.prepare("UPDATE payments SET status = 'paid', paid_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), payment_ref = ? WHERE id = ? AND status = 'validated'").bind(reference, id),
    auditStmt(db, user, { action: "payment.pay", entity: "payment", entityId: id, after: { reference, total: p.total, net: netOf(p) }, countryCode: p.countryCode, ip: c.get("ip") }),
    ...(await notifyOfficialStmts(db, p.officialId, {
      title: localized("Paiement effectué", "Payment sent"),
      detail: localized(`${netOf(p)} ${p.currency} — réf. ${reference}`, `${netOf(p)} ${p.currency} — ref. ${reference}`),
      tone: "pitch",
      href: "/me",
    })),
  ]);
  return c.json({ payment: asBool(await loadPayment(db, user, id)) });
});

const contestSchema = z.object({ note: z.string().min(5).max(500) });

// The official disputes an amount; staff then resolve it.
payments.post("/:id/contest", async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const { note } = await readJson(c, contestSchema);
  const db = c.env.DB;
  const p = await loadPayment(db, user, id);
  if (p.status !== "due" && p.status !== "validated") throw new ApiError(409, "bad_state", "Only an unpaid amount can be contested");
  await db.batch([
    db.prepare("UPDATE payments SET status = 'contested', contest_note = ? WHERE id = ? AND status IN ('due','validated')").bind(note, id),
    auditStmt(db, user, { action: "payment.contest", entity: "payment", entityId: id, reason: note, countryCode: p.countryCode, ip: c.get("ip") }),
    // whoever pays the line settles the dispute: the host federation, or the administrators for a continental tie
    ...notifyStmts(db, {
      ...(p.countryCode === CONTINENTAL ? { audienceRole: "admin" as const } : { audienceRole: "federation" as const, countryCode: p.countryCode }),
      dedupeKey: `contest:${id}`,
      title: localized("Indemnité contestée", "Payment contested"),
      detail: localized(`${p.officialName} : ${note}`, `${p.officialName}: ${note}`),
      tone: "amber",
      href: "/finance?status=contested",
    }),
  ]);
  return c.json({ payment: asBool(await loadPayment(db, user, id)) });
});

const resolveSchema = z.object({ outcome: z.enum(["due", "cancelled"]), note: z.string().min(3).max(500) });

payments.post("/:id/resolve", staff, async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const b = await readJson(c, resolveSchema);
  const db = c.env.DB;
  const p = await loadPayment(db, user, id);
  if (p.status !== "contested") throw new ApiError(409, "bad_state", "Only a contested payment can be resolved");
  await db.batch([
    db.prepare("UPDATE payments SET status = ?, contest_note = NULL, validated_by = NULL, validated_at = NULL WHERE id = ?").bind(b.outcome, id),
    auditStmt(db, user, { action: "payment.resolve", entity: "payment", entityId: id, after: { outcome: b.outcome }, reason: b.note, countryCode: p.countryCode, ip: c.get("ip") }),
  ]);
  return c.json({ payment: asBool(await loadPayment(db, user, id)) });
});

payments.post("/:id/cancel", staff, async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const { note } = await readJson(c, z.object({ note: z.string().min(3).max(300) }));
  const db = c.env.DB;
  const p = await loadPayment(db, user, id);
  if (p.status === "paid") throw new ApiError(409, "bad_state", "A paid line cannot be cancelled; record a correction instead");
  await db.batch([
    // an advance settled on this line is owed again: it goes back to "paid out, not settled"
    db.prepare("UPDATE advances SET status = 'paid', payment_id = NULL WHERE payment_id = ?").bind(id),
    db.prepare("UPDATE payments SET status = 'cancelled' WHERE id = ? AND status <> 'paid'").bind(id),
    auditStmt(db, user, { action: "payment.cancel", entity: "payment", entityId: id, before: { advanceDeduction: p.advanceDeduction }, reason: note, countryCode: p.countryCode, ip: c.get("ip") }),
  ]);
  return c.json({ payment: asBool(await loadPayment(db, user, id)) });
});

/* ------------------------------------------------------------------ *
 * Advances
 * ------------------------------------------------------------------ */

const ADVANCE_FROM = "FROM advances a JOIN officials o ON o.id = a.official_id";

advances.get("/", async (c) => {
  const user = currentUser(c);
  const q = parseQuery(c, z.object({ country: countryParam.optional(), status: z.enum(["requested", "approved", "paid", "settled", "rejected"]).optional() }));
  const where: string[] = [];
  const args: string[] = [];
  if (isStaff(user)) {
    const scope = countryFilter(user, "o.country_code");
    where.push(scope.sql);
    args.push(...scope.params);
    if (q.country) (where.push("o.country_code = ?"), args.push(q.country));
  } else {
    if (!user.officialId) throw forbidden();
    (where.push("a.official_id = ?"), args.push(user.officialId));
  }
  if (q.status) (where.push("a.status = ?"), args.push(q.status));
  const { results } = await c.env.DB.prepare(
    `SELECT a.id, a.official_id AS officialId, o.name AS officialName, o.country_code AS countryCode, a.fixture_id AS fixtureId, a.amount, a.currency, a.justification, a.status,
            a.requested_at AS requestedAt, a.decided_at AS decidedAt, a.payment_id AS paymentId

       ${ADVANCE_FROM} WHERE ${where.join(" AND ")} ORDER BY a.requested_at DESC LIMIT 200`,
  )
    .bind(...args)
    .all();
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
  const db = c.env.DB;
  // an official asks for themselves; staff ask on behalf of an official of their country
  const officialId = isStaff(user) ? b.officialId : user.officialId;
  if (!officialId) throw new ApiError(422, "official_required", "Say which official the advance is for");
  const access = await assertReadOfficial(db, user, officialId);
  if (b.fixtureId) await assertFixtureLink(db, b.fixtureId, officialId, access.countryCode);
  const id = uuid();
  await db.batch([
    // advances are in the currency of the official's country
    db
      .prepare(
        `INSERT INTO advances (id, official_id, fixture_id, amount, currency, justification)
         VALUES (?, ?, ?, ?, COALESCE((SELECT currency FROM countries WHERE code = ?), 'XOF'), ?)`,
      )
      .bind(id, officialId, b.fixtureId ?? null, b.amount, access.countryCode, b.justification),
    auditStmt(db, user, { action: "advance.request", entity: "advance", entityId: id, after: { officialId, amount: b.amount }, countryCode: access.countryCode, ip: c.get("ip") }),
    ...notifyStmts(db, {
      audienceRole: "federation",
      countryCode: access.countryCode,
      dedupeKey: `advance:${id}`,
      title: localized("Avance demandée", "Advance requested"),
      detail: localized(`${b.amount} — ${b.justification.slice(0, 120)}`, `${b.amount} — ${b.justification.slice(0, 120)}`),
      tone: "amber",
      href: "/finance?tab=advances",
    }),
  ]);
  return c.json({ advance: { id, officialId, amount: b.amount, status: "requested" } }, 201);
});

const decideSchema = z.object({ status: z.enum(["approved", "paid", "settled", "rejected"]) });

// Allowed moves: requested → approved | rejected, approved → paid | rejected, paid → settled.
const NEXT: Record<string, string[]> = { requested: ["approved", "rejected"], approved: ["paid", "rejected"], paid: ["settled"] };

advances.post("/:id/decide", staff, async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const { status } = await readJson(c, decideSchema);
  const db = c.env.DB;
  const row = await db
    .prepare("SELECT a.status, a.official_id AS officialId, o.country_code AS countryCode FROM advances a JOIN officials o ON o.id = a.official_id WHERE a.id = ?")
    .bind(id)
    .first<{ status: string; officialId: string; countryCode: string }>();
  if (!row) throw notFound("Advance");
  assertCountry(user, row.countryCode, "Advance");
  if (!NEXT[row.status]?.includes(status)) throw new ApiError(409, "bad_state", `An advance that is ${row.status} cannot become ${status}`);
  const labels: Record<string, [string, string]> = {
    approved: ["approuvée", "approved"],
    paid: ["versée", "paid"],
    settled: ["régularisée", "settled"],
    rejected: ["refusée", "rejected"],
  };
  await db.batch([
    db.prepare("UPDATE advances SET status = ?, decided_by = ?, decided_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND status = ?").bind(status, user.id, id, row.status),
    auditStmt(db, user, { action: `advance.${status}`, entity: "advance", entityId: id, countryCode: row.countryCode, ip: c.get("ip") }),
    ...(await notifyOfficialStmts(db, row.officialId, {
      title: localized(`Avance ${labels[status][0]}`, `Advance ${labels[status][1]}`),
      detail: localized("Consultez votre espace pour le détail.", "See your space for the details."),
      tone: status === "rejected" ? "amber" : "pitch",
      href: "/me",
    })),
  ]);
  return c.json({ ok: true, status });
});

const settleSchema = z.object({ paymentId: z.string().min(1).max(80) });

// An advance that was paid out is settled by deducting it from one of the same official's unpaid lines, in the same
// currency: the line's `net` drops by the advance, and the advance points at the line it was taken from.
// (Settling without a line — repaid in cash — is still `/decide` with status "settled".)
advances.post("/:id/settle", staff, async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const { paymentId } = await readJson(c, settleSchema);
  const db = c.env.DB;
  const adv = await db
    .prepare("SELECT a.status, a.amount, a.currency, a.official_id AS officialId, o.country_code AS countryCode FROM advances a JOIN officials o ON o.id = a.official_id WHERE a.id = ?")
    .bind(id)
    .first<{ status: string; amount: number; currency: string; officialId: string; countryCode: string }>();
  if (!adv) throw notFound("Advance");
  assertCountry(user, adv.countryCode, "Advance");
  const p = await loadPayment(db, user, paymentId);
  if (p.officialId !== adv.officialId) throw new ApiError(422, "other_official", "The payment line belongs to another official");
  if (adv.status !== "paid") throw new ApiError(409, "bad_state", `An advance that is ${adv.status} cannot be settled on a payment`);
  if (!["due", "validated", "contested"].includes(p.status)) throw new ApiError(409, "payment_closed", `A ${p.status} line can no longer take a deduction`);
  if (p.currency !== adv.currency) throw new ApiError(422, "currency_mismatch", `The advance is in ${adv.currency}, the line in ${p.currency}`);
  if (adv.amount > netOf(p)) throw new ApiError(422, "exceeds_payment", "The advance is larger than what the line still pays", { net: netOf(p), amount: adv.amount });

  // the guards repeat the checks above, so two settlements racing cannot both apply
  const settled = "EXISTS (SELECT 1 FROM advances WHERE id = ? AND payment_id = ?)";
  await db.batch([
    db
      .prepare("UPDATE advances SET status = 'settled', payment_id = ?, decided_by = ?, decided_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND status = 'paid'")
      .bind(paymentId, user.id, id),
    // the amount on the slip changed: a validated line goes back for another look
    db.prepare(`UPDATE payments SET status = 'due', validated_by = NULL, validated_at = NULL WHERE id = ? AND status = 'validated' AND ${settled}`).bind(paymentId, id, paymentId),
    auditStmt(db, user, { action: "advance.settled", entity: "advance", entityId: id, after: { paymentId, amount: adv.amount }, countryCode: adv.countryCode, ip: c.get("ip") }),
    auditStmt(db, user, { action: "payment.advance", entity: "payment", entityId: paymentId, before: { net: netOf(p) }, after: { net: netOf(p) - adv.amount, advanceId: id }, countryCode: p.countryCode, ip: c.get("ip") }),
    ...(await notifyOfficialStmts(db, adv.officialId, {
      title: localized("Avance régularisée", "Advance settled"),
      detail: localized(`${adv.amount} ${adv.currency} déduits de votre indemnité.`, `${adv.amount} ${adv.currency} deducted from your payment.`),
      tone: "pitch",
      href: "/me",
    })),
  ]);
  return c.json
({ ok: true, status: "settled", payment: asBool(await loadPayment(db, user, paymentId)) });
});
