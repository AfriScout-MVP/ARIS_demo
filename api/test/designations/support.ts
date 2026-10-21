// Shared world for the designation tests: two federations (EGY, MAR), a continental competition, an admin, a referee.
import { addCompetition, addFederationSeat, addFixture, addOfficial, addUser, api, login, type Session } from "../helpers";

export interface World {
  admin: Session;
  egy: Session;
  mar: Session;
  referee: Session;
}

export async function world(): Promise<World> {
  await addCompetition("egy-d1", "EGY");
  await addCompetition("mar-d1", "MAR");
  await addCompetition("caf-cl", "CAF", { tier: "continental", varEnabled: true });
  await addOfficial("egy-ref-1", "EGY");
  const egy = await addFederationSeat("EGY");
  const mar = await addFederationSeat("MAR");
  await addUser("admin@aris.test", "admin");
  await addUser("referee@aris.test", "referee", { officialId: "egy-ref-1" });
  const [admin, egyS, marS, referee] = await Promise.all([login("admin@aris.test"), login(egy.email), login(mar.email), login("referee@aris.test")]);
  return { admin, egy: egyS, mar: marS, referee };
}

/** A unique far-future day per call, so rest-day and double-booking rules never leak between tests. */
let day = 0;
export const nextDate = () => new Date(Date.UTC(2031, 0, 1 + (day += 10))).toISOString().slice(0, 10);
export const shift = (iso: string, n: number) => new Date(new Date(`${iso}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

export const put = (s: Session | null, fx: string, role: string, body: object) => api("PUT", `/api/v1/fixtures/${fx}/designations/${role}`, { session: s, body });
export const post = (s: Session | null, path: string, body?: object) => api("POST", `/api/v1${path}`, { session: s, body });
export const get = (s: Session | null, path: string) => api("GET", `/api/v1${path}`, { session: s });
export const patch = (s: Session | null, path: string, body: object) => api("PATCH", `/api/v1${path}`, { session: s, body });

/** addFixture with a fresh round number, so default teams never collide on (competition, round, home, away). */
let round = 0;
export const fixture = (id: string, p: Parameters<typeof addFixture>[1]) => addFixture(id, { round: ++round, ...p });
