// "Today" is the API's date (`snapshot.today`), never the browser's: a federation in another
// timezone, or a laptop with a wrong clock, must see the same week as the server.

import { addDays, mondayOf } from "./dates";

let current = "";
let week: string[] = [];

/** Today's date as the server reported it; "" before the first snapshot has loaded. */
export function today(): string {
  return current;
}

/** Monday of last week, of this week and of next week — the three weeks the calendar shows. Empty before the first snapshot. */
export function weekStarts(): string[] {
  return week;
}

/** The sports season a date belongs to, e.g. "2026/27" (seasons start in August). */
export function seasonOf(iso: string): string {
  if (!iso) return "";
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const start = month >= 8 ? year : year - 1;
  return `${start}/${String((start + 1) % 100).padStart(2, "0")}`;
}

/** The season of today's date. */
export function currentSeason(): string {
  return seasonOf(current);
}

/** Called by `applySnapshot`; nothing else should move the clock. */
export function setToday(iso: string) {
  current = iso;
  if (!iso) {
    week = [];
    return;
  }
  const monday = mondayOf(iso);
  week = [addDays(monday, -7), monday, addDays(monday, 7)];
}
