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
}

/** The three roles of the platform: the super-administrator, a national federation's seat, and an official. */
export type Role = "admin" | "federation" | "referee";
export const ROLES: readonly Role[] = ["admin", "federation", "referee"];

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
}

export interface AppEnv {
  Bindings: Env;
  Variables: {
    user: AuthUser | null;
    ip: string;
    /** True when the request was authenticated by cookie (and so needs CSRF checks). */
    viaCookie: boolean;
  };
}
