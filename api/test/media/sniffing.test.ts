import { describe, expect, it } from "vitest";
import { sniff } from "../../src/lib/media";
import { addFederationSeat, addOfficial, addUser, api, exe, html, jpeg, login, pdf, png, sql, svg, upload, webp } from "../helpers";

describe("what a file really is", async () => {
  const seat = await addFederationSeat("SNA");
  await addOfficial("sn-off", "SNA");
  await addUser("sn-ref@aris.test", "referee", { officialId: "sn-off" });
  const ref = await login("sn-ref@aris.test");
  const fed = await login(seat.email);
  const doc = (bytes: Uint8Array, name: string, fields: Record<string, string> = { kind: "other" }) => upload(ref, "POST", "/officials/sn-off/documents", bytes, name, fields);

  it("recognises PDF, PNG, JPEG and WebP by their leading bytes only", () => {
    expect(sniff(pdf())?.type).toBe("application/pdf");
    expect(sniff(png())?.type).toBe("image/png");
    expect(sniff(jpeg())?.type).toBe("image/jpeg");
    expect(sniff(webp())?.type).toBe("image/webp");
    expect(sniff(svg())).toBeNull();
    expect(sniff(html())).toBeNull();
    expect(sniff(exe())).toBeNull();
    expect(sniff(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]))).toBeNull(); // RIFF/WAVE
    expect(sniff(new Uint8Array())).toBeNull();
  });

  it("accepts the four types whatever they are called", async () => {
    for (const [bytes, name, type] of [
      [png(), "a.pdf", "image/png"],
      [jpeg(), "b.png", "image/jpeg"],
      [webp(), "c.txt", "image/webp"],
      [pdf(), "d.jpg", "application/pdf"],
    ] as const) {
      const res = await doc(bytes, name);
      expect(res.status, name).toBe(201);
      expect(res.json.document.contentType).toBe(type); // the stored type comes from the bytes, not from the name or the client
    }
  });

  it("refuses SVG, HTML and executables (415), however they are named", async () => {
    for (const [bytes, name] of [[svg(), "logo.svg"], [svg(), "logo.png"], [html(), "page.png"], [exe(), "photo.jpg"]] as const) {
      const res = await doc(bytes, name);
      expect(res.status, name).toBe(415);
      expect(res.json.error.code).toBe("unsupported_type");
    }
    expect((await upload(fed, "PUT", "/teams/none/logo", svg(), "x.svg")).status).toBe(404);
    expect(await sql("SELECT COUNT(*) AS n FROM media_assets WHERE content_type = 'image/svg+xml'").first()).toEqual({ n: 0 });
  });

  it("refuses an empty file (422), a missing file (422) and a file over 8 MB (413)", async () => {
    expect((await doc(new Uint8Array(0), "empty.png")).status).toBe(422);
    expect((await api("POST", "/api/v1/officials/sn-off/documents", { session: ref, body: { kind: "other" } })).status).toBe(422);
    const big = new Uint8Array(8 * 1024 * 1024 + 1);
    big.set(png());
    const res = await doc(big, "big.png");
    expect(res.status).toBe(413);
    expect(res.json.error.code).toBe("too_large");
    const exactly = new Uint8Array(8 * 1024 * 1024);
    exactly.set(png());
    expect((await doc(exactly, "exact.png")).status).toBe(201);
  });

  it("requires a valid kind, and a photo must be an image", async () => {
    expect((await doc(png(), "a.png", { kind: "selfie" })).status).toBe(422);
    expect((await doc(png(), "a.png", {})).status).toBe(422);
    expect((await doc(pdf(), "a.pdf", { kind: "photo" })).status).toBe(415);
  });

  it("images-only endpoints refuse PDFs", async () => {
    await addUser("sn-admin@aris.test", "admin");
    const admin = await login("sn-admin@aris.test");
    expect((await upload(admin, "PUT", "/countries/SNA/flag", pdf())).status).toBe(415);
    expect((await upload(admin, "PUT", `/federations/${seat.federationId}/logo`, pdf())).status).toBe(415);
    expect((await upload(admin, "PUT", `/federations/${seat.federationId}/logo`, png())).status).toBe(200);
  });
});
