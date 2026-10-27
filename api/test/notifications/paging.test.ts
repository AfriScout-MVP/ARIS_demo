import { describe, expect, it } from "vitest";
import { addFederationSeat, addOfficial, addUser, api, login, sql } from "../helpers";

describe("notification paging and removal", async () => {
  const sa = await addFederationSeat("NPA");
  const sb = await addFederationSeat("NPB");
  const colleague = await addUser("np-colleague@aris.test", "federation", { federationId: sa.federationId });
  await addOfficial("np-off", "NPA");
  const refId = await addUser("np-ref@aris.test", "referee", { officialId: "np-off" });
  void colleague;

  const add = (key: string, at: string, audience: { user?: string; role?: string; country?: string }) =>
    sql(
      "INSERT INTO notifications (id, user_id, audience_role, country_code, title, detail, tone, created_at) VALUES (?, ?, ?, ?, ?, '{\"fr\":\"d\",\"en\":\"d\"}', 'pitch', ?)",
      key, audience.user ?? null, audience.user ? null : (audience.role ?? null), audience.country ?? null, JSON.stringify({ fr: key, en: key }), at,
    ).run();
  // 7 for seat A: 5 addressed to it (two share an instant), 2 to its country's federation
  for (let i = 1; i <= 5; i++) await add(`own-${i}`, `2026-10-0${i}T10:00:00.000Z`, { user: sa.userId });
  await add("own-tie", "2026-10-03T10:00:00.000Z", { user: sa.userId });
  await add("fed-npa", "2026-10-06T10:00:00.000Z", { role: "federation", country: "NPA" });
  await add("to-seat-b", "2026-10-06T11:00:00.000Z", { user: sb.userId });
  await add("to-ref", "2026-10-06T12:00:00.000Z", { user: refId });

  const seatA = await login(sa.email);
  const seatB = await login(sb.email);
  const ref = await login("np-ref@aris.test");
  const page = (s: typeof seatA, q: string) => api("GET", `/api/v1/notifications?${q}`, { session: s });

  it("walks every notification once, newest first, with an opaque cursor", async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const res = await page(seatA, `limit=3${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
      expect(res.status).toBe(200);
      seen.push(...res.json.notifications.map((n: { title: { en: string } }) => n.title.en));
      cursor = res.json.nextCursor;
      pages++;
    } while (cursor && pages < 10);
    expect(pages).toBe(3);
    expect(seen).toHaveLength(7);
    expect(new Set(seen).size).toBe(7);
    expect(seen[0]).toBe("fed-npa");
    expect(seen.at(-1)).toBe("own-1");
    expect((await page(seatA, "limit=50")).json.nextCursor).toBeNull();
  });

  it("refuses a malformed cursor", async () => {
    expect((await page(seatA, "cursor=%%%")).status).toBe(422);
    expect((await page(seatA, "limit=0")).status).toBe(422);
  });

  it("removes a notification from the caller's own list only", async () => {
    const list = (await page(seatA, "limit=50")).json.notifications as Array<{ id: string; title: { en: string } }>;
    const own = list.find((n) => n.title.en === "own-5")!;
    const shared = list.find((n) => n.title.en === "fed-npa")!;
    const unreadBefore = (await page(seatA, "limit=1")).json.unread;

    expect((await api("DELETE", `/api/v1/notifications/${own.id}`, { session: seatA })).status).toBe(200);
    expect((await api("DELETE", `/api/v1/notifications/${shared.id}`, { session: seatA })).status).toBe(200);
    const after = await page(seatA, "limit=50");
    expect(after.json.notifications.map((n: { id: string }) => n.id)).not.toContain(own.id);
    expect(after.json.notifications.map((n: { id: string }) => n.id)).not.toContain(shared.id);
    expect(after.json.unread).toBe(unreadBefore - 2);
    // a second removal finds nothing
    expect((await api("DELETE", `/api/v1/notifications/${own.id}`, { session: seatA })).status).toBe(404);

    // the shared notice is still there for a colleague of the same federation
    const mate = await login("np-colleague@aris.test");
    expect((await page(mate, "limit=50")).json.notifications.map((n: { id: string }) => n.id)).toContain(shared.id);
  });

  it("cannot remove someone else's notification (404, nothing changes) and needs a session", async () => {
    const theirs = (await page(seatB, "limit=50")).json.notifications.find((n: { title: { en: string } }) => n.title.en === "to-seat-b");
    expect((await api("DELETE", `/api/v1/notifications/${theirs.id}`, { session: seatA })).status).toBe(404);
    expect((await api("DELETE", `/api/v1/notifications/${theirs.id}`, { session: ref })).status).toBe(404);
    expect((await api("DELETE", `/api/v1/notifications/${theirs.id}`)).status).toBe(401);
    expect((await page(seatB, "limit=50")).json.notifications.map((n: { id: string }) => n.id)).toContain(theirs.id);
    // a referee removes their own
    const mine = (await page(ref, "limit=50")).json.notifications[0];
    expect((await api("DELETE", `/api/v1/notifications/${mine.id}`, { session: ref })).status).toBe(200);
    expect((await page(ref, "limit=50")).json.notifications).toHaveLength(0);
  });
});
