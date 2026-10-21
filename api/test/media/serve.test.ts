import { describe, expect, it } from "vitest";
import { addCountry, addFederationSeat, addOfficial, addUser, api, login, pdf, png, upload } from "../helpers";

describe("serving files", async () => {
  await addUser("sv-admin@aris.test", "admin");
  const seat = await addFederationSeat("SVA");
  await addOfficial("sv-off", "SVA");
  await addUser("sv-ref@aris.test", "referee", { officialId: "sv-off" });
  await addCountry("SVB");
  const admin = await login("sv-admin@aris.test");
  const ref = await login("sv-ref@aris.test");
  void seat;

  const flag = (await upload(admin, "PUT", "/countries/SVB/flag", png(7), "f.png")).json.country.flagUrl as string;
  const photo = (await upload(ref, "POST", "/officials/sv-off/documents", png(8), "p.png", { kind: "photo" })).json.document.url as string;
  const doc = (await upload(ref, "POST", "/officials/sv-off/documents", pdf(8), "m.pdf", { kind: "medical" })).json.document.url as string;

  it("serves a public asset with no session, cacheable for a day", async () => {
    const res = await api("GET", flag);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe("public, max-age=86400");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toBe("default-src 'none'; sandbox");
    expect(res.headers.get("content-disposition")).toMatch(/^inline;/);
    expect(res.headers.get("etag")).toMatch(/^"[0-9a-f]{64}"$/);
  });

  it("serves a private image inline and a PDF as an attachment, never cached publicly", async () => {
    const img = await api("GET", photo, { session: ref });
    expect(img.status).toBe(200);
    expect(img.headers.get("content-disposition")).toMatch(/^inline;/);
    expect(img.headers.get("cache-control")).toBe("private, no-cache");
    expect(img.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    expect(img.headers.get("x-content-type-options")).toBe("nosniff");
    expect(img.headers.get("content-security-policy")).toBe("default-src 'none'; sandbox");
    const file = await api("GET", doc, { session: ref });
    expect(file.headers.get("content-type")).toBe("application/pdf");
    expect(file.headers.get("content-disposition")).toMatch(/^attachment; filename="m\.pdf"$/);
  });

  it("supports conditional requests with the content hash as ETag", async () => {
    const first = await api("GET", flag);
    const etag = first.headers.get("etag")!;
    const again = await api("GET", flag, { headers: { "if-none-match": etag } });
    expect(again.status).toBe(304);
    expect(again.headers.get("etag")).toBe(etag);
    expect(again.headers.get("cache-control")).toBe("public, max-age=86400");
    expect((await api("GET", flag, { headers: { "if-none-match": '"something-else"' } })).status).toBe(200);
    // a private 304 still needs the session first
    const priv = (await api("GET", photo, { session: ref })).headers.get("etag")!;
    expect((await api("GET", photo, { session: ref, headers: { "if-none-match": priv } })).status).toBe(304);
    expect((await api("GET", photo, { headers: { "if-none-match": priv } })).status).toBe(401);
  });

  it("the legacy document and photo URLs serve through the same checks", async () => {
    const id = (await api("GET", "/api/v1/officials/sv-off", { session: ref })).json.documents.find((d: { kind: string }) => d.kind === "medical").id;
    const d = await api("GET", `/api/v1/documents/${id}`, { session: ref });
    expect(d.status).toBe(200);
    expect(d.headers.get("content-disposition")).toMatch(/^attachment/);
    const p = await api("GET", "/api/v1/officials/sv-off/photo", { session: ref });
    expect(p.status).toBe(302);
    expect(p.headers.get("location")).toBe(photo);
  });
});
