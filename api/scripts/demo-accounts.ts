// LOCAL DEVELOPMENT ONLY: one account per role against the demo seed, so every screen can be exercised.
// Refuses to touch a remote database.
//
//   ARIS_PASSWORD='a long passphrase' npm run user:demo

import { execFileSync } from "node:child_process";
import { accountSql, type NewAccount } from "./lib/accounts";

if (process.argv.includes("--remote")) {
  console.error("user:demo only ever writes to the local database.");
  process.exit(2);
}
const password = process.env.ARIS_PASSWORD;
if (!password || password.length < 12) {
  console.error("Set ARIS_PASSWORD to a passphrase of at least 12 characters.");
  process.exit(2);
}

const accounts: NewAccount[] = [
  { role: "admin", email: "admin@aris.local", name: "Super Admin", locale: "fr" },
  { role: "federation", email: "frmf@aris.local", name: "Fédération Marocaine (FRMF)", federation: "FRMF", locale: "fr" },
  { role: "federation", email: "fif@aris.local", name: "Fédération Ivoirienne (FIF)", federation: "FIF", locale: "fr" },
  { role: "federation", email: "gfa@aris.local", name: "Ghana FA (GFA)", federation: "GFA", locale: "en" },
  { role: "referee", email: "karim@aris.local", name: "Karim Haddad", official: "karim-haddad", locale: "fr" },
  { role: "referee", email: "amina@aris.local", name: "Amina Koné", official: "amina-kone", locale: "fr" },
];

const statements = await Promise.all(accounts.map((a) => accountSql(a, password)));
execFileSync("npx", ["wrangler", "d1", "execute", "ARIS_DB", "--local", "--command", statements.join("\n")], { stdio: "inherit", env: { ...process.env, WRANGLER_SEND_METRICS: "false" } });
console.error(`Created ${accounts.length} local demo accounts: ${accounts.map((a) => a.email).join(", ")}`);
