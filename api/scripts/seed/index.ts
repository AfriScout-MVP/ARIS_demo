// Turns ARIS's demo dataset (api/seed/demo-data.ts) into SQL for D1 plus the image files for R2.
//
//   npm run db:seed          # local database + local R2
//   npm run db:seed:remote   # the real ones — DEMO DATA, never run this against production records
//
// Output (.seed/): seed.sql, media.json (key/file pairs for `wrangler r2 bulk put`) and media/ (the files).
// Every date is shifted so the demo week starts at --anchor (default: this week's Monday).
// No accounts or passwords are created here — use `npm run user:create` (or `npm run user:demo` locally).

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEMO_TODAY } from "../../seed/demo-data";
import { addDays, daysBetween, mondayOf, StadiumBook, TeamBook, type SeedContext } from "./context";
import { writeGeography, writeTeams } from "./geography";
import { writeFixtures } from "./fixtures";
import { MEDIA_DIR, MediaBook } from "./media";
import { writeMatches } from "./matches";
import { writeOfficials, writeSuspensionCase } from "./officials";
import { COUNTRY_REFERENCE } from "./reference";
import { writeConfiguration } from "./reference-tables";
import { SqlScript } from "./sql";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, "../../.seed");

const argv = process.argv.slice(2);
const flag = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const anchor = flag("anchor") ?? mondayOf(new Date().toISOString().slice(0, 10));
if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor)) throw new Error("--anchor must be YYYY-MM-DD");
const shiftBy = daysBetween(DEMO_TODAY, anchor);

rmSync(MEDIA_DIR, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const ctx: SeedContext = {
  sql: new SqlScript(),
  media: new MediaBook(),
  anchor,
  sh: (iso) => addDays(iso, shiftBy),
  timezone: (code) => COUNTRY_REFERENCE[code]?.timezone ?? "UTC",
  teams: new TeamBook(),
  stadiums: new StadiumBook(),
};

writeGeography(ctx);
writeOfficials(ctx);
writeSuspensionCase(ctx);
writeFixtures(ctx);
writeMatches(ctx);
writeConfiguration(ctx);
writeTeams(ctx); // last of the producers: fixtures and matches have named every team and stadium by now

// media_assets: written once every asset exists, rendered first (countries, teams and officials point at it)
ctx.sql.section("media").insert(
  "media_assets",
  ["id", "kind", "visibility", "r2_key", "filename", "content_type", "size", "sha256", "owner_type", "owner_id"],
  ctx.media.assets.map((a) => [a.id, a.kind, a.visibility, a.key, a.filename, a.contentType, a.size, a.sha256, a.ownerType, a.ownerId]),
);

const header = `-- ARIS demo seed — generated ${new Date().toISOString()} — demo week starts ${anchor}\n-- DEMO DATA ONLY. Every name, score and figure below is illustrative.\n\n`;
const order = ["media", "geography", "teams", "officials", "discipline", "fixtures", "matches", "finance"];
writeFileSync(path.join(OUT, "seed.sql"), header + ctx.sql.render(order));
writeFileSync(path.join(OUT, "media.json"), JSON.stringify(ctx.media.uploadList(), null, 2));

console.error(`seed written to ${path.relative(process.cwd(), OUT)}/\n  ${ctx.sql.summary()}\n  media_assets: ${ctx.media.assets.length}`);
