// Prints the SQL to create an account — the password never leaves your terminal and is never stored.
//
//   ARIS_PASSWORD='a long passphrase' npm run user:create -- --email a@b.org --name "Ada" --role admin | wrangler d1 execute ARIS_DB --remote --command -
//
// Simpler: let this script run it for you with --apply [--remote].

import { execFileSync } from "node:child_process";
import { webcrypto as crypto } from "node:crypto";

const argv = process.argv.slice(2);
const arg = (n: string) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const email = arg("email");
const name = arg("name");
const role = arg("role");
const official = arg("official") ?? null;
const scope = arg("scope") ?? "all";
const password = process.env.ARIS_PASSWORD;

if (!email || !name || !role || !["admin", "commission", "observer", "referee"].includes(role)) {
  console.error("Usage: ARIS_PASSWORD=... npm run user:create -- --email X --name Y --role admin|commission|observer|referee [--official ID] [--scope all|zone:UNAF|country:EGY] [--apply [--remote]]");
  process.exit(2);
}
if (!password || password.length < 12) {
  console.error("Set ARIS_PASSWORD to a passphrase of at least 12 characters (it is read from the environment so it stays out of shell history and process lists).");
  process.exit(2);
}
if ((role === "referee" || role === "observer") && !official) {
  console.error("Referee and observer accounts need --official <official id>.");
  process.exit(2);
}

// Same scheme as src/lib/crypto.ts: PBKDF2-SHA256, 100k iterations, 16-byte salt.
const ITERATIONS = 100_000;
const b64 = (b: ArrayBuffer | Uint8Array) => Buffer.from(b instanceof Uint8Array ? b : new Uint8Array(b)).toString("base64");
const salt = crypto.getRandomValues(new Uint8Array(16));
const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
const hash = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS }, key, 256);
const stored = `pbkdf2-sha256$${ITERATIONS}$${b64(salt)}$${b64(hash)}`;

const q = (v: string | null) => (v === null ? "NULL" : `'${v.replace(/'/g, "''")}'`);
const sql = `INSERT INTO users (id, email, name, role, official_id, scope, password_hash) VALUES (${q(crypto.randomUUID())}, ${q(email)}, ${q(name)}, ${q(role)}, ${q(official)}, ${q(scope)}, ${q(stored)});`;

if (argv.includes("--apply")) {
  const target = argv.includes("--remote") ? "--remote" : "--local";
  execFileSync("npx", ["wrangler", "d1", "execute", "ARIS_DB", target, "--command", sql], { stdio: "inherit", env: { ...process.env, WRANGLER_SEND_METRICS: "false" } });
  console.error(`Created ${role} account for ${email} (${target.slice(2)}).`);
} else {
  console.log(sql);
}
