import { describe, expect, it } from "vitest";
import type { Criterion } from "@/lib/store/types";
import { evenWeights, gridChanged, gridRowsFrom, gridTotal, hasGridErrors, keyFrom, removedCriteria, toGrid, validateGrid, type GridRow } from "@/lib/assessments/grid";

const GRID: Criterion[] = [
  { key: "positioning", label: { fr: "Placement", en: "Positioning" }, weight: 40 },
  { key: "decisions", label: { fr: "Décisions", en: "Decisions", es: "Decisiones" }, weight: 60 },
];
const row = (over: Partial<GridRow> = {}): GridRow => ({ key: "", fr: "Gestion", en: "Management", es: "", de: "", weight: "10", ...over });

describe("grid rows", () => {
  it("round-trips the saved grid without change", () => {
    const rows = gridRowsFrom(GRID);
    expect(rows[1]).toEqual({ key: "decisions", fr: "Décisions", en: "Decisions", es: "Decisiones", de: "", weight: "60" });
    expect(gridChanged(GRID, rows)).toBe(false);
    expect(toGrid(rows)).toEqual(GRID);
    expect(gridChanged(GRID, [rows[1], rows[0]])).toBe(true);
  });

  it("totals only the weights that read as whole numbers", () => {
    expect(gridTotal([row({ weight: "30" }), row({ weight: " 20 " }), row({ weight: "x" }), row({ weight: "2.5" })])).toBe(50);
  });
});

describe("validateGrid", () => {
  it("accepts 2 to 12 criteria totalling 100", () => {
    expect(hasGridErrors(validateGrid(gridRowsFrom(GRID)))).toBe(false);
  });
  it("names the problem on each row and on the grid", () => {
    const e = validateGrid([row({ fr: " ", weight: "0" }), row({ en: "", de: "x".repeat(81), weight: "101" })]);
    expect(e.rows[0]).toEqual({ fr: "assessments.grid.errors.label", weight: "assessments.grid.errors.weight" });
    expect(e.rows[1]).toEqual({ en: "assessments.grid.errors.label", de: "assessments.grid.errors.labelLong", weight: "assessments.grid.errors.weight" });
    expect(validateGrid([row({ weight: "50" }), row({ weight: "49" })]).grid).toBe("assessments.grid.errors.total");
    expect(validateGrid([row({ weight: "100" })]).grid).toBe("assessments.grid.errors.size");
    expect(validateGrid(Array.from({ length: 13 }, () => row({ weight: "8" }))).grid).toBe("assessments.grid.errors.size");
  });
});

describe("keys", () => {
  it("derives a Worker-valid camelCase key from the label", () => {
    expect(keyFrom("Gestion du match", [])).toBe("gestionDuMatch");
    expect(keyFrom("Contrôle émotionnel", [])).toBe("controleEmotionnel");
    expect(keyFrom("4 x 4", [])).toBe("c4X4");
    expect(keyFrom("!", [])).toBe("criterion");
    expect(keyFrom("Fitness", ["fitness", "fitness2"])).toBe("fitness3");
    expect(keyFrom("a".repeat(60), [])).toMatch(/^[a-zA-Z][a-zA-Z0-9]{1,30}$/);
  });
  it("keeps existing keys and gives new rows unique ones", () => {
    const out = toGrid([...gridRowsFrom(GRID), row({ en: "Decisions", fr: "Décisions bis", weight: "5" }), row({ en: "Decisions", weight: "5" })]);
    expect(out.map((c) => c.key)).toEqual(["positioning", "decisions", "decisions2", "decisions3"]);
    for (const c of out) expect(c.key).toMatch(/^[a-zA-Z][a-zA-Z0-9]{1,30}$/);
  });
  it("sends optional languages only when filled", () => {
    expect(toGrid([row({ es: "  ", de: "Leitung " })])[0].label).toEqual({ fr: "Gestion", en: "Management", de: "Leitung" });
  });
});

describe("removedCriteria / evenWeights", () => {
  it("lists what the new grid drops", () => {
    expect(removedCriteria(GRID, [gridRowsFrom(GRID)[1]]).map((c) => c.key)).toEqual(["positioning"]);
  });
  it("spreads 100 in whole numbers", () => {
    const w = evenWeights([row(), row(), row()]).map((r) => r.weight);
    expect(w).toEqual(["34", "33", "33"]);
    expect(gridTotal(evenWeights(Array.from({ length: 7 }, () => row())))).toBe(100);
    expect(evenWeights([])).toEqual([]);
  });
});
