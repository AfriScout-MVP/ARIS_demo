import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { ApiError, parseQuery, today } from "../lib/http";
import { currentUser } from "../middleware/auth";
import { localParts } from "../lib/time";
import { toOfficialFile, type OfficialRow } from "../domain/mappers";
import { MATCH_SQL, toMatch, type MatchRow } from "../domain/matches";
import { VISIBLE_SQL, visibilityArgs } from "./notifications";

/** An official's personal space: their file, their matches, their money, what is waiting for them. */
export const me = new Hono<AppEnv>();

const addDays = (iso: string, days: number) => new Date(new Date(`${iso}T12:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

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
    db.prepare(`SELECT COUNT(*) AS n FROM notifications n LEFT JOIN notification_reads r ON r.notification_id = n.id AND r.user_id = ?1 WHERE ${VISIBLE_SQL} AND r.user_id IS NULL`).bind(...visibilityArgs(user)),
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
  const q = parseQuery(c, z.object({ from: DATE.default(() => addDays(today(), -60)), to: DATE.default(() => addDays(today(), 120)) }));
  // fixtures are stored in UTC: widen the window by a day, then keep what falls in the range on the venue's local calendar
  const { results } = await c.env.DB.prepare(
    `SELECT f.id AS fixtureId, d.role, d.state, d.version, ht.name AS home, aw.name AS away, f.kickoff_at AS kickoffAt, f.status AS fixtureState,
            s.name AS venue, s.city AS city, f.designation_status AS fixtureStatus, c.name AS competition, k.timezone AS tz
       FROM designations d
       JOIN fixtures f ON f.id = d.fixture_id
       JOIN competitions c ON c.id = f.competition_id
       JOIN teams ht ON ht.id = f.home_team_id
       JOIN teams aw ON aw.id = f.away_team_id
       LEFT JOIN stadiums s ON s.id = f.stadium_id
       LEFT JOIN countries k ON k.code = COALESCE(s.country, f.country_code)
      WHERE d.official_id = ? AND f.date BETWEEN ? AND ? ORDER BY f.kickoff_at`,
  )
    .bind(user.officialId, addDays(q.from, -1), addDays(q.to, 1))
    .all<{ kickoffAt: string; tz: string | null } & Record<string, unknown>>();
  const designations = results
    .map(({ tz, ...r }) => {
      const local = localParts(r.kickoffAt, tz ?? "UTC");
      return { ...r, date: local.date, kickoff: local.time, played: r.fixtureState === "played" };
    })
    .filter((r) => r.date >= q.from && r.date <= q.to);
  return c.json({ designations });
});

me.get("/history", async (c) => {
  const user = currentUser(c);
  const { results } = await c.env.DB.prepare(
    `SELECT x.*, d.role, k.timezone AS tz FROM (${MATCH_SQL}) x
       JOIN designations d ON d.fixture_id = x.fixture_id
       LEFT JOIN countries k ON k.code = x.country_code
      WHERE d.official_id = ? ORDER BY x.match_date DESC LIMIT 100`,
  )
    .bind(user.officialId)
    .all<MatchRow & { role: string; tz: string | null }>();
  return c.json({
    matches: results.map((r) => {
      const local = localParts(r.match_date, r.tz ?? "UTC");
      return { ...toMatch(r), date: local.date, kickoff: local.time, kickoffAt: r.match_date, role: r.role };
    }),
  });
});
