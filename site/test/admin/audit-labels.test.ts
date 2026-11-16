import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { actionLabel, auditActionKey } from "@/lib/admin/labels";
import { dictionaries, type Locale } from "@/locales";

const codes = ["fr", "en", "es", "de"] as const satisfies readonly Locale[];

const api = fileURLToPath(new URL("../../../api/src", import.meta.url));
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : e.name.endsWith(".ts") ? [`${dir}/${e.name}`] : []));

// every audit action the Worker can write: literal `action: "x.y"` plus the designation history actions
const emitted = (() => {
  const found = new Set<string>();
  for (const file of walk(api)) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/action:\s*"([a-z]+\.[a-z_]+)"/g)) found.add(m[1]);
  }
  const history = readFileSync(`${api}/domain/designations.ts`, "utf8").match(/type HistoryAction =([^;]+);/)![1];
  for (const m of history.matchAll(/"([a-z]+)"/g)) found.add(`designation.${m[1]}`);
  return [...found].sort();
})();

const labels = (locale: Locale) =>
  (dictionaries[locale].admin as { audit: { actionLabels: Record<string, string> } }).audit.actionLabels;

describe("audit action labels", () => {
  it("finds the actions the API writes", () => {
    expect(emitted.length).toBeGreaterThan(80);
    expect(emitted).toContain("auth.login");
    expect(emitted).toContain("designation.autofill");
  });

  it.each(codes)("labels every emitted action in %s", (locale) => {
    const missing = emitted.filter((a) => !labels(locale)[a.replace(/\./g, "_")]);
    expect(missing).toEqual([]);
  });

  it("never shows a label that is just the id", () => {
    for (const locale of codes) for (const [k, v] of Object.entries(labels(locale))) expect(v, `${locale}:${k}`).not.toMatch(/^[a-z]+[._][a-z_]+$/);
  });

  it("falls back to the raw id for an action it does not know", () => {
    const t = (key: string) => key;
    expect(actionLabel(t as never, "something.new")).toBe("something.new");
    expect(auditActionKey("auth.login")).toBe("admin.audit.actionLabels.auth_login");
  });
});
