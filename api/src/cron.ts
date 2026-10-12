import type { Env } from "./env";
import { today } from "./lib/http";
import { auditStmt } from "./lib/audit";
import { drainOutbox, notifyOfficialStmts, notifyStmts } from "./lib/notify";
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

/** Idempotent: every alert has a dedupe key, so running twice in a day raises nothing twice. */
export async function runDaily(env: Env) {
  const db = env.DB;
  const t = today();
  const summary = { suspensions: 0, licences: 0, overdueReports: 0, unconfirmed: 0, retests: 0, pruned: 0 };

  summary.suspensions = (await syncSuspensions(db)).length;

  // Licences expiring within 60 days (or already expired): tell the official and the commission, once per licence per month.
  const { results: lic } = await db
    .prepare(
      `SELECT l.id, l.kind, l.expires, o.id AS officialId, o.name FROM licences l JOIN officials o ON o.id = l.official_id
        WHERE o.status <> 'retired' AND l.expires <= ? ORDER BY l.expires LIMIT 200`,
    )
    .bind(addDays(t, 60))
    .all<{ id: string; kind: string; expires: string; officialId: string; name: string }>();
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
      ...notifyStmts(db, {
        audienceRole: "commission",
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
      `SELECT m.id, m.home, m.away FROM matches m JOIN fixtures f ON f.id = m.fixture_id
        WHERE f.date <= ? AND EXISTS (SELECT 1 FROM designations d WHERE d.fixture_id = f.id AND d.role = 'OBS' AND d.official_id IS NOT NULL)
          AND NOT EXISTS (SELECT 1 FROM assessments a WHERE a.match_id = m.id AND a.state = 'filed')`,
    )
    .bind(addDays(t, -2))
    .all<{ id: string; home: string; away: string }>();
  for (const m of late) {
    await db.batch([
      db.prepare("UPDATE assessments SET state = 'overdue' WHERE match_id = ? AND state = 'draft'").bind(m.id),
      ...notifyStmts(db, {
        audienceRole: "commission",
        dedupeKey: `obs-overdue:${m.id}`,
        title: { en: "Observer report overdue", fr: "Rapport d'observateur en retard" },
        detail: { en: `${m.home} vs ${m.away} — no report filed within 48 hours.`, fr: `${m.home} – ${m.away} — aucun rapport déposé sous 48 heures.` },
        tone: "amber",
        href: "/assessments",
      }),
    ]);
    summary.overdueReports += 1;
  }

  // Crews still unconfirmed three days out.
  const { results: open } = await db
    .prepare(
      `SELECT f.id, f.home, f.away, f.date, COUNT(*) AS n FROM fixtures f JOIN designations d ON d.fixture_id = f.id
        WHERE f.played = 0 AND f.date BETWEEN ? AND ? AND d.role <> 'OBS' AND d.state IN ('empty','pending','declined') GROUP BY f.id`,
    )
    .bind(t, addDays(t, 3))
    .all<{ id: string; home: string; away: string; date: string; n: number }>();
  for (const f of open) {
    await db.batch(
      notifyStmts(db, {
        audienceRole: "commission",
        dedupeKey: `unconfirmed:${f.id}:${t}`,
        title: { en: "Crew still open", fr: "Trio incomplet" },
        detail: { en: `${f.home} vs ${f.away} on ${f.date}: ${f.n} slot(s) not confirmed.`, fr: `${f.home} – ${f.away} le ${f.date} : ${f.n} poste(s) non confirmé(s).` },
        tone: "red",
        href: "/calendar",
      }),
    );
    summary.unconfirmed += 1;
  }

  const { results: retests } = await db
    .prepare("SELECT official_id AS officialId, retest_date AS retest FROM fitness_tests WHERE retest_date BETWEEN ? AND ?")
    .bind(t, addDays(t, 7))
    .all<{ officialId: string; retest: string }>();
  for (const r of retests) {
    await db.batch(
      await notifyOfficialStmts(db, r.officialId, {
        title: { en: "Fitness retest coming up", fr: "Test physique à repasser" },
        detail: { en: `Your retest is on ${r.retest}.`, fr: `Votre test est fixé au ${r.retest}.` },
        tone: "amber",
        href: "/me",
        dedupeKey: `retest:${r.officialId}:${r.retest}`,
      }),
    );
    summary.retests += 1;
  }

  // Housekeeping: sign-in attempts are only useful for the throttle window.
  const pruned = await db.prepare("DELETE FROM login_attempts WHERE at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day')").run();
  summary.pruned = pruned.meta.changes ?? 0;
  await db.batch([auditStmt(db, null, { action: "cron.daily", entity: "system", after: summary })]);
  return summary;
}
