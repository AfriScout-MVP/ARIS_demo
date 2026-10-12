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

export type Role = "admin" | "commission" | "observer" | "referee";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  officialId: string | null;
  scope: string;
  locale: "fr" | "en";
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
