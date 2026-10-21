import type { Env } from "./env";
import { today } from "./lib/http";
import { auditStmt } from "./lib/audit";
import { CONTINENTAL } from "./lib/access";
import { drainOutbox, notifyOfficialStmts, notifyStmts, type NotificationInput } from "./lib/notify";
import { addDays } from "./domain/engine-ctx";
import { syncSuspensions } from "./routes/discipline";

/** Every 15 minutes: deliver queued messages. Daily at 05:00: everything that follows the calendar. */
export async function runScheduled(cron: string, env: Env) {
  if (cron === "0 5 * * *") return runDaily(env);
  return runFrequent(env);
}

export async function runFrequent(env: Env) {
  return { outbox: await drainOutbox(env) };
}

type Notice = Omit<NotificationInput, "userId" | "audienceRole" | "countryCode" | "channels">;

/**
 * A notice for whoever runs a thing in `countryCode`: that country's federation (never role-wide across countries),
 * or the platform administrators when it is a continental tie.
 */
const staffNotice = (db: D1Database, countryCode: string, n: Notice) =>
  notifyStmts(db, countryCode === CONTINENTAL ? { ...n, audienceRole: "admin" } : { ...n, audienceRole: "federation", countryCode });

/**
 * Writes this month's average ARPS of the active referees — continental ('') and per active country — so the trend
 * on the dashboards is real history. Months without any rated referee are left alone.
 */
export async function recordPerformanceHistory(db: D1Database, month: string) {
  const res = await db.batch([
    db
      .prepare(
        `INSERT OR REPLACE INTO performance_history (month, country_code, avg_arps, officials)
         SELECT ?, '', ROUND(AVG(arps), 1), COUNT(*) FROM officials WHERE kind = 'referee' AND status <> 'retired' AND arps > 0 HAVING COUNT(*) > 0`,
      )
      .bind(month),
    db
      .prepare(
        `INSERT OR REPLACE INTO performance_history (month, country_code, avg_arps, officials)
         SELECT ?, o.country_code, ROUND(AVG(o.arps), 1), COUNT(*)
           FROM officials o JOIN countries c ON c.code = o.country_code AND c.active = 1
          WHERE o.kind = 'referee' AND o.status <> 'retired' AND o.arps > 0 GROUP BY o.country_code`,
      )
      .bind(month),
  ]);
  return res.reduce((n, r) => n + (r.meta.changes ?? 0), 0);
}

/** Idempotent: every alert has a dedupe key, so running twice in a day raises nothing twice. */
export async function runDaily(env: Env) {
  const db = env.DB;
  const t = today();
  const summary = { suspensions: 0, licences: 0, overdueReports: 0, unconfirmed: 0, reminders: 0, retests: 0, history: 0, pruned: 0 };

  summary.suspensions = (await syncSuspensions(db)).length;

  // Licences expiring within 60 days (or already expired): tell the official and their federation, once per licence per month.
  const { results: lic } = await db
    .prepare(
      `SELECT l.id, l.kind, l.expires, o.id AS officialId, o.name, o.country_code AS countryCode FROM licences l JOIN officials o ON o.id = l.official_id
        WHERE o.status <> 'retired' AND l.expires <= ? ORDER BY l.expires LIMIT 200`,
    )
    .bind(addDays(t, 60))
    .all<{ id: string; kind: string; expires: string; officialId: string; name: string; countryCode: string }>();
  for (const l of lic) {
    const expired = l.expires < t;
    const bucket = t.slice(0, 7);
    await db.batch([
      ...(await notifyOfficialStmts(db, l.officialId, {
        title: { en: expired ? "Licence expired" : "Licence expiring soon", fr: expired ? "Licence expirée" : "Licence bientôt expirée" },
        detail: { en: `${l.kind} ${expired ? "expired" : "expires"} on ${l.expires}.`, fr: `${l.kind} ${expired ? "expirée" : "expire"} le ${l.expires}.` },
        tone: expired ? "red" : "amber",
        href: "/me",
        dedupeKey: `licence:${l.id}:${bucket}:official`,
      })),
      ...staffNotice(db, l.countryCode, {
        dedupeKey: `licence:${l.id}:${bucket}`,
        title: { en: expired ? "Licence expired" : "Licence expiring", fr: expired ? "Licence expirée" : "Licence à renouveler" },
        detail: { en: `${l.name}: ${l.kind} ${expired ? "expired" : "expires"} on ${l.expires}.`, fr: `${l.name} : ${l.kind} ${expired ? "expirée" : "expire"} le ${l.expires}.` },
        tone: expired ? "red" : "amber",
        href: "/development",
      }),
    ]);
    summary.licences += 1;
  }

  // An observer's report is due within 48 hours of the match.
  const { results: late } = await db
    .prepare(
      `SELECT m.id, ht.name AS home, aw.name AS away, f.country_code AS countryCode
         FROM matches m JOIN fixtures f ON f.id = m.fixture_id JOIN teams ht ON ht.id = m.home_team_id JOIN teams aw ON aw.id = m.away_team_id
        WHERE substr(m.match_date, 1, 10) <= ? AND EXISTS (SELECT 1 FROM designations d WHERE d.fixture_id = f.id AND d.role = 'OBS' AND d.official_id IS NOT NULL)
          AND NOT EXISTS (SELECT 1 FROM assessments a WHERE a.match_id = m.id AND a.state = 'filed')`,
    )
    .bind(addDays(t, -2))
    .all<{ id: string; home: string; away: string; countryCode: string }>();
  for (const m of late) {
    await db.batch([
      db.prepare("UPDATE assessments SET state = 'overdue' WHERE match_id = ? AND state = 'draft'").bind(m.id),
      ...staffNotice(db, m.countryCode, {
        dedupeKey: `obs-overdue:${m.id}`,
        title: { en: "Observer report overdue", fr: "Rapport d'observateur en retard" },
        detail: { en: `${m.home} vs ${m.away} — no report filed within 48 hours.`, fr: `${m.home} – ${m.away} — aucun rapport déposé sous 48 heures.` },
        tone: "amber",
        href: "/assessments",
      }),
    ]);
    summary.overdueReports += 1;
  }

  // Crews still unconfirmed three days out: the federation is told which slots are open.
  const { results: open } = await db
    .prepare(
      `SELECT f.id, f.country_code AS countryCode, ht.name AS home, aw.name AS away, f.date, COUNT(*) AS n
         FROM fixtures f JOIN teams ht ON ht.id = f.home_team_id JOIN teams aw ON aw.id = f.away_team_id JOIN designations d ON d.fixture_id = f.id
        WHERE f.status = 'scheduled' AND f.date BETWEEN ? AND ? AND d.role <> 'OBS' AND d.state IN ('empty','pending','declined') GROUP BY f.id`,
    )
    .bind(t, addDays(t, 3))
    .all<{ id: string; countryCode: string; home: string; away: string; date: string; n: number }>();
  for (const f of open) {
    await db.batch(
      staffNotice(db, f.countryCode, {
        dedupeKey: `unconfirmed:${f.id}:${t}`,
        title: { en: "Crew still open", fr: "Trio incomplet" },
        detail: { en: `${f.home} vs ${f.away} on ${f.date}: ${f.n} slot(s) not confirmed.`, fr: `${f.home} – ${f.away} le ${f.date} : ${f.n} poste(s) non confirmé(s).` },
        tone: "red",
        href: "/calendar",
      }),
    );
    summary.unconfirmed += 1;
  }

  // Designations still waiting for the official's answer, within three days: remind the official.
  const { results: waiting } = await db
    .prepare(
      `SELECT d.fixture_id AS fixtureId, d.role, d.official_id AS officialId, d.version, ht.name AS home, aw.name AS away, f.date
         FROM designations d JOIN fixtures f ON f.id = d.fixture_id JOIN teams ht ON ht.id = f.home_team_id JOIN teams aw ON aw.id = f.away_team_id
        WHERE d.state = 'pending' AND d.official_id IS NOT NULL AND f.status = 'scheduled' AND f.date BETWEEN ? AND ? LIMIT 500`,
    )
    .bind(t, addDays(t, 3))
    .all<{ fixtureId: string; role: string; officialId: string; version: number; home: string; away: string; date: string }>();
  for (const w of waiting) {
    const stmts = await notifyOfficialStmts(db, w.officialId, {
      title: { en: "Designation awaiting your answer", fr: "Désignation en attente de votre réponse" },
      detail: { en: `${w.home} vs ${w.away} on ${w.date}: please accept or decline.`, fr: `${w.home} – ${w.away} le ${w.date} : merci d'accepter ou de refuser.` },
      tone: "amber",
      href: "/me",
      dedupeKey: `awaiting:${w.fixtureId}:${w.role}:${w.version}:${t}`,
    });
    if (stmts.length) await db.batch(stmts);
    summary.reminders += 1;
  }

  const { results: retests } = await db
    .prepare("SELECT official_id AS officialId, retest_date AS retest FROM fitness_tests WHERE retest_date BETWEEN ? AND ?")
    .bind(t, addDays(t, 7))
    .all<{ officialId: string; retest: string }>();
  for (const r of retests) {
    const stmts = await notifyOfficialStmts(db, r.officialId, {
      title: { en: "Fitness retest coming up", fr: "Test physique à repasser" },
      detail: { en: `Your retest is on ${r.retest}.`, fr: `Votre test est fixé au ${r.retest}.` },
      tone: "amber",
      href: "/me",
      dedupeKey: `retest:${r.officialId}:${r.retest}`,
    });
    if (stmts.length) await db.batch(stmts);
    summary.retests += 1;
  }

  summary.history = await recordPerformanceHistory(db, t.slice(0, 7));

  // Housekeeping: sign-in attempts are only useful for the throttle window.
  const pruned = await db.prepare("DELETE FROM login_attempts WHERE at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day')").run();
  summary.pruned = pruned.meta.changes ?? 0;
  await db.batch([auditStmt(db, null, { action: "cron.daily", entity: "system", after: summary })]);
  return summary;
}
