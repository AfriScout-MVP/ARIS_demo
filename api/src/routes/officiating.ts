import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { ApiError, notFound, readJson } from "../lib/http";
import { auditStmt } from "../lib/audit";
import { assertCountry } from "../lib/access";
import { currentUser, staff } from "../middleware/auth";
import { json } from "../domain/mappers";
import { MATCH_SQL, toMatch, type MatchRow } from "../domain/matches";

/**
 * What the positioning screen draws, entered by the federation (or the platform) when there is no tracking feed:
 * the referee's presence on the pitch, the physical load, the pressure through the match and the weather.
 * Mounted at `/matches`, next to the match routes in `assessments.ts`.
 *
 *   PUT /matches/:id/officiating/:officialId    admin, or the federation of the match's country
 *
 * `:officialId` is the match's referee — `match_officiating` describes the referee's game, so naming anyone else is a 422.
 */
export const officiating = new Hono<AppEnv>();

/** The pitch is 105 × 68 m; presence samples are positions on it, weighted 0–1. */
export const PITCH = { length: 105, width: 68 } as const;
const MAX_HEAT_POINTS = 1500;
const MAX_TIMELINE = 140;

const heatPoint = z.object({
  x: z.number().finite().min(0).max(PITCH.length),
  y: z.number().finite().min(0).max(PITCH.width),
  intensity: z.number().finite().min(0).max(1),
});

const physicalSchema = z.object({
  distanceKm: z.number().finite().min(0).max(20),
  sprints: z.number().int().min(0).max(400),
  topSpeed: z.number().finite().min(0).max(45),
  avgDistanceToBall: z.number().finite().min(0).max(110),
  diagonalAdherence: z.number().finite().min(0).max(100),
});

const timelinePoint = z.object({ minute: z.number().int().min(0).max(130), pressure: z.number().finite().min(0).max(100) });

const weatherSchema = z.object({
  condition: z.string().trim().min(1).max(40).regex(/^[\p{L}\p{N} .,'()/-]+$/u, "Plain words only"),
  temperatureC: z.number().finite().min(-30).max(60).nullable().optional(),
  humidity: z.number().finite().min(0).max(100).nullable().optional(),
});

const bodySchema = z
  .object({
    heatPoints: z.array(heatPoint).max(MAX_HEAT_POINTS).optional(),
    physical: physicalSchema.nullable().optional(),
    pressureTimeline: z
      .array(timelinePoint)
      .max(MAX_TIMELINE)
      .refine((pts) => new Set(pts.map((p) => p.minute)).size === pts.length, "One value per minute")
      .optional(),
    weather: weatherSchema.nullable().optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, "Nothing to record");

officiating.put("/:id/officiating/:officialId", staff, async (c) => {
  const user = currentUser(c);
  const db = c.env.DB;
  const matchId = c.req.param("id");
  const officialId = c.req.param("officialId");
  const b = await readJson(c, bodySchema);

  const match = await db.prepare(`${MATCH_SQL} WHERE m.id = ?`).bind(matchId).first<MatchRow>();
  if (!match) throw notFound("Match");
  assertCountry(user, match.country_code, "Match");
  if (!match.referee_id || match.referee_id !== officialId) {
    throw new ApiError(422, "not_the_referee", "Positioning data describes the match's referee; name that official");
  }

  const timeline = b.pressureTimeline?.slice().sort((x, y) => x.minute - y.minute);
  // the match's average pressure follows the recorded timeline; without one it keeps whatever it had
  const pressureAvg = timeline && timeline.length ? Math.round((timeline.reduce((s, p) => s + p.pressure, 0) / timeline.length) * 10) / 10 : null;
  const before = {
    heatPoints: json<unknown[]>(match.heat_points, []).length,
    physical: json<Record<string, number>>(match.physical, {}),
    pressureTimeline: json<unknown[]>(match.pressure_timeline, []).length,
    weather: json<unknown>(match.weather_conditions, null),
  };

  const stmts: D1PreparedStatement[] = [
    db
      .prepare(
        // `arps_for_match` and `rmcs` are not touched: they come from the analytics feed and the observer's report
        `INSERT INTO match_officiating (match_id, arps_for_match, rmcs, pressure_avg, physical, pressure_timeline, heat_points)
         VALUES (?1, 0, 0, COALESCE(?2, 0), COALESCE(?3, '{}'), COALESCE(?4, '[]'), COALESCE(?5, '[]'))
         ON CONFLICT (match_id) DO UPDATE SET
           pressure_avg = COALESCE(?2, pressure_avg),
           physical = COALESCE(?3, physical),
           pressure_timeline = COALESCE(?4, pressure_timeline),
           heat_points = COALESCE(?5, heat_points)`,
      )
      .bind(
        matchId,
        pressureAvg,
        b.physical === undefined ? null : JSON.stringify(b.physical ?? {}),
        timeline === undefined ? null : JSON.stringify(timeline),
        b.heatPoints === undefined ? null : JSON.stringify(b.heatPoints),
      ),
  ];
  if (b.weather !== undefined) {
    stmts.push(
      db
        .prepare("UPDATE matches SET weather_conditions = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?")
        .bind(b.weather === null ? null : JSON.stringify(b.weather), matchId),
    );
  } else {
    stmts.push(db.prepare("UPDATE matches SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").bind(matchId));
  }
  stmts.push(
    auditStmt(db, user, {
      action: "match.positioning",
      entity: "match",
      entityId: matchId,
      // the counts, not the point clouds: the trail says what changed without copying hundreds of samples
      before,
      after: {
        ...(b.heatPoints !== undefined ? { heatPoints: b.heatPoints.length } : {}),
        ...(b.physical !== undefined ? { physical: b.physical } : {}),
        ...(timeline !== undefined ? { pressureTimeline: timeline.length } : {}),
        ...(b.weather !== undefined ? { weather: b.weather } : {}),
      },
      countryCode: match.country_code,
      ip: c.get("ip"),
    }),
  );
  await db.batch(stmts);

  const fresh = (await db.prepare(`${MATCH_SQL} WHERE m.id = ?`).bind(matchId).first<MatchRow>())!;
  const { decisions: _decisions, ...light } = toMatch(fresh, [], { withHeat: true });
  return c.json({ match: light });
});
