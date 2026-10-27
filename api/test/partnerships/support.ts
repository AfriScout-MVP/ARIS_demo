import { addCountry, addFederationSeat, addOfficial, addUser, api, login, type Session } from "../helpers";

export interface PipelineWorld {
  admin: Session;
  otherAdmin: { id: string };
  seat: Session;
  referee: Session;
}

/** `prefix` is two letters: the seat's country is `${prefix}A`. An admin (the session), a second admin (a possible owner), a federation seat and a referee — for one test file. */
export async function makePipelineWorld(prefix: string): Promise<PipelineWorld> {
  await addUser(`${prefix}-admin@aris.test`, "admin");
  await addUser(`${prefix}-admin2@aris.test`, "admin");
  await addOfficial(`${prefix}-off`, `${prefix}A`);
  await addUser(`${prefix}-ref@aris.test`, "referee", { officialId: `${prefix}-off` });
  const seat = await addFederationSeat(`${prefix}A`);
  const admin = await login(`${prefix}-admin@aris.test`);
  const other = await login(`${prefix}-admin2@aris.test`);
  return { admin, otherAdmin: { id: other.user.id }, seat: await login(seat.email), referee: await login(`${prefix}-ref@aris.test`) };
}

/** A country that is in the list but switched off — what a prospect usually is. */
export const prospectCountry = (code: string) => addCountry(code, { active: false, currency: "GHS" });

export const call = (method: string, path: string, session: Session | null, body?: unknown) => api(method, `/api/v1/partnerships${path}`, { session, body });

export const create = (session: Session | null, body: Record<string, unknown>) => call("POST", "", session, { federationName: "Fédération test", ...body });
export const move = (session: Session | null, id: string, body: Record<string, unknown>) => call("POST", `/${id}/stage`, session, body);
