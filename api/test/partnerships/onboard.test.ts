import { describe, expect, it } from "vitest";
import { api, login, sql } from "../helpers";
import { call, create, makePipelineWorld, move, prospectCountry } from "./support";

const SEAT = { name: "Kwame Mensah", email: "kwame@pob.org", password: "a-long-onboarding-passphrase", locale: "en" };

/** A partnership taken all the way to a signed agreement. */
async function signed(w: Awaited<ReturnType<typeof makePipelineWorld>>, country: string, code?: string) {
  await prospectCountry(country);
  const { id } = (await create(w.admin, { country, federationName: `Federation ${country}`, federationCode: code })).json.partnership;
  await move(w.admin, id, { stage: "negotiating" });
  await move(w.admin, id, { stage: "agreement_signed", agreementReference: `AGR-${country}`, agreementSignedOn: "2026-10-01" });
  return id as string;
}

const count = async (table: string, where: string, ...args: Array<string | number | null>) => (await sql(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`, ...args).first<{ n: number }>())!.n;

describe("onboarding a federation", async () => {
  const w = await makePipelineWorld("PO");

  it("switches the country on and creates the federation and its first seat, who can then sign in to their own country only", async () => {
    const id = await signed(w, "POB", "POBF");
    const res = await call("POST", `/${id}/onboard`, w.admin, { seat: SEAT });
    expect(res.status).toBe(201);
    expect(res.json.partnership).toMatchObject({ stage: "onboarded", federationId: res.json.federationId, countryActive: true, nextStep: null });

    const fed = await sql("SELECT code, name, country, status, agreement_reference FROM federations WHERE id = ?", res.json.federationId).first();
    expect(fed).toEqual({ code: "POBF", name: "Federation POB", country: "POB", status: "active", agreement_reference: "AGR-POB" });
    expect(await count("audit_log", "action IN ('country.activate','federation.create','user.create','partnership.onboarded') AND country_code = 'POB'")).toBe(4);

    // the admin chose the seat's password: it must be replaced before anything else
    const first = await login(SEAT.email, SEAT.password);
    expect(first.user).toMatchObject({ role: "federation", country: "POB", federationCode: "POBF", mustChangePassword: true });
    expect((await api("GET", "/api/v1/snapshot", { session: first })).json.error.code).toBe("password_change_required");
    const own = "the-seat-holders-own-passphrase";
    expect((await api("POST", "/api/v1/auth/change-password", { session: first, body: { currentPassword: SEAT.password, newPassword: own } })).status).toBe(200);
    const seat = await login(SEAT.email, own);
    expect(seat.user.mustChangePassword).toBe(false);
    const snap = await api("GET", "/api/v1/snapshot", { session: seat });
    expect(snap.status).toBe(200);
    expect(snap.json.countries.map((c: { code: string }) => c.code)).toEqual(["POB"]);
    // onboarded is final
    expect((await move(w.admin, id, { stage: "negotiating" })).status).toBe(409);
    expect((await call("POST", `/${id}/onboard`, w.admin, { seat: { ...SEAT, email: "again@pob.org" } })).json.error.code).toBe("not_signed");
  });

  it("only onboards a signed agreement, and needs a code", async () => {
    await prospectCountry("POC");
    const { id } = (await create(w.admin, { country: "POC" })).json.partnership;
    expect((await call("POST", `/${id}/onboard`, w.admin, { code: "POCF", seat: { ...SEAT, email: "a@poc.org" } })).json.error.code).toBe("not_signed");
    const noCode = await signed(w, "POD");
    expect((await call("POST", `/${noCode}/onboard`, w.admin, { seat: { ...SEAT, email: "a@pod.org" } })).json.error.code).toBe("code_required");
    expect((await call("POST", `/${noCode}/onboard`, w.admin, { code: "PODF", seat: { ...SEAT, email: "a@pod.org", password: "short" } })).status).toBe(422);
    expect((await call("POST", `/${noCode}/onboard`, w.admin, { code: "PODF" })).status).toBe(422);
  });

  it("creates nothing at all when the e-mail or the code is already taken", async () => {
    const id = await signed(w, "POE", "POBF"); // POBF belongs to the federation onboarded above
    const codeTaken = await call("POST", `/${id}/onboard`, w.admin, { seat: { ...SEAT, email: "fresh@poe.org" } });
    expect(codeTaken.json.error.code).toBe("federation_code_taken");
    const emailTaken = await call("POST", `/${id}/onboard`, w.admin, { code: "POEF", seat: SEAT });
    expect(emailTaken.json.error.code).toBe("email_taken");
    expect(await count("federations", "country = 'POE'")).toBe(0);
    expect(await count("users", "email = 'fresh@poe.org'")).toBe(0);
    expect(await count("countries", "code = 'POE' AND active = 1")).toBe(0);
    expect((await call("GET", `/${id}`, w.admin)).json.partnership.stage).toBe("agreement_signed");
  });

  it("is refused to anyone but an administrator", async () => {
    const id = await signed(w, "POF", "POFF");
    for (const s of [w.seat, w.referee]) expect((await call("POST", `/${id}/onboard`, s, { seat: { ...SEAT, email: "x@pof.org" } })).status).toBe(403);
    expect((await call("POST", `/${id}/onboard`, null, { seat: { ...SEAT, email: "x@pof.org" } })).status).toBe(401);
    expect(await count("federations", "country = 'POF'")).toBe(0);
  });
});
