// Pure rules behind the account screens (recovery, forced change, notifications page) — kept here so they are tested.
import { MAX_PASSWORD, MIN_PASSWORD } from "@/lib/admin/constants";
import { ApiError, NetworkError } from "@/lib/api/client";
import type { TKey } from "@/locales";

/** A reset token as the API issues it: 32 random bytes, base64url (43 characters). Anything else is not worth sending. */
const TOKEN = /^[A-Za-z0-9_-]{20,200}$/;

/** The token from the reset link's query string (`?token=…`), or null when it is missing or mangled. */
export function readResetToken(search: string): string | null {
  const token = new URLSearchParams(search.startsWith("?") ? search : `?${search}`).get("token");
  return token && TOKEN.test(token) ? token : null;
}

export type NewPasswordProblem = "short" | "mismatch" | "same" | null;

/** Checks a new password before it is sent: length policy, the confirmation, and (when known) that it really changes. */
export function checkNewPassword(next: string, confirm: string, current?: string): { next: NewPasswordProblem; confirm: NewPasswordProblem } {
  const tooShort = next.length < MIN_PASSWORD || next.length > MAX_PASSWORD;
  return {
    next: tooShort ? "short" : current !== undefined && next === current ? "same" : null,
    confirm: !tooShort && confirm !== next ? "mismatch" : null,
  };
}

/** What a recovery request's failure means for the person, as a translation key of the given screen. */
export function recoveryProblem(err: unknown, screen: "forgot" | "reset"): TKey {
  if (err instanceof NetworkError) return `account.${screen}.network`;
  if (err instanceof ApiError && err.status === 429) return `account.${screen}.throttled`;
  return `account.${screen}.failed`;
}

/** Whether a reset failed because the link itself is no good (used, expired, superseded) rather than for a passing reason. */
export const isDeadLink = (err: unknown) => err instanceof ApiError && err.code === "invalid_token";

/** Appends an older page to what is on screen, keeping each item once (a notice arriving meanwhile shifts the pages). */
export function appendPage<T extends { id: string | number }>(shown: T[], page: T[]): T[] {
  const seen = new Set(shown.map((x) => x.id));
  return [...shown, ...page.filter((x) => !seen.has(x.id))];
}

/** A display name as the API accepts it: trimmed, 1–120 characters. Null when it cannot be sent. */
export function cleanName(raw: string): string | null {
  const name = raw.trim();
  return name.length >= 1 && name.length <= 120 ? name : null;
}

/** Where "See all" leads: the referee's personal space has its own page, staff use the product shell's. */
export const notificationsHref = (role: string | null | undefined) => (role === "referee" ? "/me/notifications" : "/notifications");
