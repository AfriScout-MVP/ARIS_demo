// `wrangler d1 …` with the database name filled in from wrangler.jsonc.
//
//   tsx scripts/d1.ts execute --local --file .seed/seed.sql
//   tsx scripts/d1.ts migrations apply --remote
//
// Without this the database name is retyped in every npm script, and renaming it in
// wrangler.jsonc silently leaves them pointing at a database that no longer exists.

import { spawnSync } from "node:child_process";
import { d1DatabaseName } from "./lib/resources";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: tsx scripts/d1.ts <execute|migrations apply|…> [wrangler flags]");
  process.exit(2);
}

// `migrations apply <DB>` takes the name as its third word, every other subcommand as its second.
const at = args[0] === "migrations" ? 2 : 1;
const full = ["wrangler", "d1", ...args.slice(0, at), d1DatabaseName(), ...args.slice(at)];

const res = spawnSync("npx", ["--no-install", ...full], {
  stdio: "inherit",
  env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
});
process.exit(res.status ?? 1);
