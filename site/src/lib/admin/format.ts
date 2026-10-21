/**
 * The Worker stores UTC timestamps either as ISO 8601 ("2026-05-01T09:30:00.000Z") or in SQLite's
 * "2026-05-01 09:30:00" form, which has no zone marker. Both are UTC.
 */
export function parseTimestamp(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const iso = raw.includes("T") ? raw : raw.replace(" ", "T");
  const stamped = /(Z|[+-]\d{2}:?\d{2})$/.test(iso) ? iso : `${iso}Z`;
  const date = new Date(stamped);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "12 May 2026, 09:30" in the visitor's language; an em dash when there is nothing to show. */
export function formatDateTime(raw: string | null | undefined, localeTag: string): string {
  const date = parseTimestamp(raw);
  if (!date) return "—";
  return date.toLocaleString(localeTag, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
