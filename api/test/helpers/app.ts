import { env } from "cloudflare:workers";
import worker from "../../src/index";

export const PASSWORD = "correct-horse-battery-staple";

export interface Session {
  cookie: string;
  user: { id: string; role: "admin" | "federation" | "referee"; country: string | null; federationId: string | null; officialId: string | null };
}

export async function api(
  method: string,
  path: string,
  opts: { body?: unknown; session?: Session | null; headers?: Record<string, string>; raw?: BodyInit } = {},
) {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.session) headers.cookie = opts.session.cookie;
  const res = await worker.fetch(
    new Request(`https://aris.test${path}`, {
      method,
      headers,
      body: opts.raw ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body)),
    }),
    env as never,
    { waitUntil() {}, passThroughOnException() {} } as never,
  );
  const binary = /^(image|application\/(pdf|octet-stream))/.test(res.headers.get("content-type") ?? "");
  const text = binary ? (await res.arrayBuffer(), "") : await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON */
  }
  return { status: res.status, json, text, headers: res.headers };
}

export async function login(email: string, password = PASSWORD): Promise<Session> {
  const res = await api("POST", "/api/v1/auth/login", { body: { email, password } });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status} ${res.text}`);
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  return { cookie, user: res.json.user };
}

let counter = 0;
export const uid = (prefix: string) => `${prefix}-${++counter}-${Math.random().toString(36).slice(2, 7)}`;
