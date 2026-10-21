// "5 minutes ago", in the active language, through Intl.RelativeTimeFormat. Pure, so it can be tested in Node.

import { localeTags, type Locale } from "@/locales";

/** Parse an API timestamp. SQLite-style "YYYY-MM-DD HH:MM:SS" and zone-less ISO strings are UTC. */
export function parseTimestamp(raw: string): number {
  const iso = raw.includes("T") ? raw : raw.replace(" ", "T");
  const zoned = /(Z|[+-]\d{2}:?\d{2})$/.test(iso) ? iso : `${iso}Z`;
  return new Date(zoned).getTime();
}

/** Relative wording for a timestamp: "à l'instant", "il y a 8 min", "hier", "vor 2 Tagen"... Empty when unparsable. */
export function formatRelative(raw: string, locale: Locale, now: number = Date.now()): string {
  const stamp = parseTimestamp(raw);
  if (!Number.isFinite(stamp)) return "";
  const rtf = new Intl.RelativeTimeFormat(localeTags[locale], { numeric: "auto", style: "short" });
  const seconds = Math.max(0, Math.round((now - stamp) / 1000));
  if (seconds < 45) return rtf.format(0, "second");
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return rtf.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return rtf.format(-hours, "hour");
  return rtf.format(-Math.round(hours / 24), "day");
}
