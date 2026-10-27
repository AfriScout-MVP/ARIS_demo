// One account per role against the demo seed, so every screen can be exercised.
//
//   ARIS_PASSWORD='a long passphrase' npm run user:demo
//
// These are well-known e-mail addresses sharing one password, so they belong on a demo
// deployment and nowhere else. Writing them to a remote database therefore needs a deliberate
// second step — the --remote flag alone is not enough:
//
//   ARIS_PASSWORD='…' ARIS_ALLOW_REMOTE_DEMO=1 npm run user:demo -- --remote
//
// Never run this against a database holding real federation data.

import { execFileSync } from "node:child_process";
import { accountSql, type NewAccount } from "./lib/accounts";
import { d1DatabaseName } from "./lib/resources";
import { countries, referees, slug } from "../seed/demo-data";

const remote = process.argv.includes("--remote");
if (remote && process.env.ARIS_ALLOW_REMOTE_DEMO !== "1") {
  console.error(
    "Refusing to write demo accounts to the remote database.\n" +
      "These are publicly known logins sharing one password. If this really is a demo\n" +
      "deployment, repeat the command with ARIS_ALLOW_REMOTE_DEMO=1.",
  );
  process.exit(2);
}
const password = process.env.ARIS_PASSWORD;
if (!password || password.length < 12) {
  console.error("Set ARIS_PASSWORD to a passphrase of at least 12 characters.");
  process.exit(2);
}

// one seat per federation, and a referee login for the senior referee of the two federations with continental clubs
const topReferee = (code: string) => referees.find((r) => r.countryCode === code && r.status !== "suspended")!;
const refereeAccount = (code: string, locale: "fr" | "en"): NewAccount => {
  const r = topReferee(code);
  return { role: "referee", email: `${slug(r.name.split(" ")[0])}.${code.toLowerCase()}@aris.local`, name: r.name, official: r.id, locale };
};

const accounts: NewAccount[] = [
  { role: "admin", email: "admin@aris.local", name: "Super Admin", locale: "fr" },
  ...countries.map<NewAccount>((c) => ({ role: "federation", email: `${c.federation.toLowerCase()}@aris.local`, name: `${c.fact.federation.name} (${c.federation})`, federation: c.federation, locale: "fr" })),
  refereeAccount("SEN", "fr"),
  refereeAccount("CIV", "fr"),
  { role: "tagger", email: "tagger.sen@aris.local", name: "Match Tagger (SEN)", federation: countries.find((c) => c.code === "SEN")!.federation, locale: "fr" },
];

const target = remote ? "--remote" : "--local";
if (remote) console.error("Writing demo accounts to the REMOTE database.");

const statements = await Promise.all(accounts.map((a) => accountSql(a, password)));
execFileSync("npx", ["wrangler", "d1", "execute", d1DatabaseName(), target, "--command", statements.join("\n")], {
  stdio: "inherit",
  env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
});
console.error(`Created ${accounts.length} ${target.slice(2)} demo accounts: ${accounts.map((a) => a.email).join(", ")}`);
