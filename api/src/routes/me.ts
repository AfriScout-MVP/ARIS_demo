import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { ApiError, parseQuery, today } from "../lib/http";
import { currentUser } from "../middleware/auth";
import { json, toOfficialFile, type OfficialRow } from "../domain/mappers";
import { addDays } from "../domain/engine-ctx";

/** An official's personal space: their file, their matches, their money, what is waiting for them. */
export const me = new Hono<AppEnv>();

me.use("*", async (c, next) => {
  const user = currentUser(c);
  if (!user.officialId) throw new ApiError(403, "no_official", "This account is not linked to an official");
  await next();
});

me.get("/", async (c) => {
  const user = currentUser(c);
  const id = user.officialId!;
  const db = c.env.DB;
  const t = today();
  const [file, awaiting, upcoming, money, unread, licences, hearing] = await db.batch<Record<string, unknown>>([
    db.prepare("SELECT * FROM officials WHERE id = ?").bind(id),
    db.prepare("SELECT COUNT(*) AS n FROM designations d JOIN fixtures f ON f.id = d.fixture_id WHERE d.official_id = ? AND d.state = 'pending' AND f.date >= ?").bind(id, t),
    db.prepare("SELECT COUNT(*) AS n FROM designations d JOIN fixtures f ON f.id = d.fixture_id WHERE d.official_id = ? AND d.state IN ('pending','confirmed') AND f.date >= ?").bind(id, t),
    db.prepare("SELECT status, currency, SUM(total) AS total, COUNT(*) AS lines FROM payments WHERE official_id = ? AND status <> 'cancelled' GROUP BY status, currency").bind(id),
    db.prepare("SELECT COUNT(*) AS n FROM notifications n LEFT JOIN notification_reads r ON r.notification_id = n.id AND r.user_id = ?1 WHERE (n.user_id = ?1 OR n.audience_role = ?2) AND r.user_id IS NULL").bind(user.id, user.role),
    db.prepare("SELECT kind, expires FROM licences WHERE official_id = ? AND expires <= ? ORDER BY expires").bind(id, addDays(t, 90)),
    db.prepare("SELECT id, status, hearing_at AS hearingAt, sanction FROM disciplinary_cases WHERE official_id = ? AND status IN ('opened','hearing_scheduled','decided','appealed') ORDER BY opened_at DESC").bind(id),
  ]);
  const row = file.results[0] as unknown as OfficialRow | undefined;
  if (!row) throw new ApiError(404, "not_found", "Your official file was not found");
  return c.json({
    user,
    official: toOfficialFile(row, true),
    awaitingResponse: (awaiting.results[0] as { n: number }).n,
    upcomingDesignations: (upcoming.results[0] as { n: number }).n,
    payments: money.results,
    unreadNotifications: (unread.results[0] as { n: number }).n,
    licencesNeedingAttention: licences.results,
    openCases: hearing.results,
  });
});

me.get("/designations", async (c) => {
  const user = currentUser(c);
  const q = parseQuery(c, z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default(() => addDays(today(), -60)), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default(() => addDays(today(), 120)) }));
  const { results } = await c.env.DB.prepare(
    `SELECT f.id AS fixtureId, d.role, d.state, d.version, f.home, f.away, f.date, f.kickoff, f.venue, f.city, f.played, f.designation_status AS fixtureStatus, c.name AS competition
       FROM designations d JOIN fixtures f ON f.id = d.fixture_id JOIN competitions c ON c.id = f.competition_id
      WHERE d.official_id = ? AND f.date BETWEEN ? AND ? ORDER BY f.date, f.kickoff`,
  )
    .bind(user.officialId, q.from, q.to)
    .all();
  return c.json({ designations: results });
});

me.get("/history", async (c) => {
  const user = currentUser(c);
  const { results } = await c.env.DB.prepare(
    `SELECT m.id, m.date, m.home, m.away, m.score, d.role FROM matches m JOIN designations d ON d.fixture_id = m.fixture_id WHERE d.official_id = ? ORDER BY m.date DESC LIMIT 100`,
  )
    .bind(user.officialId)
    .all();
  return c.json({ matches: results });
});

export { json };
