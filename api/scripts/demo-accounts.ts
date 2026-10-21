// One account per role against the demo seed, so every screen can be exercised.
//
//   ARIS_PASSWORD='a long passphrase' npm run user:demo
//
// These are six well-known e-mail addresses sharing one password, so they belong on a demo
// deployment and nowhere else. Writing them to a remote database therefore needs a deliberate
// second step — the --remote flag alone is not enough:
//
//   ARIS_PASSWORD='…' ARIS_ALLOW_REMOTE_DEMO=1 npm run user:demo -- --remote
//
// Never run this against a database holding real federation data.

import { execFileSync } from "node:child_process";
import { accountSql, type NewAccount } from "./lib/accounts";
import { d1DatabaseName } from "./lib/resources";

const remote = process.argv.includes("--remote");
if (remote && process.env.ARIS_ALLOW_REMOTE_DEMO !== "1") {
  console.error(
    "Refusing to write demo accounts to the remote database.\n" +
      "These are six publicly known logins sharing one password. If this really is a demo\n" +
      "deployment, repeat the command with ARIS_ALLOW_REMOTE_DEMO=1.",
  );
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

const target = remote ? "--remote" : "--local";
if (remote) console.error("Writing demo accounts to the REMOTE database.");

const statements = await Promise.all(accounts.map((a) => accountSql(a, password)));
execFileSync("npx", ["wrangler", "d1", "execute", d1DatabaseName(), target, "--command", statements.join("\n")], {
  stdio: "inherit",
  env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
});
console.error(`Created ${accounts.length} ${target.slice(2)} demo accounts: ${accounts.map((a) => a.email).join(", ")}`);
