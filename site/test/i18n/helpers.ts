import { dictionaries, type Dict, type Locale } from "@/locales";

/** Every dotted leaf key of a dictionary tree, with its string value. */
export function flatten(tree: unknown, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  if (tree && typeof tree === "object") {
    for (const [k, v] of Object.entries(tree)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (typeof v === "string") out[key] = v;
      else Object.assign(out, flatten(v, key));
    }
  }
  return out;
}

/** The `{name}` placeholders in a string, sorted and de-duplicated. */
export function placeholders(text: string): string[] {
  return [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();
}

export function flat(locale: Locale): Record<string, string> {
  return flatten(dictionaries[locale] as Dict);
}
