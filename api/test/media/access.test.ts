import { describe, expect, it } from "vitest";
import { addFederationSeat, addOfficial, addUser, api, login, png, sql, upload, uid } from "../helpers";

describe("who may read a private file", async () => {
  await addUser("ma-admin@aris.test", "admin");
  const seatA = await addFederationSeat("MAA");
  const seatB = await addFederationSeat("MAB");
  await addOfficial("ma-a1", "MAA");
  await addOfficial("ma-a2", "MAA");
  await addUser("ma-ref1@aris.test", "referee", { officialId: "ma-a1" });
  await addUser("ma-ref2@aris.test", "referee", { officialId: "ma-a2" });
  const admin = await login("ma-admin@aris.test");
  const fedA = await login(seatA.email);
  const fedB = await login(seatB.email);
  const ref1 = await login("ma-ref1@aris.test");
  const ref2 = await login("ma-ref2@aris.test");

  const file = (await upload(ref1, "POST", "/officials/ma-a1/documents", png(1), "id.png", { kind: "identity" })).json.document.url as string;

  it("allows the owner, a federation seat of the official's country and an admin", async () => {
    for (const s of [ref1, fedA, admin]) expect((await api("GET", file, { session: s })).status).toBe(200);
  });

  it("answers 401 without a session and 404 (not 403) to everyone else", async () => {
    expect((await api("GET", file)).status).toBe(401);
    for (const s of [ref2, fedB]) expect((await api("GET", file, { session: s })).status).toBe(404);
  });

  it("answers 404 for ids that do not exist", async () => {
    expect((await api("GET", "/api/v1/media/00000000-0000-0000-0000-000000000000", { session: admin })).status).toBe(404);
    expect((await api("GET", "/api/v1/media/00000000-0000-0000-0000-000000000000")).status).toBe(401);
  });

  it("answers 404 when the owner cannot be resolved, even to an admin; ownerless files are admin-only", async () => {
    const insert = (id: string, ownerType: string | null, ownerId: string | null) =>
      sql(
        "INSERT INTO media_assets (id, kind, visibility, r2_key, filename, content_type, size, sha256, owner_type, owner_id) VALUES (?, 'other', 'private', ?, 'x.png', 'image/png', 1, ?, ?, ?)",
        id, `other/${id}.png`, "0".repeat(64), ownerType, ownerId,
      ).run();
    const orphan = uid("orphan");
    const ownerless = uid("ownerless");
    const payment = uid("payment");
    await insert(orphan, "official", "no-such-official");
    await insert(ownerless, null, null);
    await insert(payment, "payment", "no-such-payment");
    expect((await api("GET", `/api/v1/media/${orphan}`, { session: admin })).status).toBe(404);
    expect((await api("GET", `/api/v1/media/${payment}`, { session: admin })).status).toBe(404);
    expect((await api("GET", `/api/v1/media/${ownerless}`, { session: fedA })).status).toBe(404);
    // visible to the admin as a row; the object is missing from R2, so the answer is still a 404, not a 500
    expect((await api("GET", `/api/v1/media/${ownerless}`, { session: admin })).status).toBe(404);
  });
});
