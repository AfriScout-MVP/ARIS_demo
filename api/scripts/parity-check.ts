// Dev tool: proves the Worker and the browser rank officials identically.
// Seed the database with the same demo data, start `wrangler dev`, then:
//   ARIS_BASE=http://127.0.0.1:8799 ARIS_EMAIL=... ARIS_PASSWORD=... npx tsx scripts/parity-check.ts --anchor 2026-10-12

import { fixtures as demoFixtures, crewRoles, DEMO_TODAY } from "../../site/src/lib/mock-data";

const base = process.env.ARIS_BASE ?? "http://127.0.0.1:8799";
const anchorArg = process.argv.indexOf("--anchor");
const anchor = anchorArg >= 0 ? process.argv[anchorArg + 1] : undefined;
if (!anchor) throw new Error("pass the --anchor used to seed");
const shift = Math.round((Date.parse(`${anchor}T12:00:00Z`) - Date.parse(`${DEMO_TODAY}T12:00:00Z`)) / 86_400_000);

const { candidatesForSlot } = await import("../../site/src/lib/assignment");

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
    const local = candidatesForSlot({ ...f, date: f.date }, slot.role, f.crew);
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
