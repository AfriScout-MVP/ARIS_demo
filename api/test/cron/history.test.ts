import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { recordPerformanceHistory, runDaily } from "../../src/cron";
import { addCountry, addOfficial, sql } from "../helpers";

const month = new Date().toISOString().slice(0, 7);

beforeAll(async () => {
  await addCountry("EGY");
  await addCountry("MAR");
  await addCountry("GHA", { active: false });
  const rate = (id: string, country: string, arps: number, extra = "") =>
    addOfficial(id, country).then(() => sql(`UPDATE officials SET arps = ? ${extra} WHERE id = ?`, arps, id).run());
  await rate("h-egy-1", "EGY", 8);
  await rate("h-egy-2", "EGY", 7);
  await rate("h-mar-1", "MAR", 6);
  await rate("h-gha-1", "GHA", 9);
  await rate("h-unrated", "EGY", 0);
  await addOfficial("h-assistant", "EGY", { kind: "assistant" });
  await sql("UPDATE officials SET arps = 3 WHERE id = 'h-assistant'").run();
});

const rows = async () =>
  (await sql("SELECT country_code, avg_arps, officials FROM performance_history WHERE month = ? ORDER BY country_code", month).all<{ country_code: string; avg_arps: number; officials: number }>()).results;

describe("performance history written by the daily job", () => {
  it("records this month's average ARPS for the continent and for every active country", async () => {
    const summary = await runDaily(env);
    expect(summary.history).toBeGreaterThan(0);
    expect(await rows()).toEqual([
      { country_code: "", avg_arps: 7.5, officials: 4 }, // 8, 7, 6, 9 — rated referees only (no assistants, no unrated)
      { country_code: "EGY", avg_arps: 7.5, officials: 2 },
      { country_code: "MAR", avg_arps: 6, officials: 1 },
    ]); // GHA is inactive: no row of its own
  });

  it("replaces the month's rows when run again, instead of adding", async () => {
    await sql("UPDATE officials SET arps = 10 WHERE id = 'h-egy-1'").run();
    await runDaily(env);
    const r = await rows();
    expect(r).toHaveLength(3);
    expect(r.find((x) => x.country_code === "EGY")).toEqual({ country_code: "EGY", avg_arps: 8.5, officials: 2 });
  });

  it("writes nothing for a month with no rated referees", async () => {
    await sql("UPDATE officials SET arps = 0").run();
    await sql("DELETE FROM performance_history").run();
    expect(await recordPerformanceHistory(env.DB, month)).toBe(0);
    expect(await rows()).toEqual([]);
  });

  it("feeds the snapshot trend", async () => {
    await sql("UPDATE officials SET arps = 8 WHERE id = 'h-egy-1'").run();
    await recordPerformanceHistory(env.DB, month);
    const { addFederationSeat, login, api } = await import("../helpers");
    const seat = await login((await addFederationSeat("EGY")).email);
    const res = await api("GET", "/api/v1/snapshot", { session: seat });
    expect(res.json.analytics.arpsTrend.at(-1)).toEqual({ month, score: 8 });
  });
});
