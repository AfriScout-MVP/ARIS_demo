// Dev tool: proves the Worker and the browser rank officials identically.
// Seed the database with the same demo data, start `wrangler dev`, then:
//   ARIS_BASE=http://127.0.0.1:8799 ARIS_EMAIL=... ARIS_PASSWORD=... npx tsx scripts/parity-check.ts --anchor 2026-10-12

import { candidatesForSlot, roleWantsReferee, type EngineContext } from "@core/engine";
import type { CrewRole, PoolEntry } from "@core/types";
import {
  assistants,
  availabilityFor,
  countryByCode,
  crewRoles,
  DEMO_TODAY,
  fixtureNations,
  fixtures as demoFixtures,
  referees,
  restDays,
} from "../seed/demo-data";

const base = process.env.ARIS_BASE ?? "http://127.0.0.1:8799";
const anchorArg = process.argv.indexOf("--anchor");
const anchor = anchorArg >= 0 ? process.argv[anchorArg + 1] : undefined;
if (!anchor) throw new Error("pass the --anchor used to seed");
const shift = Math.round((Date.parse(`${anchor}T12:00:00Z`) - Date.parse(`${DEMO_TODAY}T12:00:00Z`)) / 86_400_000);

// The browser-side binding of the shared engine, over the same demo data the database was seeded from.
function poolFor(role: CrewRole): PoolEntry[] {
  if (roleWantsReferee(role)) {
    return referees.map((r) => ({ id: r.id, name: r.name, initials: r.initials, countryCode: r.countryCode, kind: "referee" as const, rating: r.rmcsAvg, fitness: r.fitness, suspended: r.status === "suspended", varQualified: r.varQualified, trend: r.trend }));
  }
  return assistants.map((a) => ({ id: a.id, name: a.name, initials: a.initials, countryCode: a.countryCode, kind: "assistant" as const, rating: a.rating, fitness: 80, suspended: false, varQualified: false, trend: 0 }));
}
const demoContext: EngineContext = {
  pool: poolFor,
  zoneOf: (code) => countryByCode.get(code)?.zone,
  nationsOf: (fixture) => fixtureNations.get(fixture.id) ?? [],
  availability: availabilityFor,
  restDays,
  busyElsewhere: (officialId, fixture) =>
    demoFixtures.some((f) => f.id !== fixture.id && f.date === fixture.date && f.crew.some((s) => s.officialId === officialId && s.state !== "empty")),
  hasConflict: () => false,
};

const login = await fetch(`${base}/api/v1/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: process.env.ARIS_EMAIL, password: process.env.ARIS_PASSWORD }),
});
if (!login.ok) throw new Error(`login failed: ${login.status}`);
const cookie = login.headers.get("set-cookie")!.split(";")[0];

let checked = 0;
let mismatches = 0;
for (const f of demoFixtures) {
  for (const slot of f.crew) {
    const res = await fetch(`${base}/api/v1/fixtures/${f.id}/candidates?role=${slot.role}&limit=300`, { headers: { cookie } });
    if (!res.ok) throw new Error(`${f.id} ${slot.role}: ${res.status}`);
    const server = ((await res.json()) as { candidates: Array<{ id: string; blockers: string[]; score: number }> }).candidates;
    const local = candidatesForSlot(demoContext, { ...f, date: f.date }, slot.role, f.crew);
    // Compare the ones a person could actually choose, and each one's blockers + score.
    const key = (c: { id: string; blockers: string[]; score: number }) => `${c.id}|${[...c.blockers].sort().join(",")}|${c.score}`;
    const a = server.map(key);
    const b = local.map(key);
    checked += 1;
    const sameSet = a.length === b.length && new Set(a).size === new Set(b).size && a.every((x) => new Set(b).has(x));
    if (!sameSet) {
      mismatches += 1;
      if (mismatches <= 5) {
        const onlyServer = a.filter((x) => !new Set(b).has(x)).slice(0, 3);
        const onlyLocal = b.filter((x) => !new Set(a).has(x)).slice(0, 3);
        console.log(`MISMATCH ${f.id} ${slot.role} (date ${f.date} → ${shiftDate(f.date)}) server-only: ${onlyServer.join(" ; ")} | browser-only: ${onlyLocal.join(" ; ")}`);
      }
    }
  }
}
function shiftDate(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + shift);
  return d.toISOString().slice(0, 10);
}
void crewRoles;
console.log(`checked ${checked} slots, ${mismatches} differ`);
process.exit(mismatches ? 1 : 0);
