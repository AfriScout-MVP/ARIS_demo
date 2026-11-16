import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { birth } from "../../scripts/seed/birth";
import { addCountry, addOfficial, sql } from "../helpers";

const valid = (iso: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
};

describe("seeded birth dates", () => {
  it("are always real calendar dates", () => {
    for (let i = 0; i < 5000; i++) {
      const iso = birth("2026-10-15", `official-${i}-${(i * 7919).toString(36)}`, 20 + (i % 30));
      expect(valid(iso), iso).toBe(true);
    }
  });
});

describe("migration 0018 (repair of malformed birth dates)", async () => {
  await addCountry("BDR");
  const ids = ["bd-neg", "bd-neg1", "bd-zero", "bd-ok", "bd-null"];
  for (const id of ids) await addOfficial(id, "BDR");
  await sql("UPDATE officials SET birth_date = ? WHERE id = ?", "1987-08--19", "bd-neg").run();
  await sql("UPDATE officials SET birth_date = ? WHERE id = ?", "1995-05--4", "bd-neg1").run();
  await sql("UPDATE officials SET birth_date = ? WHERE id = ?", "1990-02-00", "bd-zero").run();
  await sql("UPDATE officials SET birth_date = ? WHERE id = ?", "1991-12-31", "bd-ok").run();
  await sql("UPDATE officials SET birth_date = NULL WHERE id = ?", "bd-null").run();

  const migration = (env as unknown as { TEST_MIGRATIONS: Array<{ name: string; queries: string[] }> }).TEST_MIGRATIONS.find((m) => m.name.startsWith("0018"))!;
  for (const q of migration?.queries ?? []) await env.DB.prepare(q).run();
  const read = async (id: string) => (await sql("SELECT birth_date FROM officials WHERE id = ?", id).first<{ birth_date: string | null }>())!.birth_date;

  it("ships as a migration", () => expect(migration).toBeDefined());
  it("turns a negative day into a valid one and keeps year and month", async () => {
    expect(await read("bd-neg")).toBe("1987-08-19");
    expect(await read("bd-neg1")).toBe("1995-05-04");
  });
  it("turns day 00 into day 01", async () => expect(await read("bd-zero")).toBe("1990-02-01"));
  it("leaves valid dates and nulls alone", async () => {
    expect(await read("bd-ok")).toBe("1991-12-31");
    expect(await read("bd-null")).toBeNull();
  });
});
