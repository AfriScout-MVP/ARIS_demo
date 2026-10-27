import type { TokenPayload } from "./lib/crypto";

export interface Env {
  /** SQL — Cloudflare D1 (SQLite). */
  DB: D1Database;
  /** Media — Cloudflare R2. */
  MEDIA: R2Bucket;
  /** The static app (site/out); absent in tests. */
  ASSETS?: Fetcher;
  /** Secret used to sign session tokens (>= 32 chars). Set with `wrangler secret put JWT_SECRET`. */
  JWT_SECRET: string;
  ENVIRONMENT: string;
  /** Optional: where queued e-mail / SMS / WhatsApp messages are POSTed. */
  MAIL_WEBHOOK_URL?: string;
  MAIL_WEBHOOK_TOKEN?: string;
  /** Optional secret: e-mail is sent through Resend's HTTPS API when set (it takes precedence over the webhook for e-mail). */
  RESEND_API_KEY?: string;
  /** Sender for e-mail sent through Resend, e.g. "ARIS <no-reply@example.org>" (a var in wrangler.jsonc). */
  MAIL_FROM?: string;
  /** The site's public origin, for links in e-mails (password reset). Falls back to the request's origin. */
  PUBLIC_ORIGIN?: string;
}

/**
 * The four roles of the platform: the super-administrator, a national federation's seat, an
 * official, and a tagger (logs referee decisions for its federation's matches, nothing else).
 */
export type Role = "admin" | "federation" | "referee" | "tagger";
export const ROLES: readonly Role[] = ["admin", "federation", "referee", "tagger"];

export type Locale = "fr" | "en" | "es" | "de";
export const LOCALES: readonly Locale[] = ["fr", "en", "es", "de"];

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  /** The official a referee account belongs to; null for admin and federation seats. */
  officialId: string | null;
  /** The federation a federation seat belongs to; null otherwise. */
  federationId: string | null;
  /** ISO alpha-3 country a federation seat is confined to; null for admin and referees. */
  country: string | null;
  federationCode: string | null;
  locale: Locale;
  /** Set on an account whose password someone else chose (created or reset by staff): it must be changed first. */
  mustChangePassword: boolean;
}

export interface AppEnv {
  Bindings: Env;
  Variables: {
    user: AuthUser | null;
    ip: string;
    /** True when the request was authenticated by cookie (and so needs CSRF checks). */
    viaCookie: boolean;
    /** The verified session token behind `user` — sign-out revokes it by its id. */
    token: TokenPayload | null;
  };
}
