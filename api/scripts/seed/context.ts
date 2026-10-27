import type { MediaBook } from "./media";
import type { SqlScript } from "./sql";

export const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);

export function mondayOf(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  return addDays(iso, -((d.getUTCDay() + 6) % 7)); // Monday = 0
}

export const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export interface SeedContext {
  sql: SqlScript;
  media: MediaBook;
  /** Shift a demo date so the demo week starts at the anchor. */
  sh: (iso: string) => string;
  anchor: string;
  /** Time zone of a country (IANA). */
  timezone: (code: string) => string;
  teams: TeamBook;
  stadiums: StadiumBook;
}

/** Hands out stable ids for teams and stadiums and writes each row once. */
export class TeamBook {
  private ids = new Map<string, string>();
  readonly rows: Array<{ id: string; name: string; shortName: string | null; kind: "club" | "national"; country: string; city: string | null; stadiumId: string | null }> = [];

  get(name: string, country: string, kind: "club" | "national" = "club", city: string | null = null, extra: { shortName?: string | null; stadiumId?: string | null } = {}): string {
    const key = `${kind}|${country}|${name.toLowerCase()}`;
    let id = this.ids.get(key);
    if (!id) {
      id = `tm-${country.toLowerCase()}-${kind === "national" ? "nt-" : ""}${slug(name)}`;
      this.ids.set(key, id);
      this.rows.push({ id, name, shortName: extra.shortName ?? null, kind, country, city, stadiumId: extra.stadiumId ?? null });
    }
    return id;
  }

  find(name: string, country: string, kind: "club" | "national" = "club") {
    return this.ids.get(`${kind}|${country}|${name.toLowerCase()}`);
  }
}

export class StadiumBook {
  private ids = new Map<string, string>();
  readonly rows: Array<{ id: string; name: string; city: string; country: string; capacity: number | null }> = [];

  get(name: string, city: string, country: string, capacity: number | null = null): string {
    const key = `${country}|${name.toLowerCase()}|${city.toLowerCase()}`;
    let id = this.ids.get(key);
    if (!id) {
      id = `st-${country.toLowerCase()}-${slug(name)}-${slug(city)}`;
      this.ids.set(key, id);
      this.rows.push({ id, name, city, country, capacity });
    }
    return id;
  }
}
