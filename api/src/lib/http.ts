import type { Context } from "hono";
import type { ZodType, output } from "zod";
import type { AppEnv } from "../env";

/** An error the client is meant to see. Anything else becomes a 500 with no detail. */
export class ApiError extends Error {
  constructor(
    public status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 422 | 429 | 500 | 503,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = "Resource") => new ApiError(404, "not_found", `${what} not found`);
export const forbidden = (message = "You are not allowed to do this") => new ApiError(403, "forbidden", message);

export type Ctx = Context<AppEnv>;

export async function readJson<S extends ZodType>(c: Ctx, schema: S): Promise<output<S>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new ApiError(400, "invalid_json", "Request body must be valid JSON");
  }
  return parse(schema, raw);
}

export function parse<S extends ZodType>(schema: S, raw: unknown): output<S> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ApiError(
      422,
      "validation_failed",
      "Some fields are invalid",
      result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  return result.data as output<S>;
}

export function parseQuery<S extends ZodType>(c: Ctx, schema: S): output<S> {
  return parse(schema, Object.fromEntries(new URL(c.req.url).searchParams));
}

export const nowIso = () => new Date().toISOString();
export const today = () => new Date().toISOString().slice(0, 10);

export function uuid() {
  return crypto.randomUUID();
}

/** `a, b, c` placeholders for an IN (...) list. */
export const marks = (n: number) => Array.from({ length: n }, () => "?").join(", ");

/** D1 allows 100 bound parameters per statement; chunk big IN lists. */
export function chunk<T>(items: T[], size = 90): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
