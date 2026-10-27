// Creates an account — the password never leaves your terminal and is never stored in clear.
//
//   ARIS_PASSWORD='a long passphrase' npm run user:create -- --email a@b.org --name "Ada" --role admin --apply --remote
//   … --role federation --federation FSF             (a seat of the Senegalese federation)
//   … --role referee --official souleymane-kebe       (an official's own space)
//   … --role tagger --federation FSF                  (logs referee decisions for FSF's matches only)
//
// Without --apply the SQL is printed instead of run.

import { execFileSync } from "node:child_process";
import { accountSql, type NewAccount } from "./lib/accounts";
import { d1DatabaseName } from "./lib/resources";

const argv = process.argv.slice(2);
const arg = (n: string) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const email = arg("email");
const name = arg("name");
const role = arg("role");
const federation = arg("federation");
const official = arg("official");
const locale = arg("locale");
const password = process.env.ARIS_PASSWORD;

const usage = () => {
  console.error("Usage: ARIS_PASSWORD=... npm run user:create -- --email X --name Y --role admin|federation|referee|tagger [--federation CODE] [--official ID] [--locale fr|en|es|de] [--apply [--remote]]");
  process.exit(2);
};
if (!email || !name || !role || !["admin", "federation", "referee", "tagger"].includes(role)) usage();
if (!password || password.length < 12) {
  console.error("Set ARIS_PASSWORD to a passphrase of at least 12 characters (read from the environment so it stays out of shell history and process lists).");
  process.exit(2);
}
if ((role === "federation" || role === "tagger") && !federation) {
  console.error(`A ${role === "tagger" ? "tagger" : "federation seat"} needs --federation <federation code>, e.g. FSF.`);
  process.exit(2);
}
if (role === "referee" && !official) {
  console.error("A referee account needs --official <official id>.");
  process.exit(2);
}

const account = (
  role === "admin"
    ? { role, email, name, locale }
    : role === "federation" || role === "tagger"
      ? { role, email, name, federation, locale }
      : { role, email, name, official, locale }
) as NewAccount;
const sql = await accountSql(account, password);

if (argv.includes("--apply")) {
  const target = argv.includes("--remote") ? "--remote" : "--local";
  execFileSync("npx", ["wrangler", "d1", "execute", d1DatabaseName(), target, "--command", sql], { stdio: "inherit", env: { ...process.env, WRANGLER_SEND_METRICS: "false" } });
  console.error(`Created ${role} account for ${email} (${target.slice(2)}).`);
} else {
  console.log(sql);
}
