// Which D1 database and R2 bucket the scripts talk to — read from wrangler.jsonc, never retyped.
// The Worker and the scripts therefore cannot disagree about the resources, and renaming a
// bucket or a database is a one-line edit in wrangler.jsonc.
//
// As a module:  import { d1DatabaseName, r2BucketName } from "./lib/resources";
// As a CLI:     eval "$(npx --no-install tsx scripts/lib/resources.ts)"   → DB_NAME=… BUCKET=…

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CONFIG = path.resolve(fileURLToPath(new URL("../../wrangler.jsonc", import.meta.url)));

/** JSONC to JSON: drops line and block comments outside strings, and trailing commas. */
function stripComments(text: string): string {
  let out = "";
  let inString = false;
  let inLine = false;
  let inBlock = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (inLine) {
      if (c === "\n") {
        inLine = false;
        out += c;
      }
      continue;
    }
    if (inBlock) {
      if (c === "*" && next === "/") {
        inBlock = false;
        i++;
      }
      continue;
    }
    if (inString) {
      out += c;
      if (c === "\\") out += text[++i] ?? "";
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
      continue;
    }
    if (c === "/" && next === "/") {
      inLine = true;
      i++;
      continue;
    }
    if (c === "/" && next === "*") {
      inBlock = true;
      i++;
      continue;
    }
    out += c;
  }
  return out.replace(/,(\s*[}\]])/g, "$1");
}

type WranglerConfig = {
  d1_databases?: { binding: string; database_name: string; database_id?: string }[];
  r2_buckets?: { binding: string; bucket_name: string }[];
};

let cached: WranglerConfig | undefined;
function config(): WranglerConfig {
  if (!cached) {
    try {
      cached = JSON.parse(stripComments(readFileSync(CONFIG, "utf8"))) as WranglerConfig;
    } catch (cause) {
      throw new Error(`Could not read ${CONFIG}: ${(cause as Error).message}`);
    }
  }
  return cached;
}

/** The `database_name` of the D1 binding (default `DB`). */
export function d1DatabaseName(binding = "DB"): string {
  const found = config().d1_databases?.find((d) => d.binding === binding)?.database_name;
  if (!found) throw new Error(`wrangler.jsonc has no d1_databases entry with binding "${binding}"`);
  return found;
}

/** The `bucket_name` of the R2 binding (default `MEDIA`). */
export function r2BucketName(binding = "MEDIA"): string {
  const found = config().r2_buckets?.find((b) => b.binding === binding)?.bucket_name;
  if (!found) throw new Error(`wrangler.jsonc has no r2_buckets entry with binding "${binding}"`);
  return found;
}

// Run directly (`tsx scripts/lib/resources.ts`) to print shell assignments for cf-bootstrap.sh.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  process.stdout.write(`DB_NAME=${JSON.stringify(d1DatabaseName())}\nBUCKET=${JSON.stringify(r2BucketName())}\n`);
}
