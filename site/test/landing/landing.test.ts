import { describe, expect, it } from "vitest";
import { H, W, assistantAt, keepClear, ballAt, formation, metres, playerAt, projectOnDiagonal, refereeTarget, DIAGONAL } from "@/lib/landing/pitch";
import { countryName, feedEntries } from "@/lib/landing/federations";

const times = Array.from({ length: 600 }, (_, i) => i * 0.37);

describe("hero pitch choreography", () => {
  it("keeps the ball on the pitch", () => {
    for (const t of times) {
      const b = ballAt(t);
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x).toBeLessThanOrEqual(W);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeLessThanOrEqual(H);
    }
  });

  it("never puts the referee on top of the ball", () => {
    for (const t of times) expect(metres(refereeTarget(ballAt(t)), ballAt(t))).toBeGreaterThanOrEqual(9);
  });

  it("pushes a referee the ball has run onto back to 9 m", () => {
    expect(metres(keepClear({ x: 500, y: 300 }, { x: 510, y: 300 }), { x: 510, y: 300 })).toBe(9);
    expect(metres(keepClear({ x: 510, y: 300 }, { x: 510, y: 300 }), { x: 510, y: 300 })).toBe(9);
    expect(keepClear({ x: 100, y: 100 }, { x: 510, y: 300 })).toEqual({ x: 100, y: 100 });
  });

  it("projects onto the diagonal segment, never past its ends", () => {
    expect(projectOnDiagonal({ x: -500, y: 2000 })).toEqual(DIAGONAL[0]);
    expect(projectOnDiagonal({ x: 3000, y: -900 })).toEqual(DIAGONAL[1]);
  });

  it("sends each assistant to their own half of their own touchline", () => {
    for (const t of times) {
      const b = ballAt(t);
      const a1 = assistantAt(b, 1);
      const a2 = assistantAt(b, 2);
      expect(a1.x).toBeGreaterThanOrEqual(W / 2);
      expect(a1.y).toBeLessThan(H / 2);
      expect(a2.x).toBeLessThanOrEqual(W / 2);
      expect(a2.y).toBeGreaterThan(H / 2);
    }
  });

  it("fields eleven a side, mirrored, and keeps every player inside the lines", () => {
    const home = formation("home");
    const away = formation("away");
    expect(home).toHaveLength(11);
    expect(away[0]).toEqual({ x: W - home[0].x, y: H - home[0].y });
    for (const t of times.slice(0, 120))
      for (const [i, p] of [...home, ...away].entries()) {
        const q = playerAt(p, i, ballAt(t), t);
        expect(q.x).toBeGreaterThan(0);
        expect(q.x).toBeLessThan(W);
        expect(q.y).toBeGreaterThan(0);
        expect(q.y).toBeLessThan(H);
      }
  });
});

describe("landing federations", () => {
  const sen = { code: "SEN", iso2: "SN", name: "Senegal", nameFr: "Sénégal", nameEs: "Senegal", nameDe: "Senegal", flagUrl: null, federation: "FSF", federationName: "Fédération Sénégalaise de Football" };
  const cog = { ...sen, code: "COG", iso2: "CG", name: "Congo", nameFr: "Congo", nameEs: "Congo", nameDe: "Kongo", federation: "FECOFOOT" };

  it("names a country in the visitor's language, from its own record", () => {
    expect(countryName(sen, "fr")).toBe("Sénégal");
    expect(countryName(sen, "en")).toBe("Senegal");
    expect(countryName(cog, "de")).toBe("Kongo");
    expect(countryName({ ...cog, nameEs: "" }, "es")).toBe("Congo");
  });

  it("attributes the audit feed to the live federations in turn", () => {
    const feed = feedEntries([sen, cog]);
    expect(feed.map((e) => e.who)).toEqual(["FSF", "FECOFOOT", "FSF", "FECOFOOT", "FSF", "FECOFOOT", "FSF", "FECOFOOT"]);
    for (const e of feed) expect(e.at).toMatch(/^\d{2}:\d{2}$/);
    expect(new Set(feedEntries([]).map((e) => e.who))).toEqual(new Set(["ARIS"]));
  });
});
