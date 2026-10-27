import { beforeAll, describe, expect, it } from "vitest";
import { uid } from "../helpers";
import { fixture, get, world, type World } from "./support";

let w: World;
const ids: string[] = [];
beforeAll(async () => {
  w = await world();
  // seven fixtures on three days in 2040, one of them at a tie on the same instant
  for (const [date, time] of [["2040-02-01", "15:00"], ["2040-02-01", "18:00"], ["2040-02-01", "18:00"], ["2040-02-02", "12:00"], ["2040-02-03", "10:00"], ["2040-02-03", "20:00"], ["2040-02-04", "09:00"]]) {
    const id = uid("pg");
    await fixture(id, { country: "EGY", competition: "egy-d1", date, time });
    ids.push(id);
  }
});

const range = "from=2040-02-01&to=2040-02-04";

describe("GET /fixtures paging", () => {
  it("pages with limit + cursor in list order, the total staying the whole match", async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const res = await get(w.egy, `/fixtures?${range}&limit=3${cursor ? `&cursor=${cursor}` : ""}`);
      expect(res.status).toBe(200);
      expect(res.json.total).toBe(7);
      expect(res.json.fixtures.length).toBeLessThanOrEqual(3);
      seen.push(...res.json.fixtures.map((f: { id: string }) => f.id));
      cursor = res.json.nextCursor;
      pages += 1;
    } while (cursor && pages < 10);
    expect(pages).toBe(3);
    const all = (await get(w.egy, `/fixtures?${range}`)).json;
    expect(all.nextCursor).toBeNull();
    expect(seen).toEqual(all.fixtures.map((f: { id: string }) => f.id));
    expect(new Set(seen)).toEqual(new Set(ids));
  });

  it("keeps the local-date window exact on a page", async () => {
    const res = await get(w.egy, "/fixtures?from=2040-02-02&to=2040-02-03&limit=2");
    expect(res.json.total).toBe(3);
    expect(res.json.fixtures.map((f: { date: string }) => f.date)).toEqual(["2040-02-02", "2040-02-03"]);
    const next = await get(w.egy, `/fixtures?from=2040-02-02&to=2040-02-03&limit=2&cursor=${res.json.nextCursor}`);
    expect(next.json.fixtures.map((f: { date: string }) => f.date)).toEqual(["2040-02-03"]);
    expect(next.json.nextCursor).toBeNull();
  });

  it("refuses a forged cursor and stays scoped", async () => {
    expect((await get(w.egy, `/fixtures?${range}&cursor=not-a-cursor`)).json.error.code).toBe("invalid_cursor");
    expect((await get(w.mar, `/fixtures?${range}`)).json).toMatchObject({ fixtures: [], total: 0, nextCursor: null });
    expect((await get(w.referee, `/fixtures?${range}`)).json.total).toBe(0);
  });
});
