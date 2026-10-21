import { ApiError, NetworkError } from "@/lib/api/client";
import type { TKey } from "@/locales";

/** Server error codes (`error.code`) that have their own wording. */
const BY_CODE = {
  email_taken: "admin.errors.email_taken",
  last_admin: "admin.errors.last_admin",
  validation_failed: "admin.errors.validation_failed",
  forbidden: "admin.errors.forbidden",
  not_found: "admin.errors.not_found",
  official_required: "admin.errors.official_required",
  federation_required: "admin.errors.federation_required",
  unknown_official: "admin.errors.unknown_official",
  unknown_federation: "admin.errors.unknown_federation",
  official_taken: "admin.errors.official_taken",
  official_has_account: "admin.errors.official_taken",
  invalid_link: "admin.errors.invalid_link",
  code_taken: "admin.errors.code_taken",
  federation_code_taken: "admin.errors.code_taken",
  country_taken: "admin.errors.country_taken",
  federation_exists: "admin.errors.country_taken",
  country_exists: "admin.errors.country_exists",
  country_inactive: "admin.errors.country_inactive",
  team_exists: "admin.errors.team_exists",
  stadium_exists: "admin.errors.stadium_exists",
  unknown_country: "admin.errors.unknown_country",
  unsupported_media_type: "admin.errors.file_type",
  payload_too_large: "admin.errors.file_size",
  too_many_attempts: "admin.errors.throttled",
} as const satisfies Record<string, TKey>;

const BY_STATUS: Record<number, TKey> = {
  401: "admin.errors.session",
  403: "admin.errors.forbidden",
  404: "admin.errors.not_found",
  413: "admin.errors.file_size",
  415: "admin.errors.file_type",
  429: "admin.errors.throttled",
};

export interface ErrorInfo {
  /** Translated sentence for the whole request. */
  key: TKey;
  /** The server's code, shown in small print when we have no wording of our own. */
  code: string | null;
  /** Field name -> translated message, from `validation_failed` details. */
  fields: Record<string, TKey>;
}

function fieldKey(path: string): TKey {
  const name = path.split(".").pop() ?? path;
  if (name === "password") return "admin.errors.passwordShort";
  if (name === "email") return "admin.errors.emailInvalid";
  return "admin.errors.fieldInvalid";
}

/** `validation_failed` carries `details: [{ path, message }]`. */
export function fieldErrorsFrom(details: unknown): Record<string, TKey> {
  const out: Record<string, TKey> = {};
  if (!Array.isArray(details)) return out;
  for (const item of details) {
    const path = item && typeof item === "object" ? (item as { path?: unknown }).path : null;
    if (typeof path === "string" && path) out[path.split(".").pop() ?? path] = fieldKey(path);
  }
  return out;
}

export function describeError(err: unknown): ErrorInfo {
  if (err instanceof NetworkError) return { key: "admin.errors.network", code: null, fields: {} };
  if (err instanceof ApiError) {
    const known = (BY_CODE as Record<string, TKey>)[err.code];
    if (known) return { key: known, code: err.code, fields: err.code === "validation_failed" ? fieldErrorsFrom(err.details) : {} };
    const byStatus = BY_STATUS[err.status];
    if (byStatus) return { key: byStatus, code: err.code, fields: {} };
    if (err.status >= 500) return { key: "admin.errors.server", code: err.code, fields: {} };
    return { key: "admin.errors.generic", code: err.code, fields: {} };
  }
  return { key: "admin.errors.generic", code: null, fields: {} };
}
