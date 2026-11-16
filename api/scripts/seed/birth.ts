// Pure helpers for the seeded birth dates (no Node imports, so the tests can load them).

export const hash = (s: string) => [...s].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0, 2166136261);

/** A real, zero-padded YYYY-MM-DD for someone `age` years old at `anchor`. */
export const birth = (anchor: string, id: string, age: number) => {
  const h = hash(id);
  const month = 1 + (h % 12);
  const day = 1 + ((h >>> 4) % 28); // unsigned shift: a signed one made the day negative for ~40% of ids
  return `${Number(anchor.slice(0, 4)) - age}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};
