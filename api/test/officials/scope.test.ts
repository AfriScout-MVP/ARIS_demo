import { describe, expect, it } from "vitest";
import { addFederationSeat, addOfficial, addUser, api, login, png, sql, upload } from "../helpers";

describe("officials are confined to their country", async () => {
  await addUser("os-admin@aris.test", "admin");
  const sa = await addFederationSeat("OSA");
  const sb = await addFederationSeat("OSB");
  await addOfficial("os-a1", "OSA");
  await addOfficial("os-a2", "OSA", { kind: "assistant" });
  await addOfficial("os-b1", "OSB");
  await addUser("os-ref-a1@aris.test", "referee", { officialId: "os-a1" });
  await addUser("os-ref-b1@aris.test", "referee", { officialId: "os-b1" });
  const admin = await login("os-admin@aris.test");
  const fedA = await login(sa.email);
  const refA = await login("os-ref-a1@aris.test");
  const refB = await login("os-ref-b1@aris.test");
  void sb;
  const ids = (res: { json: { officials: Array<{ id: string }> } }) => res.json.officials.map((o) => o.id).sort();

  it("lists only the seat's own country, whatever the query says", async () => {
    expect(ids(await api("GET", "/api/v1/officials", { session: fedA }))).toEqual(["os-a1", "os-a2"]);
    expect(ids(await api("GET", "/api/v1/officials?country=OSB", { session: fedA }))).toEqual([]);
    expect(ids(await api("GET", "/api/v1/officials?kind=assistant", { session: fedA }))).toEqual(["os-a2"]);
    expect(ids(await api("GET", "/api/v1/officials?q=os-b1", { session: fedA }))).toEqual([]);
    const all = ids(await api("GET", "/api/v1/officials", { session: admin }));
    expect(all).toEqual(expect.arrayContaining(["os-a1", "os-b1"]));
    expect(ids(await api("GET", "/api/v1/officials?country=OSB", { session: admin }))).toEqual(["os-b1"]);
  });

  it("answers 404 (federation) or 403 (referee) for another country's official, on every sub-resource", async () => {
    const reads = ["", "/photo", "/availability"];
    for (const r of reads) {
      expect((await api("GET", `/api/v1/officials/os-b1${r}`, { session: fedA })).status, r).toBe(404);
      expect((await api("GET", `/api/v1/officials/os-b1${r}`, { session: refA })).status, r).toBe(403);
    }
    expect((await api("PATCH", "/api/v1/officials/os-b1", { session: fedA, body: { city: "X" } })).status).toBe(404);
    expect((await upload(fedA, "POST", "/officials/os-b1/documents", png(), "a.png", { kind: "other" })).status).toBe(404);
    expect((await api("PATCH", "/api/v1/officials/os-b1", { session: refA, body: { city: "X" } })).status).toBe(403);
    expect((await sql("SELECT city FROM officials WHERE id = 'os-b1'").first<{ city: string | null }>())!.city).toBeNull();
    expect((await api("GET", "/api/v1/officials/ghost", { session: fedA })).status).toBe(404);
  });

  it("gives a referee only their own file; staff routes are 403", async () => {
    expect((await api("GET", "/api/v1/officials/os-a1", { session: refA })).status).toBe(200);
    expect((await api("GET", "/api/v1/officials/os-a2", { session: refA })).status).toBe(403);
    expect((await api("GET", "/api/v1/officials", { session: refA })).status).toBe(403);
    expect((await api("GET", "/api/v1/officials/os-a1", { session: refB })).status).toBe(403);
    expect((await api("GET", "/api/v1/officials/os-a1")).status).toBe(401);
  });

  it("exposes the whole file (contact details included) to those allowed to read it", async () => {
    await sql("UPDATE officials SET phone = '+212 600', email = 'a1@x.org', birth_date = '1988-02-02' WHERE id = 'os-a1'").run();
    for (const s of [refA, fedA, admin]) {
      const res = await api("GET", "/api/v1/officials/os-a1", { session: s });
      expect(res.json.official).toMatchObject({ phone: "+212 600", email: "a1@x.org", birthDate: "1988-02-02" });
    }
  });

  it("serves the photo of an official through the media route with the same rules", async () => {
    const up = await upload(refA, "POST", "/officials/os-a1/documents", png(2), "p.png", { kind: "photo" });
    expect(up.status).toBe(201);
    const redirect = await api("GET", "/api/v1/officials/os-a1/photo", { session: fedA });
    expect(redirect.status).toBe(302);
    expect((await api("GET", redirect.headers.get("location")!, { session: fedA })).status).toBe(200);
    expect((await api("GET", redirect.headers.get("location")!, { session: refB })).status).toBe(404);
    expect((await api("GET", "/api/v1/officials/os-a2/photo", { session: fedA })).status).toBe(404);
    expect((await api("GET", "/api/v1/officials/os-a1", { session: admin })).json.official.photoUrl).toBe(up.json.document.url);
  });
});
