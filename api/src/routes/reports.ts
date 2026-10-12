import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { forbidden, parseQuery, today } from "../lib/http";
import { isStaff } from "../lib/access";
import { csvResponse } from "../lib/csv";
import { currentUser } from "../middleware/auth";
import { addDays } from "../domain/engine-ctx";

export const reports = new Hono<AppEnv>();

// Dashboards are for the people who run the competition; an official has their own space.
reports.use("*", async (c, next) => {
  const user = currentUser(c);
  if (!isStaff(user) && user.role !== "observer") throw forbidden();
  await next();
});

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const rangeQuery = z.object({
  from: dateSchema.default(() => addDays(today(), -30)),
  to: dateSchema.default(() => addDays(today(), 30)),
  format: z.enum(["json", "csv"]).default("json"),
});

reports.get("/overview", async (c) => {
  const db = c.env.DB;
  const t = today();
  const [workforce, byLevel, available, slots, byStatus, budget, perf, licences, fitness, overdue, top, bottom] = await db.batch<Record<string, unknown>>([
    db.prepare(
      `SELECT SUM(kind = 'referee') AS referees, SUM(kind = 'assistant') AS assistants, SUM(status IN ('active','elite-pool','training')) AS active,
              SUM(status = 'suspended') AS suspended, SUM(status = 'training') AS training FROM officials WHERE status <> 'retired'`,
    ),
    db.prepare("SELECT level, COUNT(*) AS n FROM officials WHERE status <> 'retired' GROUP BY level"),
    db.prepare(
      `SELECT COUNT(*) AS n FROM officials o WHERE o.status IN ('active','elite-pool','training')
          AND NOT EXISTS (SELECT 1 FROM availability a WHERE a.official_id = o.id AND a.date = ?1 AND a.state = 'unavailable')
          AND NOT EXISTS (SELECT 1 FROM designations d JOIN fixtures f ON f.id = d.fixture_id WHERE d.official_id = o.id AND f.date = ?1 AND d.state <> 'declined')`,
    ).bind(t),
    db.prepare(
      `SELECT d.state, COUNT(*) AS n FROM designations d JOIN fixtures f ON f.id = d.fixture_id
        WHERE f.played = 0 AND f.date >= ?1 AND d.role <> 'OBS' GROUP BY d.state`,
    ).bind(t),
    db.prepare("SELECT designation_status AS status, COUNT(*) AS n FROM fixtures WHERE played = 0 AND date >= ? GROUP BY designation_status").bind(t),
    db.prepare(
      `SELECT currency, SUM(CASE WHEN status = 'due' THEN total END) AS planned, SUM(CASE WHEN status = 'validated' THEN total END) AS committed,
              SUM(CASE WHEN status = 'paid' THEN total END) AS paid, SUM(CASE WHEN status = 'contested' THEN total END) AS contested
         FROM payments WHERE status <> 'cancelled' GROUP BY currency`,
    ),
    db.prepare("SELECT ROUND(AVG(rmcs_avg), 1) AS avgRating, ROUND(AVG(arps), 1) AS avgArps FROM officials WHERE kind = 'referee' AND status <> 'retired'"),
    db.prepare("SELECT SUM(expires < ?1) AS expired, SUM(expires BETWEEN ?1 AND ?2) AS expiring FROM licences").bind(t, addDays(t, 90)),
    db.prepare("SELECT SUM(test1_result = 'failed' OR test2_result = 'failed') AS failed FROM fitness_tests"),
    db.prepare("SELECT COUNT(*) AS n FROM assessments WHERE state = 'overdue'"),
    db.prepare("SELECT id, name, country_code AS countryCode, rmcs_avg AS rating, trend FROM officials WHERE kind = 'referee' AND status <> 'retired' ORDER BY rmcs_avg DESC LIMIT 5"),
    db.prepare("SELECT id, name, country_code AS countryCode, rmcs_avg AS rating, trend FROM officials WHERE kind = 'referee' AND status <> 'retired' ORDER BY rmcs_avg ASC LIMIT 5"),
  ]);
  return c.json({
    asOf: t,
    workforce: { ...workforce.results[0], availableToday: (available.results[0] as { n: number }).n, byLevel: byLevel.results },
    designations: {
      slots: Object.fromEntries((slots.results as Array<{ state: string; n: number }>).map((r) => [r.state, r.n])),
      fixturesByStatus: Object.fromEntries((byStatus.results as Array<{ status: string; n: number }>).map((r) => [r.status, r.n])),
    },
    budget: budget.results,
    performance: { ...perf.results[0], top: top.results, bottom: bottom.results },
    compliance: { licencesExpired: (licences.results[0] as { expired: number }).expired ?? 0, licencesExpiring90: (licences.results[0] as { expiring: number }).expiring ?? 0, fitnessFailed: (fitness.results[0] as { failed: number }).failed ?? 0, assessmentsOverdue: (overdue.results[0] as { n: number }).n },
  });
});

// Who is working, who is not: matches per person over a period, flagged against the average.
reports.get("/workload", async (c) => {
  const q = parseQuery(c, rangeQuery.extend({ competition: z.string().optional(), country: z.string().length(3).optional() }));
  const args: string[] = [q.from, q.to];
  if (q.competition) args.push(q.competition);
  if (q.country) args.push(q.country.toUpperCase());
  const { results } = await c.env.DB.prepare(
    `WITH ap AS (
       SELECT d.official_id, d.role, f.date, f.played FROM designations d JOIN fixtures f ON f.id = d.fixture_id
        WHERE d.official_id IS NOT NULL AND d.state <> 'declined' AND f.date BETWEEN ? AND ? ${q.competition ? "AND f.competition_id = ?" : ""}
     )
     SELECT o.id AS officialId, o.name, o.country_code AS countryCode, o.kind, o.status,
            COUNT(ap.role) AS appointments, COALESCE(SUM(ap.role = 'R'), 0) AS asReferee,
            MAX(CASE WHEN ap.played = 1 THEN ap.date END) AS lastDate, MIN(CASE WHEN ap.played = 0 THEN ap.date END) AS nextDate
       FROM officials o LEFT JOIN ap ON ap.official_id = o.id
      WHERE o.status <> 'retired' ${q.country ? "AND o.country_code = ?" : ""}
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
  return c.json({ from: q.from, to: q.to, mean: Math.round(mean * 10) / 10, rows });
});

reports.get("/absences", async (c) => {
  const q = parseQuery(c, rangeQuery);
  const db = c.env.DB;
  const [incidents, declines, replacements, sanctions] = await db.batch<Record<string, unknown>>([
    db.prepare("SELECT kind, status, COUNT(*) AS n FROM incidents WHERE date(reported_at) BETWEEN ? AND ? GROUP BY kind, status").bind(q.from, q.to),
    db.prepare("SELECT COUNT(*) AS n FROM designation_history WHERE action = 'decline' AND date(at) BETWEEN ? AND ?").bind(q.from, q.to),
    db.prepare("SELECT COUNT(*) AS n FROM designation_history WHERE action = 'replace' AND date(at) BETWEEN ? AND ?").bind(q.from, q.to),
    db.prepare("SELECT sanction, COUNT(*) AS n FROM disciplinary_cases WHERE sanction IS NOT NULL AND date(decided_at) BETWEEN ? AND ? GROUP BY sanction").bind(q.from, q.to),
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
  return c.json({ from: q.from, to: q.to, ...rows });
});

reports.get("/fees", async (c) => {
  const q = parseQuery(c, rangeQuery.extend({ groupBy: z.enum(["official", "day", "city", "competition"]).default("official") }));
  const expr = { official: "o.name", day: "f.date", city: "f.city", competition: "f.competition_id" }[q.groupBy];
  const { results } = await c.env.DB.prepare(
    `SELECT ${expr} AS key, p.currency, COUNT(*) AS lines, SUM(p.total) AS total,
            SUM(CASE WHEN p.status = 'paid' THEN p.total ELSE 0 END) AS paid, SUM(CASE WHEN p.status = 'validated' THEN p.total ELSE 0 END) AS validated,
            SUM(CASE WHEN p.status = 'due' THEN p.total ELSE 0 END) AS due, SUM(CASE WHEN p.status = 'contested' THEN p.total ELSE 0 END) AS contested
       FROM payments p JOIN fixtures f ON f.id = p.fixture_id JOIN officials o ON o.id = p.official_id
      WHERE f.date BETWEEN ? AND ? AND p.status <> 'cancelled' GROUP BY ${expr}, p.currency ORDER BY total DESC`,
  )
    .bind(q.from, q.to)
    .all();
  if (q.format === "csv") return csvResponse(`fees-by-${q.groupBy}.csv`, results);
  return c.json({ from: q.from, to: q.to, groupBy: q.groupBy, rows: results });
});

// Reconciles matches actually refereed with the sums paid — the control the brief asks for.
reports.get("/reconciliation", async (c) => {
  const q = parseQuery(c, rangeQuery);
  const { results } = await c.env.DB.prepare(
    `SELECT f.id AS fixtureId, f.date, f.home, f.away, f.played, d.role, o.name AS officialName, d.state AS designation, p.status AS payment, p.total, p.currency,
            CASE WHEN p.id IS NULL AND f.played = 1 AND d.state = 'confirmed' THEN 'played-not-billed'
                 WHEN p.status = 'paid' AND f.played = 0 THEN 'paid-not-played'
                 WHEN p.status = 'paid' AND p.match_validated = 0 THEN 'paid-unvalidated' END AS issue
       FROM designations d JOIN fixtures f ON f.id = d.fixture_id JOIN officials o ON o.id = d.official_id LEFT JOIN payments p ON p.fixture_id = d.fixture_id AND p.role = d.role
      WHERE f.date BETWEEN ? AND ? AND d.official_id IS NOT NULL ORDER BY f.date`,
  )
    .bind(q.from, q.to)
    .all<{ issue: string | null } & Record<string, unknown>>();
  const issues = results.filter((r) => r.issue);
  if (q.format === "csv") return csvResponse("reconciliation.csv", issues);
  return c.json({ from: q.from, to: q.to, checked: results.length, issues });
});
