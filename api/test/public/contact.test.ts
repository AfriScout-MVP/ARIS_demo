import { describe, expect, it } from "vitest";
import { addCountry, addFederationSeat, addUser, api, login, sql } from "../helpers";

const send = (body: Record<string, unknown>, ip = "198.51.100.1") => api("POST", "/api/v1/public/contact", { body, headers: { "cf-connecting-ip": ip } });
const FORM = {
  name: "Amina Diallo",
  email: "Amina@Example.org",
  organisation: "Fédération Test de Football",
  role: "Secrétaire générale",
  country: "CTA",
  message: "We would like a demonstration of ARIS for our referees department.",
  locale: "fr",
};
const count = async (table: string, where = "1 = 1", ...args: Array<string | number>) => (await sql(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`, ...args).first<{ n: number }>())!.n;

describe("POST /public/contact", async () => {
  await addCountry("CTA", { active: false });
  await addCountry("CTB", { active: false });
  await addFederationSeat("CTC");
  await addUser("ct-admin@aris.test", "admin");
  const admin = await login("ct-admin@aris.test");

  it("needs no session and turns the request into a website lead in the pipeline, with admins told in-app", async () => {
    const res = await send(FORM, "198.51.100.10");
    expect(res.status).toBe(202);
    expect(res.json).toEqual({ ok: true });
    const p = await sql("SELECT id, stage, source, federation_name, contact_name, contact_email, contact_role, owner_user_id FROM partnerships WHERE country = 'CTA'").first<Record<string, string>>();
    expect(p).toMatchObject({ stage: "prospect", source: "website", federation_name: FORM.organisation, contact_name: FORM.name, contact_email: "amina@example.org", owner_user_id: null });
    const events = await sql("SELECT kind, body FROM partnership_events WHERE partnership_id = ? ORDER BY id", p!.id).all<{ kind: string; body: string | null }>();
    expect(events.results.map((e) => e.kind)).toEqual(["stage", "email"]);
    expect(events.results[1].body).toContain(FORM.message);
    expect(await count("notifications", "audience_role = 'admin' AND href = '/admin/partnerships'")).toBe(1);
    // in-app only: nothing queued for e-mail
    expect(await count("notification_outbox")).toBe(0);
    expect(await count("audit_log", "action = 'partnership.contact' AND country_code = 'CTA'")).toBe(1);
    // the admin sees it in the pipeline, flagged as coming from the website
    const list = (await api("GET", "/api/v1/partnerships?stage=prospect", { session: admin })).json.partnerships;
    expect(list.find((x: { country: string }) => x.country === "CTA")).toMatchObject({ source: "website" });
  });

  it("adds a second message about the same country to its open relationship instead of a duplicate", async () => {
    const res = await send({ ...FORM, name: "Moussa Kane", message: "Following up on our request for a demonstration." }, "198.51.100.11");
    expect(res.status).toBe(202);
    expect(await count("partnerships", "country = 'CTA'")).toBe(1);
    const id = (await sql("SELECT id FROM partnerships WHERE country = 'CTA'").first<{ id: string }>())!.id;
    expect(await count("partnership_events", "partnership_id = ? AND kind = 'email'", id)).toBe(2);
  });

  it("answers the same for a country whose federation is already on ARIS, and creates no prospect", async () => {
    const res = await send({ ...FORM, country: "CTC" }, "198.51.100.12");
    expect(res.status).toBe(202);
    expect(await count("partnerships", "country = 'CTC'")).toBe(0);
    expect(await count("notifications", "audience_role = 'admin'")).toBe(3);
  });

  it("stores no HTML", async () => {
    await send({ ...FORM, country: "CTB", organisation: "<b>Bold</b> FA", message: "Hello <script>alert('x')</script> please call us back soon." }, "198.51.100.13");
    const p = await sql("SELECT id, federation_name FROM partnerships WHERE country = 'CTB'").first<{ id: string; federation_name: string }>();
    expect(p!.federation_name).toBe("Bold FA");
    const body = (await sql("SELECT body FROM partnership_events WHERE partnership_id = ? AND kind = 'email'", p!.id).first<{ body: string }>())!.body;
    expect(body).not.toMatch(/[<>]/);
    expect(body).toContain("please call us back soon.");
  });

  it("drops a submission whose honeypot is filled, silently", async () => {
    const before = await count("partnership_events");
    const res = await send({ ...FORM, country: "CTB", website: "http://spam.example" }, "198.51.100.14");
    expect(res.status).toBe(202);
    expect(await count("partnership_events")).toBe(before);
    expect(await count("notifications", "audience_role = 'admin'")).toBe(4);
  });

  it("validates lengths, the e-mail and the country", async () => {
    for (const body of [
      { ...FORM, message: "short" },
      { ...FORM, message: "x".repeat(2001) },
      { ...FORM, name: "A" },
      { ...FORM, organisation: "y".repeat(161) },
      { ...FORM, email: "not-an-email" },
      { ...FORM, country: "ZZ" },
      { ...FORM, message: "<p></p><p></p><p></p>" },
    ]) {
      expect((await send(body, "198.51.100.15")).status).toBe(422);
    }
    const unknown = await send({ ...FORM, country: "QQQ" }, "198.51.100.15");
    expect(unknown.status).toBe(422);
    expect(unknown.json.error.code).toBe("unknown_country");
  });

  it("limits each address to five messages an hour", async () => {
    const ip = "203.0.113.50";
    for (let i = 0; i < 5; i++) expect((await send({ ...FORM, message: `Message number ${i} about a demo.` }, ip)).status).toBe(202);
    const sixth = await send(FORM, ip);
    expect(sixth.status).toBe(429);
    expect(sixth.json.error.code).toBe("too_many_requests");
    // another address is not affected, and the address itself is not stored
    expect((await send(FORM, "203.0.113.51")).status).toBe(202);
    expect(await count("contact_throttle", "ip_hash LIKE ?", "%203.0.113%")).toBe(0);
  });

  it("refuses a cross-site post", async () => {
    const res = await api("POST", "/api/v1/public/contact", { body: FORM, headers: { origin: "https://evil.example" } });
    expect(res.status).toBe(403);
  });
});

describe("GET /public/countries", async () => {
  await addCountry("CTD", { active: false });
  it("lists supported and prospective countries, geography only", async () => {
    const res = await api("GET", "/api/v1/public/countries");
    expect(res.status).toBe(200);
    const row = res.json.countries.find((c: { code: string }) => c.code === "CTD");
    expect(row).toEqual({ code: "CTD", name: "CTD", nameFr: "CTD fr", nameEs: "CTD es", nameDe: "CTD de", active: false });
  });
});
