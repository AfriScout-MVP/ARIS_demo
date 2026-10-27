import { Hono } from "hono";
import { z } from "zod";
import { LOCALES, type AppEnv } from "../env";
import { mediaUrl } from "../domain/mappers";
import { ApiError, readJson, uuid } from "../lib/http";
import { auditStmt } from "../lib/audit";
import { localized } from "../lib/localized";
import { notifyStmts } from "../lib/notify";

/**
 * What the signed-out landing page shows: the supported countries and a few headline figures, read live from
 * the database. Mounted BEFORE the sign-in gate, so it carries nothing personal — no names of people, no sync
 * internals, only counts and the public identity of each federation.
 */
export const publicApi = new Hono<AppEnv>();

interface Row {
  code: string;
  iso2: string;
  name: string;
  name_fr: string;
  name_es: string;
  name_de: string;
  flag_media_id: string | null;
  fed_code: string | null;
  fed_name: string | null;
}

/** The landing page's activity panel covers this many days. */
export const ACTIVITY_DAYS = 7;

publicApi.get("/summary", async (c) => {
  const db = c.env.DB;
  const since = `-${ACTIVITY_DAYS} days`;
  const [countries, figures, activity] = await db.batch([
    db.prepare(
      `SELECT c.code, c.iso2, c.name, c.name_fr, c.name_es, c.name_de, c.flag_media_id, f.code AS fed_code, f.name AS fed_name
         FROM countries c LEFT JOIN federations f ON f.country = c.code
        WHERE c.active = 1
        ORDER BY c.name COLLATE NOCASE`,
    ),
    db.prepare(
      `SELECT (SELECT COUNT(*) FROM countries WHERE active = 1) AS countries,
              (SELECT COUNT(*) FROM officials o JOIN countries c ON c.code = o.country_code WHERE c.active = 1 AND o.status <> 'retired') AS officials,
              (SELECT COUNT(*) FROM competitions WHERE is_active = 1) AS competitions,
              (SELECT COUNT(*) FROM evaluation_criteria) AS criteria`,
    ),
    // What each live federation did this week, as counts only: crews published and observer reports filed.
    // No names, no matches, no times — nothing that identifies a person or a fixture.
    db
      .prepare(
        `SELECT x.cc AS country, f.code AS federation, x.kind, COUNT(*) AS n FROM (
            SELECT country_code AS cc, 'designationsPublished' AS kind FROM fixtures
             WHERE published_at IS NOT NULL AND published_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?1)
            UNION ALL
            SELECT c.country_code, 'assessmentsFiled' FROM assessments a JOIN matches m ON m.id = a.match_id JOIN competitions c ON c.id = m.league_id
             WHERE a.state = 'filed' AND a.filed_at IS NOT NULL AND a.filed_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?1)
          ) x JOIN countries co ON co.code = x.cc AND co.active = 1 JOIN federations f ON f.country = x.cc
          GROUP BY x.cc, f.code, x.kind`,
      )
      .bind(since),
  ]);
  const byFederation = new Map<string, { country: string; federation: string; designationsPublished: number; assessmentsFiled: number }>();
  for (const r of activity.results as Array<{ country: string; federation: string; kind: "designationsPublished" | "assessmentsFiled"; n: number }>) {
    const row = byFederation.get(r.country) ?? { country: r.country, federation: r.federation, designationsPublished: 0, assessmentsFiled: 0 };
    row[r.kind] = r.n;
    byFederation.set(r.country, row);
  }
  const f = (figures.results[0] ?? {}) as Record<string, number>;
  c.header("Cache-Control", "public, max-age=300");
  return c.json({
    countries: (countries.results as unknown as Row[]).map((r) => ({
      code: r.code,
      iso2: r.iso2,
      name: r.name,
      nameFr: r.name_fr,
      nameEs: r.name_es,
      nameDe: r.name_de,
      flagUrl: mediaUrl(r.flag_media_id),
      federation: r.fed_code,
      federationName: r.fed_name,
    })),
    figures: {
      countries: f.countries ?? 0,
      officials: f.officials ?? 0,
      competitions: f.competitions ?? 0,
      criteria: f.criteria ?? 0,
    },
    activity: {
      days: ACTIVITY_DAYS,
      federations: [...byFederation.values()].sort(
        (a, b) => b.designationsPublished + b.assessmentsFiled - (a.designationsPublished + a.assessmentsFiled) || a.federation.localeCompare(b.federation),
      ),
    },
  });
});

/** Every country on the platform's list, supported or not: what the contact form offers. Geography only. */
publicApi.get("/countries", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT code, name, name_fr AS nameFr, name_es AS nameEs, name_de AS nameDe, active FROM countries ORDER BY name COLLATE NOCASE",
  ).all<{ code: string; name: string; nameFr: string; nameEs: string; nameDe: string; active: number }>();
  c.header("Cache-Control", "public, max-age=3600");
  return c.json({ countries: results.map((r) => ({ ...r, active: r.active === 1 })) });
});

/* ------------------------------------------------------------------ *
 * The landing page's contact / demo-request form
 * ------------------------------------------------------------------ */

/** Accepted submissions per IP per hour, and across the whole platform per day (a flood from many addresses). */
export const CONTACT_MAX_PER_IP = 5;
export const CONTACT_MAX_PER_DAY = 300;

/** Plain text only: tags and angle brackets go, control characters go, runs of blank lines shrink. */
export function plainText(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, " ")
    .replace(/[<>]/g, "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const text = (min: number, max: number) =>
  z
    .string()
    .max(max * 2)
    .transform(plainText)
    .pipe(z.string().min(min).max(max));

const contactSchema = z.object({
  name: text(2, 120),
  email: z.string().trim().toLowerCase().email().max(200),
  organisation: text(2, 160),
  role: text(0, 120).optional(),
  country: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  message: text(10, 2000),
  locale: z.enum(LOCALES as [string, ...string[]]).default("fr"),
  /** Honeypot: hidden from people, filled in by bots. Anything in it and the request is dropped without a word. */
  website: z.string().max(500).optional(),
});

async function ipHash(ip: string, secret: string) {
  const data = new TextEncoder().encode(`contact:${secret}:${ip}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * A visitor asks for a demo or a conversation. The request becomes a lead in the partnership pipeline (a new prospect,
 * or a note on the country's open relationship) and every administrator is told in-app. The answer is the same `202`
 * whatever happened behind it, so the form says nothing about which countries are already in talks.
 */
publicApi.post("/contact", async (c) => {
  const db = c.env.DB;
  const hash = await ipHash(c.get("ip") ?? "unknown", c.env.JWT_SECRET ?? "");
  const [mine, all] = await db.batch<{ n: number }>([
    db.prepare("SELECT COUNT(*) AS n FROM contact_throttle WHERE ip_hash = ? AND at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 hour')").bind(hash),
    db.prepare("SELECT COUNT(*) AS n FROM contact_throttle WHERE at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 day')"),
  ]);
  if ((mine.results[0]?.n ?? 0) >= CONTACT_MAX_PER_IP || (all.results[0]?.n ?? 0) >= CONTACT_MAX_PER_DAY) {
    throw new ApiError(429, "too_many_requests", "Too many messages. Try again later.");
  }
  const logAttempt = db.prepare("INSERT INTO contact_throttle (ip_hash) VALUES (?)").bind(hash);
  const b = await readJson(c, contactSchema);
  if (b.website && b.website.trim() !== "") {
    await logAttempt.run();
    return c.json({ ok: true }, 202);
  }

  const country = await db.prepare("SELECT code, name FROM countries WHERE code = ?").bind(b.country).first<{ code: string; name: string }>();
  if (!country) throw new ApiError(422, "unknown_country", "Choose a country from the list");

  const [open, fed] = await db.batch<{ id: string }>([
    db.prepare("SELECT id FROM partnerships WHERE country = ? AND stage <> 'declined' ORDER BY created_at DESC LIMIT 1").bind(b.country),
    db.prepare("SELECT id FROM federations WHERE country = ?").bind(b.country),
  ]);
  const existing = open.results[0]?.id ?? null;
  const body = [
    `Website contact form (${b.locale})`,
    `${b.name}${b.role ? ` — ${b.role}` : ""}, ${b.organisation}`,
    b.email,
    "",
    b.message,
  ].join("\n");
  const ip = c.get("ip");
  const stmts: D1PreparedStatement[] = [logAttempt];
  let partnershipId: string | null = existing;

  if (existing) {
    // the country is already in the pipeline: the message joins that relationship's timeline
    stmts.push(
      db.prepare("INSERT INTO partnership_events (partnership_id, kind, body, actor_user_id) VALUES (?, 'email', ?, NULL)").bind(existing, body),
      db.prepare("UPDATE partnerships SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").bind(existing),
    );
  } else if (!fed.results.length) {
    partnershipId = uuid();
    stmts.push(
      db
        .prepare(
          `INSERT INTO partnerships (id, country, federation_name, stage, priority, contact_name, contact_role, contact_email, source)
           VALUES (?, ?, ?, 'prospect', 'normal', ?, ?, ?, 'website')`,
        )
        .bind(partnershipId, b.country, b.organisation, b.name, b.role || null, b.email),
      db.prepare("INSERT INTO partnership_events (partnership_id, kind, to_stage, actor_user_id) VALUES (?, 'stage', 'prospect', NULL)").bind(partnershipId),
      db.prepare("INSERT INTO partnership_events (partnership_id, kind, body, actor_user_id) VALUES (?, 'email', ?, NULL)").bind(partnershipId, body),
    );
  }
  // (a country whose federation is on ARIS without a pipeline entry gets no new prospect; the notice below carries the message)
  stmts.push(
    auditStmt(db, null, {
      action: "partnership.contact",
      entity: "partnership",
      entityId: partnershipId,
      after: { country: b.country, organisation: b.organisation, existing: !!existing },
      countryCode: b.country,
      ip,
    }),
    ...notifyStmts(db, {
      audienceRole: "admin",
      title: localized("Nouvelle demande de contact", "New contact request", { es: "Nueva solicitud de contacto", de: "Neue Kontaktanfrage" }),
      detail: localized(
        `${b.organisation} (${country.name}) — ${b.name}, ${b.email}${partnershipId ? "" : ` : ${b.message.slice(0, 300)}`}`,
        `${b.organisation} (${country.name}) — ${b.name}, ${b.email}${partnershipId ? "" : `: ${b.message.slice(0, 300)}`}`,
      ),
      tone: "var",
      href: "/admin/partnerships",
      email: false,
    }),
  );
  try {
    await db.batch(stmts);
  } catch (err) {
    // two submissions for the same country at once: the second loses the race on the open-partnership index
    if (!String(err).includes("UNIQUE")) throw err;
  }
  return c.json({ ok: true }, 202);
});
