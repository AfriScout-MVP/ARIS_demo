import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { parseQuery, today } from "../lib/http";
import { scopeCountry } from "../lib/access";
import { csvResponse } from "../lib/csv";
import { currentUser, staff } from "../middleware/auth";

export const reports = new Hono<AppEnv>();

// Dashboards are for the people who run the competition; an official has their own space (403).
reports.use("*", staff);

function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const rangeQuery = z.object({
  from: dateSchema.default(() => addDays(today(), -30)),
  to: dateSchema.default(() => addDays(today(), 30)),
  format: z.enum(["json", "csv"]).default("json"),
  /** Admin only: narrow to one country. A federation seat is always confined to its own. */
  country: z.string().length(3).transform((v) => v.toUpperCase()).optional(),
});

/** `AND <column> = ?` for the country the caller is confined to (or asked for, if admin); empty for "everything". */
function only(country: string | null, column: string) {
  return country ? { sql: `AND ${column} = ?`, args: [country] } : { sql: "", args: [] as string[] };
}

reports.get("/overview", async (c) => {
  const user = currentUser(c);
  const q = parseQuery(c, z.object({ country: rangeQuery.shape.country }));
  const cc = scopeCountry(user, q.country);
  const db = c.env.DB;
  const t = today();
  const off = only(cc, "o.country_code"); // officials aliased `o`
  const offBare = only(cc, "country_code");
  const fix = only(cc, "f.country_code");
  const [workforce, byLevel, available, slots, byStatus, budget, perf, licences, fitness, overdue, top, bottom] = await db.batch<Record<string, unknown>>([
    db.prepare(
      `SELECT SUM(kind = 'referee') AS referees, SUM(kind = 'assistant') AS assistants, SUM(status IN ('active','elite-pool','training')) AS active,
              SUM(status = 'suspended') AS suspended, SUM(status = 'training') AS training FROM officials WHERE status <> 'retired' ${offBare.sql}`,
    ).bind(...offBare.args),
    db.prepare(`SELECT level, COUNT(*) AS n FROM officials WHERE status <> 'retired' ${offBare.sql} GROUP BY level`).bind(...offBare.args),
    db.prepare(
      `SELECT COUNT(*) AS n FROM officials o WHERE o.status IN ('active','elite-pool','training') ${off.sql}
          AND NOT EXISTS (SELECT 1 FROM availability a WHERE a.official_id = o.id AND a.date = ? AND a.state = 'unavailable')
          AND NOT EXISTS (SELECT 1 FROM designations d JOIN fixtures f ON f.id = d.fixture_id WHERE d.official_id = o.id AND f.date = ? AND d.state <> 'declined')`,
    ).bind(...off.args, t, t),
    db.prepare(
      `SELECT d.state, COUNT(*) AS n FROM designations d JOIN fixtures f ON f.id = d.fixture_id
        WHERE f.status = 'scheduled' AND f.date >= ? AND d.role <> 'OBS' ${fix.sql} GROUP BY d.state`,
    ).bind(t, ...fix.args),
    db.prepare(`SELECT f.designation_status AS status, COUNT(*) AS n FROM fixtures f WHERE f.status = 'scheduled' AND f.date >= ? ${fix.sql} GROUP BY f.designation_status`).bind(t, ...fix.args),
    db.prepare(
      `SELECT p.currency, SUM(CASE WHEN p.status = 'due' THEN p.total END) AS planned, SUM(CASE WHEN p.status = 'validated' THEN p.total END) AS committed,
              SUM(CASE WHEN p.status = 'paid' THEN p.total END) AS paid, SUM(CASE WHEN p.status = 'contested' THEN p.total END) AS contested
         FROM payments p JOIN officials o ON o.id = p.official_id WHERE p.status <> 'cancelled' ${off.sql} GROUP BY p.currency`,
    ).bind(...off.args),
    db.prepare(`SELECT ROUND(AVG(rmcs_avg), 1) AS avgRating, ROUND(AVG(arps), 1) AS avgArps FROM officials WHERE kind = 'referee' AND status <> 'retired' ${offBare.sql}`).bind(...offBare.args),
    db.prepare(`SELECT SUM(l.expires < ?) AS expired, SUM(l.expires BETWEEN ? AND ?) AS expiring FROM licences l JOIN officials o ON o.id = l.official_id WHERE 1 = 1 ${off.sql}`).bind(t, t, addDays(t, 90), ...off.args),
    db.prepare(`SELECT SUM(t.test1_result = 'failed' OR t.test2_result = 'failed') AS failed FROM fitness_tests t JOIN officials o ON o.id = t.official_id WHERE 1 = 1 ${off.sql}`).bind(...off.args),
    db.prepare(
      `SELECT COUNT(*) AS n FROM assessments a JOIN matches m ON m.id = a.match_id LEFT JOIN competitions c ON c.id = m.league_id
        WHERE a.state = 'overdue' ${only(cc, "c.country_code").sql}`,
    ).bind(...only(cc, "c.country_code").args),
    db.prepare(`SELECT id, name, country_code AS countryCode, rmcs_avg AS rating, trend FROM officials WHERE kind = 'referee' AND status <> 'retired' ${offBare.sql} ORDER BY rmcs_avg DESC, id LIMIT 5`).bind(...offBare.args),
    db.prepare(`SELECT id, name, country_code AS countryCode, rmcs_avg AS rating, trend FROM officials WHERE kind = 'referee' AND status <> 'retired' ${offBare.sql} ORDER BY rmcs_avg ASC, id LIMIT 5`).bind(...offBare.args),
  ]);
  return c.json({
    asOf: t,
    country: cc,
    workforce: { ...workforce.results[0], availableToday: (available.results[0] as { n: number }).n, byLevel: byLevel.results },
    designations: {
      slots: Object.fromEntries((slots.results as Array<{ state: string; n: number }>).map((r) => [r.state, r.n])),
      fixturesByStatus: Object.fromEntries((byStatus.results as Array<{ status: string; n: number }>).map((r) => [r.status, r.n])),
    },
    budget: budget.results,
    performance: { ...perf.results[0], top: top.results, bottom: bottom.results },
    compliance: {
      licencesExpired: (licences.results[0] as { expired: number }).expired ?? 0,
      licencesExpiring90: (licences.results[0] as { expiring: number }).expiring ?? 0,
      fitnessFailed: (fitness.results[0] as { failed: number }).failed ?? 0,
      assessmentsOverdue: (overdue.results[0] as { n: number }).n,
    },
  });
});

// Who is working, who is not: matches per person over a period, flagged against the average.
reports.get("/workload", async (c) => {
  const user = currentUser(c);
  const q = parseQuery(c, rangeQuery.extend({ competition: z.string().optional() }));
  const cc = scopeCountry(user, q.country);
  const off = only(cc, "o.country_code");
  const args: string[] = [q.from, q.to];
  if (q.competition) args.push(q.competition);
  args.push(...off.args);
  const { results } = await c.env.DB.prepare(
    `WITH ap AS (
       SELECT d.official_id, d.role, f.date, f.status FROM designations d JOIN fixtures f ON f.id = d.fixture_id
        WHERE d.official_id IS NOT NULL AND d.state <> 'declined' AND f.date BETWEEN ? AND ? ${q.competition ? "AND f.competition_id = ?" : ""}
     )
     SELECT o.id AS officialId, o.name, o.country_code AS countryCode, o.kind, o.status,
            COUNT(ap.role) AS appointments, COALESCE(SUM(ap.role = 'R'), 0) AS asReferee,
            MAX(CASE WHEN ap.status = 'played' THEN ap.date END) AS lastDate, MIN(CASE WHEN ap.status = 'scheduled' THEN ap.date END) AS nextDate
       FROM officials o LEFT JOIN ap ON ap.official_id = o.id
      WHERE o.status <> 'retired' ${off.sql}
      GROUP BY o.id ORDER BY appointments DESC, o.name`,
  )
    .bind(...args)
    .all<{ appointments: number } & Record<string, unknown>>();
  const mean = results.length ? results.reduce((s, r) => s + r.appointments, 0) / results.length : 0;
  const rows = results.map((r) => ({
    ...r,
    flag: mean > 0 && r.appointments >= Math.max(4, mean * 1.75) ? "overused" : r.appointments === 0 && r.status !== "suspended" ? "unused" : null,
  }));
  if (q.format === "csv") return csvResponse("workload.csv", rows);
  return c.json({ from: q.from, to: q.to, country: cc, mean: Math.round(mean * 10) / 10, rows });
});

reports.get("/absences", async (c) => {
  const user = currentUser(c);
  const q = parseQuery(c, rangeQuery);
  const cc = scopeCountry(user, q.country);
  const off = only(cc, "o.country_code");
  const fix = only(cc, "f.country_code");
  const db = c.env.DB;
  const [incidents, declines, replacements, sanctions] = await db.batch<Record<string, unknown>>([
    db.prepare(`SELECT i.kind, i.status, COUNT(*) AS n FROM incidents i JOIN officials o ON o.id = i.official_id WHERE date(i.reported_at) BETWEEN ? AND ? ${off.sql} GROUP BY i.kind, i.status`).bind(q.from, q.to, ...off.args),
    db.prepare(`SELECT COUNT(*) AS n FROM designation_history h JOIN fixtures f ON f.id = h.fixture_id WHERE h.action = 'decline' AND date(h.at) BETWEEN ? AND ? ${fix.sql}`).bind(q.from, q.to, ...fix.args),
    db.prepare(`SELECT COUNT(*) AS n FROM designation_history h JOIN fixtures f ON f.id = h.fixture_id WHERE h.action = 'replace' AND date(h.at) BETWEEN ? AND ? ${fix.sql}`).bind(q.from, q.to, ...fix.args),
    db.prepare(`SELECT k.sanction, COUNT(*) AS n FROM disciplinary_cases k JOIN officials o ON o.id = k.official_id WHERE k.sanction IS NOT NULL AND date(k.decided_at) BETWEEN ? AND ? ${off.sql} GROUP BY k.sanction`).bind(q.from, q.to, ...off.args),
  ]);
  const rows = {
    incidents: incidents.results,
    refusals: (declines.results[0] as { n: number }).n,
    replacements: (replacements.results[0] as { n: number }).n,
    sanctions: sanctions.results,
  };
  if (q.format === "csv") {
    return csvResponse("absences.csv", [
      ...(incidents.results as Array<Record<string, unknown>>).map((r) => ({ metric: `incident:${r.kind}:${r.status}`, value: r.n })),
      { metric: "refusals", value: rows.refusals },
      { metric: "replacements", value: rows.replacements },
      ...(sanctions.results as Array<Record<string, unknown>>).map((r) => ({ metric: `sanction:${r.sanction}`, value: r.n })),
    ]);
  }
  return c.json({ from: q.from, to: q.to, country: cc, ...rows });
});

reports.get("/fees", async (c) => {
  const user = currentUser(c);
  const q = parseQuery(c, rangeQuery.extend({ groupBy: z.enum(["official", "day", "city", "competition"]).default("official") }));
  const cc = scopeCountry(user, q.country);
  const off = only(cc, "o.country_code");
  const expr = { official: "o.name", day: "f.date", city: "COALESCE(s.city, '')", competition: "f.competition_id" }[q.groupBy];
  const { results } = await c.env.DB.prepare(
    `SELECT ${expr} AS key, p.currency, COUNT(*) AS lines, SUM(p.total) AS total,
            SUM(CASE WHEN p.status = 'paid' THEN p.total ELSE 0 END) AS paid, SUM(CASE WHEN p.status = 'validated' THEN p.total ELSE 0 END) AS validated,
            SUM(CASE WHEN p.status = 'due' THEN p.total ELSE 0 END) AS due, SUM(CASE WHEN p.status = 'contested' THEN p.total ELSE 0 END) AS contested
       FROM payments p JOIN fixtures f ON f.id = p.fixture_id JOIN officials o ON o.id = p.official_id LEFT JOIN stadiums s ON s.id = f.stadium_id
      WHERE f.date BETWEEN ? AND ? AND p.status <> 'cancelled' ${off.sql} GROUP BY ${expr}, p.currency ORDER BY total DESC`,
  )
    .bind(q.from, q.to, ...off.args)
    .all();
  if (q.format === "csv") return csvResponse(`fees-by-${q.groupBy}.csv`, results);
  return c.json({ from: q.from, to: q.to, country: cc, groupBy: q.groupBy, rows: results });
});

// Reconciles matches actually refereed with the sums paid — the control the brief asks for.
reports.get("/reconciliation", async (c) => {
  const user = currentUser(c);
  const q = parseQuery(c, rangeQuery);
  const cc = scopeCountry(user, q.country);
  const off = only(cc, "o.country_code");
  const { results } = await c.env.DB.prepare(
    `SELECT f.id AS fixtureId, f.date, ht.name AS home, aw.name AS away, f.status AS fixtureStatus, d.role, o.name AS officialName, o.country_code AS countryCode,
            d.state AS designation, p.status AS payment, p.total, p.currency,
            CASE WHEN p.id IS NULL AND f.status = 'played' AND d.state = 'confirmed' THEN 'played-not-billed'
                 WHEN p.status = 'paid' AND f.status <> 'played' THEN 'paid-not-played'
                 WHEN p.status = 'paid' AND p.match_validated = 0 THEN 'paid-unvalidated' END AS issue
       FROM designations d JOIN fixtures f ON f.id = d.fixture_id JOIN officials o ON o.id = d.official_id
       JOIN teams ht ON ht.id = f.home_team_id JOIN teams aw ON aw.id = f.away_team_id
       LEFT JOIN payments p ON p.fixture_id = d.fixture_id AND p.role = d.role
      WHERE f.date BETWEEN ? AND ? AND d.official_id IS NOT NULL ${off.sql} ORDER BY f.date, f.id, d.role`,
  )
    .bind(q.from, q.to, ...off.args)
    .all<{ issue: string | null } & Record<string, unknown>>();
  const issues = results.filter((r) => r.issue);
  if (q.format === "csv") return csvResponse("reconciliation.csv", issues);
  return c.json({ from: q.from, to: q.to, country: cc, checked: results.length, issues });
});
