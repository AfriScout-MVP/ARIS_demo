import { IMAGE_TYPES, MAX_IMAGE_BYTES, MAX_PASSWORD, MIN_PASSWORD } from "./constants";

// ------------------------------------------------------------------ text shapes

export const isEmail = (value: string) => /^[^\s@]+@[^\s@.][^\s@]*\.[^\s@.]{2,}$/.test(value.trim()) && value.trim().length <= 200;

/** ISO 3166-1 alpha-3, upper case (the country's primary key). */
export const isAlpha3 = (value: string) => /^[A-Z]{3}$/.test(value);
export const isIso2 = (value: string) => /^[A-Z]{2}$/.test(value);
export const isCurrency = (value: string) => /^[A-Z]{3}$/.test(value);

/** "FRMF", "FAF-AGO": 2 to 20 upper-case letters or digits, hyphens allowed after the first character (the Worker's rule). */
export const isFederationCode = (value: string) => /^[A-Z0-9][A-Z0-9-]{1,19}$/.test(value);

/** Codes are typed in any case and stored upper case. */
export const normalizeCode = (value: string) => value.trim().toUpperCase();

export function isTimeZone(value: string): boolean {
  if (!value || value.trim() !== value) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const isPasswordLength = (value: string) => value.length >= MIN_PASSWORD && value.length <= MAX_PASSWORD;

export const isFilled = (value: string) => value.trim().length > 0;

/** Empty = no capacity given; otherwise a whole number between 1 and 500 000 (the Worker's rule). */
export function parseCapacity(raw: string): { ok: true; value: number | null } | { ok: false } {
  const text = raw.trim();
  if (text === "") return { ok: true, value: null };
  if (!/^\d{1,6}$/.test(text)) return { ok: false };
  const value = Number(text);
  return value >= 1 && value <= 500_000 ? { ok: true, value } : { ok: false };
}

// ---------------------------------------------------------------------- files

export type FileProblem = "empty" | "type" | "size";

/** Same rule the Worker applies to a logo or a flag, checked before the bytes leave the browser. */
export function validateImage(file: { type: string; size: number }): FileProblem | null {
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) return "type";
  if (file.size === 0) return "empty";
  if (file.size > MAX_IMAGE_BYTES) return "size";
  return null;
}
