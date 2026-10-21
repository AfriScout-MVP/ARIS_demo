import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { commitMedia } from "../../src/lib/media";
import { addFederationSeat, addOfficial, addUser, api, jpeg, login, pdf, png, sql, upload } from "../helpers";

describe("storing files", async () => {
  const seat = await addFederationSeat("MUA");
  await addOfficial("mu-off", "MUA");
  await addUser("mu-ref@aris.test", "referee", { officialId: "mu-off" });
  const ref = await login("mu-ref@aris.test");
  const fed = await login(seat.email);

  const sha = async (b: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", b))].map((x) => x.toString(16).padStart(2, "0")).join("");

  it("records the object, the hash, the owner and the uploader, under a server-generated key", async () => {
    const bytes = pdf(5);
    const res = await upload(ref, "POST", "/officials/mu-off/documents", bytes, "../../etc/passwd medical.pdf", { kind: "medical", expiresOn: "2030-01-31" });
    expect(res.status).toBe(201);
    const { mediaId, id: docId } = res.json.document;
    const asset = (await sql("SELECT * FROM media_assets WHERE id = ?", mediaId).first<Record<string, unknown>>())!;
    expect(asset).toMatchObject({ kind: "document", visibility: "private", content_type: "application/pdf", size: bytes.length, owner_type: "official", owner_id: "mu-off", sha256: await sha(bytes) });
    expect(asset.r2_key).toMatch(/^document\/mu-off\/[0-9a-f-]{36}\.pdf$/);
    expect(asset.filename).not.toContain("/");
    expect(asset.uploaded_by).toBeTruthy();
    const obj = await env.MEDIA.get(asset.r2_key as string);
    expect(new Uint8Array(await obj!.arrayBuffer())).toEqual(bytes);
    expect(await sql("SELECT media_id, expires_on, status FROM documents WHERE id = ?", docId).first()).toEqual({ media_id: mediaId, expires_on: "2030-01-31", status: "pending" });
    const audit = await sql("SELECT country_code, actor_role FROM audit_log WHERE action = 'document.upload' AND entity_id = 'mu-off'").first();
    expect(audit).toEqual({ country_code: "MUA", actor_role: "referee" });
  });

  it("a new photo replaces the old one: row, document and object", async () => {
    const first = await upload(ref, "POST", "/officials/mu-off/documents", png(1), "me.png", { kind: "photo" });
    expect(first.status).toBe(201);
    const key1 = (await sql("SELECT r2_key FROM media_assets WHERE id = ?", first.json.document.mediaId).first<{ r2_key: string }>())!.r2_key;
    expect(key1).toMatch(/^photo\//);
    const second = await upload(fed, "POST", "/officials/mu-off/documents", jpeg(2), "me2.jpg", { kind: "photo" });
    expect(second.status).toBe(201);
    expect((await sql("SELECT photo_media_id FROM officials WHERE id = 'mu-off'").first<{ photo_media_id: string }>())!.photo_media_id).toBe(second.json.document.mediaId);
    expect(await env.MEDIA.head(key1)).toBeNull();
    expect(await sql("SELECT COUNT(*) AS n FROM media_assets WHERE id = ?", first.json.document.mediaId).first()).toEqual({ n: 0 });
    expect(await sql("SELECT COUNT(*) AS n FROM documents WHERE id = ?", first.json.document.id).first()).toEqual({ n: 0 });
    expect(await sql("SELECT COUNT(*) AS n FROM media_assets WHERE kind = 'photo' AND owner_id = 'mu-off'").first()).toEqual({ n: 1 });
  });

  it("deleting a document removes its row and its object, and a photo clears photo_media_id", async () => {
    const up = await upload(ref, "POST", "/officials/mu-off/documents", png(9), "temp.png", { kind: "other" });
    const key = (await sql("SELECT r2_key FROM media_assets WHERE id = ?", up.json.document.mediaId).first<{ r2_key: string }>())!.r2_key;
    expect((await api("DELETE", `/api/v1/documents/${up.json.document.id}`, { session: ref })).status).toBe(200);
    expect(await env.MEDIA.head(key)).toBeNull();
    expect(await sql("SELECT COUNT(*) AS n FROM media_assets WHERE r2_key = ?", key).first()).toEqual({ n: 0 });

    const photoId = (await sql("SELECT photo_media_id FROM officials WHERE id = 'mu-off'").first<{ photo_media_id: string }>())!.photo_media_id;
    const doc = await sql("SELECT id FROM documents WHERE media_id = ?", photoId).first<{ id: string }>();
    expect((await api("DELETE", `/api/v1/documents/${doc!.id}`, { session: fed })).status).toBe(200);
    expect(await sql("SELECT photo_media_id FROM officials WHERE id = 'mu-off'").first()).toEqual({ photo_media_id: null });
  });

  it("removes the object again when the database batch fails", async () => {
    const before = (await env.MEDIA.list({ prefix: "other/mu-fail/" })).objects.length;
    const user = { id: "x", role: "admin", email: "x", name: "x", officialId: null, federationId: null, country: null, federationCode: null, locale: "fr" } as never;
    await expect(
      commitMedia(env, {
        upload: { type: "image/png", ext: "png", bytes: png(), filename: "a.png", sha256: "0".repeat(64) },
        user,
        kind: "other",
        visibility: "private",
        ownerType: "official",
        ownerId: "mu-fail",
        then: () => [env.DB.prepare("INSERT INTO no_such_table VALUES (1)")],
        audit: { action: "x", entity: "x", entityId: "x" },
      }),
    ).rejects.toThrow();
    expect((await env.MEDIA.list({ prefix: "other/mu-fail/" })).objects.length).toBe(before);
    expect(await sql("SELECT COUNT(*) AS n FROM media_assets WHERE owner_id = 'mu-fail'").first()).toEqual({ n: 0 });
  });
});
