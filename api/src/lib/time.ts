// Fixtures are stored as one UTC instant (like AfriScout's kickoff timestamp) and shown at the venue's local time.
// Africa has almost no DST, but Morocco and Egypt shift, so conversions always go through the IANA zone.

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
    formatters.set(timeZone, f);
  }
  return f;
}

/** Wall-clock parts of an instant in a zone: { date: "YYYY-MM-DD", time: "HH:MM" }. */
export function localParts(instantIso: string, timeZone = "UTC"): { date: string; time: string } {
  const parts = formatter(timeZone).formatToParts(new Date(instantIso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

/** Offset of a zone from UTC, in minutes, at a given instant. */
function offsetMinutes(instantMs: number, timeZone: string) {
  const parts = formatter(timeZone).formatToParts(new Date(instantMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - Math.floor(instantMs / 1000) * 1000) / 60000);
}

/** The UTC instant (ISO, second precision, `Z`) of a local date + HH:MM in a zone. */
export function toUtcIso(date: string, time: string, timeZone = "UTC"): string {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const naive = Date.UTC(y, mo - 1, d, h, mi, 0);
  let guess = naive - offsetMinutes(naive, timeZone) * 60000;
  // one more pass settles the instant when the offset differs between the guess and the answer (DST edges)
  guess = naive - offsetMinutes(guess, timeZone) * 60000;
  return new Date(guess).toISOString().replace(/\.\d{3}Z$/, "Z");
}
