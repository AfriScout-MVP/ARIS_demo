import { describe, expect, it } from "vitest";
import { addCountry, addFederationSeat, addOfficial, api } from "../helpers";

describe("public summary", async () => {
  await addFederationSeat("PBA");
  await addCountry("PBI", { active: false });
  await addOfficial("pb-1", "PBA");
  await addOfficial("pb-2", "PBA", { status: "retired" });
  await addOfficial("pb-3", "PBI");

  it("answers without a session, with the active countries and their federations only", async () => {
    const res = await api("GET", "/api/v1/public/summary");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
    const codes = res.json.countries.map((c: { code: string }) => c.code);
    expect(codes).toContain("PBA");
    expect(codes).not.toContain("PBI");
    expect(res.json.countries.find((c: { code: string }) => c.code === "PBA")).toEqual({
      code: "PBA", iso2: expect.any(String), name: expect.any(String), nameFr: "PBA fr", nameEs: "PBA es", nameDe: "PBA de",
      flagUrl: null, federation: "PBAFF", federationName: "Federation PBA",
    });
    expect(res.json.figures.countries).toBe(codes.length);
  });

  it("counts only serving officials of active countries", async () => {
    const before = (await api("GET", "/api/v1/public/summary")).json.figures.officials;
    await addOfficial("pb-4", "PBA");
    await addOfficial("pb-5", "PBI");
    expect((await api("GET", "/api/v1/public/summary")).json.figures.officials).toBe(before + 1);
  });

  it("is read-only", async () => {
    // no write route exists, so a POST falls through to the sign-in gate
    expect((await api("POST", "/api/v1/public/summary", { body: {} })).status).toBe(401);
  });
});
