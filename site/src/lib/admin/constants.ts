// Fixed vocabulary of the administration console.

export const ADMIN_ROLES = ["admin", "federation", "referee", "tagger"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const ZONES = ["UNAF", "UFOA-A", "UFOA-B", "UNIFFAC", "CECAFA", "COSAFA"] as const;
export type ZoneCode = (typeof ZONES)[number];

export const TEAM_KINDS = ["club", "national"] as const;
export type TeamKind = (typeof TEAM_KINDS)[number];

/** The server refuses anything shorter (`passwordSchema`). */
export const MIN_PASSWORD = 12;
export const MAX_PASSWORD = 200;

/** Logos and flags: PNG, JPEG or WebP, 8 MB at most (contract: `PUT .../logo`, `PUT .../flag`). */
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
