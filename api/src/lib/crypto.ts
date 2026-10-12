// Passwords and session tokens, on WebCrypto only — no dependencies, runs in a Worker.

const ITERATIONS = 100_000; // the most Workers allow for PBKDF2
const enc = new TextEncoder();

const b64 = (bytes: ArrayBuffer | Uint8Array) => {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s);
};
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64url = (bytes: ArrayBuffer | Uint8Array) => b64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => fromB64(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "="));

/** Constant-time comparison of two equal-purpose byte strings. */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256));
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, ITERATIONS);
  return `pbkdf2-sha256$${ITERATIONS}$${b64(salt)}$${b64(hash)}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, iter, salt, hash] = stored.split("$");
  if (scheme !== "pbkdf2-sha256" || !iter || !salt || !hash) return false;
  const derived = await pbkdf2(password, fromB64(salt), Number(iter));
  return timingSafeEqual(derived, fromB64(hash));
}

/** Spends the same time as a real check — run when the e-mail is unknown, so timing does not reveal which accounts exist. */
export async function burnVerify(password: string) {
  await pbkdf2(password, new Uint8Array(16), ITERATIONS);
  return false;
}

/* ---------------------------------- JWT (HS256) ---------------------------------- */

export interface TokenPayload {
  sub: string;
  /** token_version of the account when issued — bumped to revoke everything. */
  tv: number;
  iat: number;
  exp: number;
}

async function hmacKey(secret: string) {
  if (!secret || secret.length < 32) throw new Error("JWT_SECRET must be set and at least 32 characters");
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signToken(payload: Omit<TokenPayload, "iat" | "exp">, secret: string, ttlSeconds: number) {
  const now = Math.floor(Date.now() / 1000);
  const body: TokenPayload = { ...payload, iat: now, exp: now + ttlSeconds };
  const head = b64url(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const data = `${head}.${b64url(enc.encode(JSON.stringify(body)))}`;
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(data));
  return `${data}.${b64url(sig)}`;
}

export async function verifyToken(token: string, secret: string): Promise<TokenPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [head, body, sig] = parts;
  try {
    // Pin the algorithm: never trust the header to pick one.
    const header = JSON.parse(new TextDecoder().decode(fromB64url(head)));
    if (header.alg !== "HS256") return null;
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), fromB64url(sig), enc.encode(`${head}.${body}`));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(body))) as TokenPayload;
    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
