// A tiny SQL writer for the seed: values are escaped here and nowhere else.

export type Cell = string | number | boolean | null | undefined;

export const q = (v: Cell): string => {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "boolean") return v ? "1" : "0";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  return `'${v.replace(/'/g, "''")}'`;
};

export const jsonCell = (v: unknown) => JSON.stringify(v);

export class SqlWriter {
  private lines: string[] = [];
  private counts = new Map<string, number>();

  comment(text: string) {
    this.lines.push(`-- ${text}`);
  }

  /** One INSERT per row: D1 limits the size of a single statement. */
  insert(table: string, cols: string[], rows: Cell[][]) {
    for (const row of rows) {
      if (row.length !== cols.length) throw new Error(`${table}: ${row.length} values for ${cols.length} columns`);
      this.lines.push(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${row.map(q).join(", ")});`);
    }
    this.counts.set(table, (this.counts.get(table) ?? 0) + rows.length);
  }

  /** A statement that is not a plain INSERT (kept for the few state fix-ups the dataset needs). */
  raw(statement: string) {
    this.lines.push(statement.endsWith(";") ? statement : `${statement};`);
  }

  summary() {
    return [...this.counts.entries()].map(([t, n]) => `${t}: ${n}`).join(", ");
  }

  toString() {
    return this.lines.join("\n") + "\n";
  }
}

/**
 * The seed is written in sections (media, geography, officials …) that are produced in whatever order is
 * convenient and rendered in foreign-key order.
 */
export class SqlScript {
  private sections = new Map<string, SqlWriter>();

  section(name: string) {
    let w = this.sections.get(name);
    if (!w) {
      w = new SqlWriter();
      this.sections.set(name, w);
    }
    return w;
  }

  render(order: string[]) {
    const missing = [...this.sections.keys()].filter((k) => !order.includes(k));
    if (missing.length) throw new Error(`Sections not in the render order: ${missing.join(", ")}`);
    return order.map((n) => this.sections.get(n)?.toString() ?? "").join("\n");
  }

  summary() {
    return [...this.sections.values()].map((w) => w.summary()).filter(Boolean).join("\n  ");
  }
}
