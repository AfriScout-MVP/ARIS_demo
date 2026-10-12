import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../env";
import { ApiError } from "../lib/http";

/** Headers every API response carries. Responses hold personal data, so nothing is cacheable. */
export const securityHeaders: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "no-referrer");
  c.header("Cache-Control", "no-store");
  c.header("Cross-Origin-Resource-Policy", "same-origin");
};

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF defence for cookie sessions: a state-changing request must come from this
 * same origin. Browsers always send Origin on cross-site POSTs, so a mismatch is
 * a forged request; Sec-Fetch-Site covers the rare client that omits it.
 */
export const sameOriginOnly: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (SAFE.has(c.req.method)) return next();
  const host = new URL(c.req.url).host;
  const origin = c.req.header("origin");
  if (origin) {
    let originHost = "";
    try {
      originHost = new URL(origin).host;
    } catch {
      /* falls through to the rejection below */
    }
    if (originHost !== host) throw new ApiError(403, "cross_origin", "Cross-origin requests are not allowed");
  } else {
    const site = c.req.header("sec-fetch-site");
    if (site && site !== "same-origin" && site !== "none") {
      throw new ApiError(403, "cross_origin", "Cross-origin requests are not allowed");
    }
  }
  return next();
};
