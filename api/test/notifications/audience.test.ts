import { describe, expect, it } from "vitest";
import { addFederationSeat, addOfficial, addUser, api, login, sql, type Session } from "../helpers";

describe("who sees which notification", async () => {
  const adminId = await addUser("nt-admin@aris.test", "admin");
  const sa = await addFederationSeat("NTA");
  const sb = await addFederationSeat("NTB");
  const seatA2 = await addUser("nt-seat-a2@aris.test", "federation", { federationId: sa.federationId });
  await addOfficial("nt-a", "NTA");
  await addOfficial("nt-b", "NTB");
  await addUser("nt-ref-a@aris.test", "referee", { officialId: "nt-a" });
  await addUser("nt-ref-b@aris.test", "referee", { officialId: "nt-b" });
  void adminId;

  const add = (key: string, audience: { user?: string; role?: string; country?: string }) =>
    sql(
      "INSERT INTO notifications (id, user_id, audience_role, country_code, title, detail, tone) VALUES (?, ?, ?, ?, ?, '{\"fr\":\"d\",\"en\":\"d\"}', 'pitch')",
      key, audience.user ?? null, audience.user ? null : (audience.role ?? null), audience.country ?? null, JSON.stringify({ fr: key, en: key }),
    ).run();
  await add("fed-all", { role: "federation" });
  await add("fed-nta", { role: "federation", country: "NTA" });
  await add("fed-ntb", { role: "federation", country: "NTB" });
  await add("admin-only", { role: "admin" });
  await add("admin-nta", { role: "admin", country: "NTA" });
  await add("ref-all", { role: "referee" });
  await add("ref-nta", { role: "referee", country: "NTA" });
  await add("to-seat-a", { user: sa.userId });

  const admin = await login("nt-admin@aris.test");
  const seatA = await login(sa.email);
  const seatB = await login(sb.email);
  const refA = await login("nt-ref-a@aris.test");
  const refB = await login("nt-ref-b@aris.test");
  const seen = async (s: Session) =>
    ((await api("GET", "/api/v1/notifications?limit=100", { session: s })).json.notifications as Array<{ title: { en: string } }>).map((n) => n.title.en).sort();

  it("shows each person what is addressed to them, to their role, and to their own country", async () => {
    expect(await seen(seatA)).toEqual(["fed-all", "fed-nta", "to-seat-a"]);
    expect(await seen(seatB)).toEqual(["fed-all", "fed-ntb"]);
    expect(await seen(refA)).toEqual(["ref-all", "ref-nta"]);
    expect(await seen(refB)).toEqual(["ref-all"]);
  });

  it("shows admins their own and everything addressed to federations", async () => {
    expect(await seen(admin)).toEqual(["admin-nta", "admin-only", "fed-all", "fed-nta", "fed-ntb"]);
  });

  it("keeps read state per person and counts unread ones", async () => {
    const list = (await api("GET", "/api/v1/notifications", { session: seatA })).json;
    expect(list.unread).toBe(3);
    const target = list.notifications.find((n: { title: { en: string } }) => n.title.en === "fed-all");
    expect(target.read).toBe(false);
    expect((await api("POST", `/api/v1/notifications/${target.id}/read`, { session: seatA })).status).toBe(200);
    const after = (await api("GET", "/api/v1/notifications", { session: seatA })).json;
    expect(after.unread).toBe(2);
    expect(after.notifications.find((n: { id: string }) => n.id === target.id).read).toBe(true);
    expect((await api("GET", "/api/v1/notifications?unread=1", { session: seatA })).json.notifications).toHaveLength(2);
    // a colleague in the same federation has not read it
    const colleague = await login("nt-seat-a2@aris.test");
    expect((await api("GET", "/api/v1/notifications", { session: colleague })).json.notifications.find((n: { id: string }) => n.id === target.id).read).toBe(false);
    void seatA2;
    expect((await api("POST", "/api/v1/notifications/read-all", { session: seatA })).status).toBe(200);
    expect((await api("GET", "/api/v1/notifications", { session: seatA })).json.unread).toBe(0);
    expect((await api("GET", "/api/v1/notifications", { session: seatB })).json.unread).toBe(2);
  });

  it("refuses to mark a notification that is not theirs (404) and requires a session", async () => {
    const adminList = (await api("GET", "/api/v1/notifications", { session: admin })).json.notifications as Array<{ id: string; title: { en: string } }>;
    const foreign = adminList.find((n) => n.title.en === "fed-nta")!;
    expect((await api("POST", `/api/v1/notifications/${foreign.id}/read`, { session: seatB })).status).toBe(404);
    expect((await api("POST", `/api/v1/notifications/${foreign.id}/read`, { session: refA })).status).toBe(404);
    expect((await api("POST", `/api/v1/notifications/${foreign.id}/read`)).status).toBe(401);
    expect((await api("GET", "/api/v1/notifications")).status).toBe(401);
    expect((await sql("SELECT COUNT(*) AS n FROM notification_reads WHERE notification_id = ?", foreign.id).first<{ n: number }>())!.n).toBe(1); // only seat A's read-all
  });
});
