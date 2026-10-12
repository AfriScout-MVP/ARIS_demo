import { env } from "cloudflare:workers";
import worker from "../src/index";
import { hashPassword } from "../src/lib/crypto";

export const PASSWORD = "correct-horse-battery-staple";
const db = () => env.DB;

export interface Session {
  cookie: string;
  user: { id: string; role: string };
}

export async function api(
  method: string,
  path: string,
  opts: { body?: unknown; session?: Session | null; headers?: Record<string, string>; raw?: BodyInit } = {},
) {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.session) headers.cookie = opts.session.cookie;
  const res = await worker.fetch(
    new Request(`https://aris.test${path}`, {
      method,
      headers,
      body: opts.raw ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body)),
    }),
    env as never,
    { waitUntil() {}, passThroughOnException() {} } as never,
  );
  const binary = /^(image|application\/(pdf|octet-stream))/.test(res.headers.get("content-type") ?? "");
  const text = binary ? (await res.arrayBuffer(), "") : await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON */
  }
  return { status: res.status, json, text, headers: res.headers };
}

export async function login(email: string, password = PASSWORD): Promise<Session> {
  const res = await api("POST", "/api/v1/auth/login", { body: { email, password } });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status} ${res.text}`);
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  return { cookie, user: res.json.user };
}

let counter = 0;
export const uid = (prefix: string) => `${prefix}-${++counter}-${Math.random().toString(36).slice(2, 7)}`;

export async function addCountry(code: string, zone = "UNAF") {
  await db()
    .prepare("INSERT OR IGNORE INTO countries (code, name, name_fr, flag, federation, zone, capital, sync_source, sync_health) VALUES (?, ?, ?, '🏳️', ?, ?, 'Capital', 'COMET', 'healthy')")
    .bind(code, code, code, `${code}FF`, zone)
    .run();
}

export async function addCompetition(id: string, country: string, opts: { tier?: string; varEnabled?: boolean } = {}) {
  await db()
    .prepare("INSERT INTO competitions (id, country_code, name, tier, gender, matchdays, current_matchday, var_enabled, weight) VALUES (?, ?, ?, ?, 'M', 30, 1, ?, 1)")
    .bind(id, country, `League ${id}`, opts.tier ?? "d1", opts.varEnabled ? 1 : 0)
    .run();
}

export async function addOfficial(
  id: string,
  country: string,
  o: { kind?: "referee" | "assistant"; status?: string; varQualified?: boolean; rating?: number } = {},
) {
  await db()
    .prepare(
      "INSERT INTO officials (id, kind, name, initials, country_code, level, status, var_qualified, rmcs_avg, fitness) VALUES (?, ?, ?, 'XX', ?, 'National D1', ?, ?, ?, 85)",
    )
    .bind(id, o.kind ?? "referee", `Official ${id}`, country, o.status ?? "active", o.varQualified ? 1 : 0, o.rating ?? 80)
    .run();
}

export async function addFixture(
  id: string,
  p: { country: string; competition: string; date: string; home?: string; away?: string; homeCode?: string; awayCode?: string; roles?: string[]; importance?: number },
) {
  await db()
    .prepare(
      "INSERT INTO fixtures (id, country_code, competition_id, matchday, date, kickoff, home, away, home_code, away_code, city, venue, importance, risk) VALUES (?, ?, ?, 1, ?, '18:00', ?, ?, ?, ?, 'City', 'Stadium', ?, 'low')",
    )
    .bind(id, p.country, p.competition, p.date, p.home ?? "Home FC", p.away ?? "Away FC", p.homeCode ?? null, p.awayCode ?? null, p.importance ?? 60)
    .run();
  for (const role of p.roles ?? ["R", "AR1", "AR2", "FOURTH"]) {
    await db().prepare("INSERT INTO designations (fixture_id, role, official_id, state) VALUES (?, ?, NULL, 'empty')").bind(id, role).run();
  }
}

export async function addUser(email: string, role: string, o: { officialId?: string; scope?: string } = {}) {
  const id = uid("user");
  await db()
    .prepare("INSERT INTO users (id, email, name, role, official_id, scope, password_hash) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(id, email, email.split("@")[0], role, o.officialId ?? null, o.scope ?? "all", await hashPassword(PASSWORD))
    .run();
  return id;
}

export const sql = (q: string, ...args: (string | number | null)[]) => db().prepare(q).bind(...args);
