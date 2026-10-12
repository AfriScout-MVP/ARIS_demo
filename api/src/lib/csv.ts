/**
 * Rows → CSV. Cells that start with = + - @ (or a tab / CR) are prefixed with a
 * quote so a spreadsheet will not run them as formulas ("CSV injection" — a name
 * typed into the register must not become a command in the federation's Excel).
 */
export function toCsv(rows: Array<Record<string, unknown>>, columns?: string[]) {
  const cols = columns ?? (rows[0] ? Object.keys(rows[0]) : []);
  const cell = (v: unknown) => {
    let s = v === null || v === undefined ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n") + "\r\n";
}

export function csvResponse(filename: string, rows: Array<Record<string, unknown>>, columns?: string[]) {
  return new Response("﻿" + toCsv(rows, columns), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
