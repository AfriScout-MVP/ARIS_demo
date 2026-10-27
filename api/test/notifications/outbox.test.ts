import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { backoffMinutes, drainOutbox, MAX_ATTEMPTS, notifyStmts, RESEND_URL } from "../../src/lib/notify";
import type { Env } from "../../src/env";
import { addFederationSeat, addOfficial, addUser, api, login, sql } from "../helpers";

/** The Worker's env with the transport under test switched on and the others off. */
const withMail = (extra: Partial<Env>): Env => ({ ...(env as unknown as Env), RESEND_API_KEY: undefined, MAIL_WEBHOOK_URL: undefined, MAIL_WEBHOOK_TOKEN: undefined, ...extra });

async function queue(recipient: string, opts: { userId?: string; channel?: string; status?: string; attempts?: number; next?: string | null } = {}) {
  const nid = crypto.randomUUID();
  await sql(
    "INSERT INTO notifications (id, user_id, audience_role, title, detail, tone, href) VALUES (?, ?, ?, ?, ?, 'amber', '/calendar')",
    nid, opts.userId ?? null, opts.userId ? null : "admin",
    JSON.stringify({ fr: "Titre", en: "Title", de: "Titel" }), JSON.stringify({ fr: "Détail", en: "Detail", de: "Einzelheit" }),
  ).run();
  const row = await sql(
    "INSERT INTO notification_outbox (notification_id, user_id, channel, recipient, status, attempts, next_attempt_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id",
    nid, opts.userId ?? null, opts.channel ?? "email", recipient, opts.status ?? "queued", opts.attempts ?? 0, opts.next ?? null,
  ).first<{ id: number }>();
  return row!.id;
}
const state = (id: number) => sql("SELECT status, attempts, last_error, next_attempt_at, sent_at FROM notification_outbox WHERE id = ?", id).first<Record<string, string | number | null>>();
const ok = () => new Response(JSON.stringify({ id: "re_1" }), { status: 200 });

afterEach(() => vi.restoreAllMocks());

describe("delivery", async () => {
  const deId = await addUser("ob-de@aris.test", "admin", { locale: "de" });

  it("sends e-mail through Resend with the documented request, in the recipient's language", async () => {
    const id = await queue("ob-de@aris.test", { userId: deId });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => ok());
    const res = await drainOutbox(withMail({ RESEND_API_KEY: "re_test_key", MAIL_FROM: "ARIS <no-reply@aris.test>", PUBLIC_ORIGIN: "https://aris.example" }), { ids: [id] });
    expect(res).toMatchObject({ sent: 1, failed: 0, skipped: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(RESEND_URL);
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ authorization: "Bearer re_test_key", "content-type": "application/json" });
    expect(JSON.parse(init.body as string)).toEqual({
      from: "ARIS <no-reply@aris.test>",
      to: ["ob-de@aris.test"],
      subject: "Titel",
      text: "Einzelheit\n\nhttps://aris.example/calendar",
    });
    expect(await state(id)).toMatchObject({ status: "sent", attempts: 1, last_error: null });
  });

  it("keeps the webhook when Resend is not configured, and leaves everything queued with neither", async () => {
    const id = await queue("ob-hook@aris.test");
    expect(await drainOutbox(withMail({}), { ids: [id] })).toMatchObject({ skipped: true });
    expect((await state(id))!.status).toBe("queued");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => ok());
    await drainOutbox(withMail({ MAIL_WEBHOOK_URL: "https://hook.aris.test/send", MAIL_WEBHOOK_TOKEN: "tok" }), { ids: [id] });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://hook.aris.test/send");
    expect(init.headers).toMatchObject({ authorization: "Bearer tok" });
    expect(JSON.parse(init.body as string)).toMatchObject({ channel: "email", to: "ob-hook@aris.test", title: { en: "Title" }, href: "/calendar" });
    expect((await state(id))!.status).toBe("sent");
  });

  it("leaves SMS queued when only Resend is configured", async () => {
    const id = await queue("+212600000000", { channel: "sms" });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => ok());
    await drainOutbox(withMail({ RESEND_API_KEY: "k" }), { ids: [id] });
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await state(id))!.status).toBe("queued");
  });

  it("backs off after a failure, retries when due, gives up after the cap, and never resends what was sent", async () => {
    const id = await queue("ob-fail@aris.test");
    const mail = withMail({ RESEND_API_KEY: "k" });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("down", { status: 503 }));

    expect(await drainOutbox(mail, { ids: [id] })).toMatchObject({ failed: 1, sent: 0 });
    const first = await state(id);
    expect(first).toMatchObject({ status: "failed", attempts: 1, last_error: expect.stringContaining("503") });
    const wait = (Date.parse(first!.next_attempt_at as string) - Date.now()) / 60_000;
    expect(wait).toBeGreaterThan(backoffMinutes(1) - 1);
    expect(wait).toBeLessThanOrEqual(backoffMinutes(1));

    // not due yet: left alone
    await drainOutbox(mail, { ids: [id] });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // due: tried again, with a longer wait each time, until the cap
    for (let attempt = 2; attempt <= MAX_ATTEMPTS; attempt++) {
      await sql("UPDATE notification_outbox SET next_attempt_at = '2000-01-01T00:00:00.000Z' WHERE id = ?", id).run();
      await drainOutbox(mail, { ids: [id] });
      expect((await state(id))!.attempts).toBe(attempt);
    }
    expect(await state(id)).toMatchObject({ status: "dead", attempts: MAX_ATTEMPTS, next_attempt_at: null });
    expect(fetchMock).toHaveBeenCalledTimes(MAX_ATTEMPTS);
    // dead is final for the cron
    await sql("UPDATE notification_outbox SET next_attempt_at = '2000-01-01T00:00:00.000Z' WHERE id = ?", id).run();
    await drainOutbox(mail, { ids: [id] });
    expect(fetchMock).toHaveBeenCalledTimes(MAX_ATTEMPTS);

    // and a sent message is never picked up again
    const sentId = await queue("ob-sent@aris.test", { status: "sent", attempts: 1 });
    await drainOutbox(mail, { ids: [sentId] });
    expect(fetchMock).toHaveBeenCalledTimes(MAX_ATTEMPTS);
  });

  it("grows the backoff exponentially, capped", () => {
    expect([1, 2, 3, 4, 5].map(backoffMinutes)).toEqual([5, 10, 20, 40, 80]);
    expect(backoffMinutes(20)).toBe(360);
  });

  it("drops an expired reset link unsent and clears its text", async () => {
    const row = await sql(
      "INSERT INTO notification_outbox (user_id, channel, recipient, subject, body, expires_at) VALUES (?, 'email', 'ob-de@aris.test', 'Reset', 'token=secret', '2000-01-01T00:00:00.000Z') RETURNING id",
      deId,
    ).first<{ id: number }>();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => ok());
    await drainOutbox(withMail({ RESEND_API_KEY: "k" }), { ids: [row!.id] });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await sql("SELECT status, body, last_error FROM notification_outbox WHERE id = ?", row!.id).first()).toEqual({ status: "dead", body: null, last_error: "expired" });
  });
});

describe("staff notices are e-mailed too", async () => {
  const a = await addFederationSeat("OBA");
  const mate = await addUser("ob-mate@aris.test", "federation", { federationId: a.federationId });
  const b = await addFederationSeat("OBB");
  const closed = await addUser("ob-closed@aris.test", "federation", { federationId: a.federationId });
  await sql("UPDATE users SET active = 0 WHERE id = ?", closed).run();
  const adm = await addUser("ob-admin@aris.test", "admin");
  await addOfficial("ob-off", "OBA");
  const ref = await addUser("ob-ref@aris.test", "referee", { officialId: "ob-off" });
  const recipients = async (dedupe: string) =>
    (
      await sql("SELECT o.recipient FROM notification_outbox o JOIN notifications n ON n.id = o.notification_id WHERE n.dedupe_key = ? ORDER BY o.recipient", dedupe).all<{ recipient: string }>()
    ).results.map((r) => r.recipient);
  const base = { title: { fr: "t", en: "t" }, detail: { fr: "d", en: "d" }, tone: "pitch" as const };

  it("queues one e-mail per active seat of the addressed country, once even when repeated", async () => {
    await env.DB.batch(notifyStmts(env.DB, { ...base, audienceRole: "federation", countryCode: "OBA", dedupeKey: "ob-fed" }));
    await env.DB.batch(notifyStmts(env.DB, { ...base, audienceRole: "federation", countryCode: "OBA", dedupeKey: "ob-fed" }));
    expect(await recipients("ob-fed")).toEqual(["ob-mate@aris.test", a.email].sort());
    void mate;
    void b;
  });

  it("queues admins for admin notices and the one account for a direct staff notice, never referees en masse", async () => {
    await env.DB.batch(notifyStmts(env.DB, { ...base, audienceRole: "admin", dedupeKey: "ob-adm" }));
    expect(await recipients("ob-adm")).toContain("ob-admin@aris.test");
    await env.DB.batch(notifyStmts(env.DB, { ...base, userId: adm, dedupeKey: "ob-one" }));
    expect(await recipients("ob-one")).toEqual(["ob-admin@aris.test"]);
    await env.DB.batch(notifyStmts(env.DB, { ...base, audienceRole: "referee", dedupeKey: "ob-refs" }));
    expect(await recipients("ob-refs")).toEqual([]);
    await env.DB.batch(notifyStmts(env.DB, { ...base, userId: ref, dedupeKey: "ob-ref-direct" }));
    expect(await recipients("ob-ref-direct")).toEqual([]);
    await env.DB.batch(notifyStmts(env.DB, { ...base, audienceRole: "admin", dedupeKey: "ob-quiet", email: false }));
    expect(await recipients("ob-quiet")).toEqual([]);
  });
});

describe("the outbox screen's API", async () => {
  const sa = await addFederationSeat("OXA");
  const sb = await addFederationSeat("OXB");
  await addOfficial("ox-off", "OXA");
  const refId = await addUser("ox-ref@aris.test", "referee", { officialId: "ox-off" });
  await addUser("ox-admin@aris.test", "admin");
  const admin = await login("ox-admin@aris.test");
  const fedA = await login(sa.email);
  const fedB = await login(sb.email);
  const ref = await login("ox-ref@aris.test");
  const toA = await queue("ox-ref@aris.test", { userId: refId, status: "dead", attempts: 6 });
  const toB = await queue(sb.email, { userId: sb.userId, status: "failed", attempts: 2 });
  const sent = await queue(sa.email, { userId: sa.userId, status: "sent", attempts: 1 });
  const ids = (res: { json: { messages: Array<{ id: number }> } }) => res.json.messages.map((m) => m.id);

  it("lists every message for an admin, by status, with counts and a cursor; a body is never returned", async () => {
    const all = await api("GET", "/api/v1/notifications/outbox?limit=200", { session: admin });
    expect(all.status).toBe(200);
    expect(ids(all)).toEqual(expect.arrayContaining([toA, toB, sent]));
    expect(all.json.counts).toMatchObject({ dead: expect.any(Number), failed: expect.any(Number), sent: expect.any(Number), queued: expect.any(Number) });
    const msg = all.json.messages.find((m: { id: number }) => m.id === toA);
    expect(msg).toMatchObject({ kind: "notification", status: "dead", attempts: 6, recipient: "ox-ref@aris.test", country: "OXA", title: { en: "Title" } });
    expect(msg).not.toHaveProperty("body");
    expect(ids(await api("GET", "/api/v1/notifications/outbox?status=dead&limit=200", { session: admin }))).not.toContain(toB);

    const first = await api("GET", "/api/v1/notifications/outbox?limit=1", { session: admin });
    expect(first.json.messages).toHaveLength(1);
    const second = await api("GET", `/api/v1/notifications/outbox?limit=1&cursor=${first.json.nextCursor}`, { session: admin });
    expect(second.json.messages[0].id).toBeLessThan(first.json.messages[0].id);
    expect((await api("GET", "/api/v1/notifications/outbox?status=lost", { session: admin })).status).toBe(422);
  });

  it("shows a federation only its own country's messages", async () => {
    const a = ids(await api("GET", "/api/v1/notifications/outbox?limit=200", { session: fedA }));
    expect(a).toEqual(expect.arrayContaining([toA, sent]));
    expect(a).not.toContain(toB);
    expect(ids(await api("GET", "/api/v1/notifications/outbox?limit=200", { session: fedB }))).toEqual([toB]);
  });

  it("is staff only", async () => {
    expect((await api("GET", "/api/v1/notifications/outbox", { session: ref })).status).toBe(403);
    expect((await api("GET", "/api/v1/notifications/outbox")).status).toBe(401);
  });

  it("lets an admin requeue a failed or dead message, with a fresh budget, and audits it", async () => {
    const res = await api("POST", `/api/v1/notifications/outbox/${toA}/retry`, { session: admin });
    expect(res.status).toBe(200);
    expect(res.json.message).toMatchObject({ id: toA, status: "queued", attempts: 0, nextAttemptAt: null });
    expect(await sql("SELECT 1 AS x FROM audit_log WHERE action = 'outbox.retry' AND entity_id = ?", String(toA)).first()).not.toBeNull();
    expect((await api("POST", `/api/v1/notifications/outbox/${toA}/retry`, { session: admin })).json.error.code).toBe("already_queued");
    expect((await api("POST", `/api/v1/notifications/outbox/${sent}/retry`, { session: admin })).json.error.code).toBe("already_sent");
    expect((await api("POST", "/api/v1/notifications/outbox/999999/retry", { session: admin })).status).toBe(404);
  });

  it("refuses retries from anyone but an admin, without side effects", async () => {
    expect((await api("POST", `/api/v1/notifications/outbox/${toB}/retry`, { session: fedB })).status).toBe(403);
    expect((await api("POST", `/api/v1/notifications/outbox/${toB}/retry`, { session: fedA })).status).toBe(403);
    expect((await api("POST", `/api/v1/notifications/outbox/${toB}/retry`, { session: ref })).status).toBe(403);
    expect((await api("POST", `/api/v1/notifications/outbox/${toB}/retry`)).status).toBe(401);
    expect(await state(toB)).toMatchObject({ status: "failed", attempts: 2 });
  });

  it("refuses to resend a reset link whose text is gone", async () => {
    const row = await sql(
      "INSERT INTO notification_outbox (user_id, channel, recipient, subject, body, status, expires_at) VALUES (?, 'email', 'ox-ref@aris.test', 'Reset', NULL, 'dead', '2000-01-01T00:00:00.000Z') RETURNING id",
      refId,
    ).first<{ id: number }>();
    const res = await api("POST", `/api/v1/notifications/outbox/${row!.id}/retry`, { session: admin });
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("expired");
  });
});
