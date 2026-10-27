// SQL for an account, with the password hashed the same way the Worker does (src/lib/crypto.ts).
import { webcrypto as crypto } from "node:crypto";

const ITERATIONS = 100_000;
const b64 = (b: ArrayBuffer | Uint8Array) => Buffer.from(b instanceof Uint8Array ? b : new Uint8Array(b)).toString("base64");

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const hash = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS }, key, 256);
  return `pbkdf2-sha256$${ITERATIONS}$${b64(salt)}$${b64(hash)}`;
}

const q = (v: string | null) => (v === null ? "NULL" : `'${v.replace(/'/g, "''")}'`);

export type NewAccount =
  | { role: "admin"; email: string; name: string; locale?: string }
  | { role: "federation"; email: string; name: string; federation: string; locale?: string }
  | { role: "referee"; email: string; name: string; official: string; locale?: string }
  | { role: "tagger"; email: string; name: string; federation: string; locale?: string };

export async function accountSql(a: NewAccount, password: string) {
  if (password.length < 12) throw new Error("The password must have at least 12 characters");
  const federation = a.role === "federation" || a.role === "tagger" ? `(SELECT id FROM federations WHERE code = ${q(a.federation)} COLLATE NOCASE)` : "NULL";
  const official = a.role === "referee" ? q(a.official) : "NULL";
  return (
    `INSERT INTO users (id, email, name, role, official_id, federation_id, locale, password_hash) ` +
    `VALUES (${q(crypto.randomUUID())}, ${q(a.email)}, ${q(a.name)}, ${q(a.role)}, ${official}, ${federation}, ${q(a.locale ?? "fr")}, ${q(await hashPassword(password))});`
  );
}
