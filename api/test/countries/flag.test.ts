import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { addCountry, addFederationSeat, addUser, api, login, pdf, png, sql, svg, upload, webp } from "../helpers";

describe("country flag", async () => {
  await addUser("flag-admin@aris.test", "admin");
  const seat = await addFederationSeat("FLA");
  await addCountry("FLB");
  const admin = await login("flag-admin@aris.test");
  const fed = await login(seat.email);

  it("stores a public flag, serves it without a session, and removes the previous one when replaced", async () => {
    const first = await upload(admin, "PUT", "/countries/FLB/flag", png(1), "flag.png");
    expect(first.status).toBe(200);
    const url1 = first.json.country.flagUrl as string;
    expect(url1).toMatch(/^\/api\/v1\/media\/[0-9a-f-]{36}$/);
    const row1 = (await sql("SELECT r2_key, visibility, kind, owner_type, owner_id, content_type, size, sha256 FROM media_assets WHERE id = ?", url1.split("/").pop()!).first<Record<string, unknown>>())!;
    expect(row1).toMatchObject({ visibility: "public", kind: "flag", owner_type: "country", owner_id: "FLB", content_type: "image/png", size: png(1).length });
    expect(row1.r2_key).toMatch(/^flag\/FLB\/[0-9a-f-]{36}\.png$/);
    expect(await env.MEDIA.head(row1.r2_key as string)).not.toBeNull();

    const served = await api("GET", url1);
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/png");

    const second = await upload(admin, "PUT", "/countries/FLB/flag", webp(2), "flag.webp");
    expect(second.status).toBe(200);
    expect(second.json.country.flagUrl).not.toBe(url1);
    expect(await env.MEDIA.head(row1.r2_key as string)).toBeNull(); // the object is gone …
    expect((await api("GET", url1)).status).toBe(401); // … and so is the row (no session, no public asset: asks for sign-in)
    expect((await sql("SELECT COUNT(*) AS n FROM media_assets WHERE owner_type = 'country' AND owner_id = 'FLB'").first<{ n: number }>())!.n).toBe(1);
  });

  it("refuses non-admins, missing files, PDFs and SVG, and unknown countries", async () => {
    expect((await upload(fed, "PUT", "/countries/FLA/flag", png())).status).toBe(403);
    expect((await upload(null, "PUT", "/countries/FLA/flag", png())).status).toBe(401);
    expect((await upload(admin, "PUT", "/countries/ZZZ/flag", png())).status).toBe(404);
    expect((await api("PUT", "/api/v1/countries/FLA/flag", { session: admin, body: {} })).status).toBe(422);
    expect((await upload(admin, "PUT", "/countries/FLA/flag", pdf())).status).toBe(415);
    expect((await upload(admin, "PUT", "/countries/FLA/flag", svg(), "flag.svg")).status).toBe(415);
    expect((await sql("SELECT flag_media_id FROM countries WHERE code = 'FLA'").first<{ flag_media_id: string | null }>())!.flag_media_id).toBeNull();
  });
});
