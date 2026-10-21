// Images for the demo: real flags (flag-icons, MIT) and generated placeholders for crests, logos and
// official portraits. NOTHING here is a real person's photo — avatars are monograms on a coloured tile.
//
// Every asset is written to .seed/media/<r2 key> and registered in `media_assets`; scripts/seed-media.ts
// then uploads the files to the R2 bucket (local or remote) under exactly those keys.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const MEDIA_DIR = path.resolve(here, "../../.seed/media");
const FLAGS_DIR = path.resolve(here, "../../node_modules/flag-icons/flags/4x3");

export interface Asset {
  id: string;
  kind: "flag" | "crest" | "logo" | "photo";
  visibility: "public" | "private";
  key: string;
  filename: string;
  contentType: "image/svg+xml";
  size: number;
  sha256: string;
  ownerType: "country" | "federation" | "team" | "official";
  ownerId: string;
}

const hash = (s: string) => [...s].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0, 2166136261);
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);

export class MediaBook {
  readonly assets: Asset[] = [];
  private byKey = new Map<string, Asset>();

  private add(a: Omit<Asset, "id" | "size" | "sha256" | "contentType" | "filename">, svg: string): Asset {
    const existing = this.byKey.get(a.key);
    if (existing) return existing;
    const bytes = Buffer.from(svg, "utf8");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const file = path.join(MEDIA_DIR, a.key);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, bytes);
    const asset: Asset = {
      ...a,
      id: `med-${createHash("sha256").update(a.key).digest("hex").slice(0, 16)}`,
      filename: path.basename(a.key),
      contentType: "image/svg+xml",
      size: bytes.length,
      sha256,
    };
    this.assets.push(asset);
    this.byKey.set(a.key, asset);
    return asset;
  }

  flag(iso2: string, countryCode: string) {
    const svg = readFileSync(path.join(FLAGS_DIR, `${iso2.toLowerCase()}.svg`), "utf8");
    return this.add({ kind: "flag", visibility: "public", key: `flags/${iso2.toLowerCase()}.svg`, ownerType: "country", ownerId: countryCode }, svg);
  }

  /** A monogram portrait. Private: it belongs to a person. */
  portrait(officialId: string, initials: string) {
    const h = hash(officialId) % 360;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-label="${esc(initials)}"><rect width="256" height="256" fill="hsl(${h} 28% 30%)"/><circle cx="128" cy="104" r="46" fill="hsl(${h} 30% 46%)"/><path d="M36 256c4-58 44-88 92-88s88 30 92 88z" fill="hsl(${h} 30% 46%)"/><text x="128" y="148" text-anchor="middle" font-family="system-ui,sans-serif" font-size="64" font-weight="700" fill="#fff" fill-opacity=".92">${esc(initials.slice(0, 2))}</text></svg>`;
    return this.add({ kind: "photo", visibility: "private", key: `photos/${officialId}.svg`, ownerType: "official", ownerId: officialId }, svg);
  }

  /** A shield crest with the club's letters. Public. */
  crest(teamId: string, name: string) {
    const h = hash(name) % 360;
    const letters = name
      .split(/[\s-]+/)
      .filter((w) => /^[\p{L}]/u.test(w))
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 3);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 112" role="img" aria-label="${esc(name)}"><path d="M48 4 90 18v42c0 26-18 42-42 50C24 102 6 86 6 60V18z" fill="hsl(${h} 45% 34%)" stroke="hsl(${h} 45% 82%)" stroke-width="4"/><path d="M48 4 90 18v22H6V18z" fill="hsl(${(h + 40) % 360} 55% 48%)"/><text x="48" y="78" text-anchor="middle" font-family="system-ui,sans-serif" font-size="${letters.length > 2 ? 26 : 32}" font-weight="800" fill="#fff">${esc(letters)}</text></svg>`;
    return this.add({ kind: "crest", visibility: "public", key: `crests/${teamId}.svg`, ownerType: "team", ownerId: teamId }, svg);
  }

  /** A rounded tile with the federation's acronym. Public. */
  federationLogo(federationId: string, code: string) {
    const h = hash(code) % 360;
    const size = code.length > 5 ? 22 : code.length > 3 ? 28 : 36;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" role="img" aria-label="${esc(code)}"><rect width="120" height="120" rx="26" fill="hsl(${h} 40% 26%)"/><rect x="10" y="10" width="100" height="100" rx="20" fill="none" stroke="hsl(${h} 50% 70%)" stroke-width="3"/><text x="60" y="${60 + size / 3}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="${size}" font-weight="800" fill="#fff">${esc(code)}</text></svg>`;
    return this.add({ kind: "logo", visibility: "public", key: `logos/${federationId}.svg`, ownerType: "federation", ownerId: federationId }, svg);
  }

  /** Key/file pairs in the format `wrangler r2 bulk put` reads. */
  uploadList() {
    return this.assets.map((a) => ({ key: a.key, file: path.join(MEDIA_DIR, a.key) }));
  }
}
