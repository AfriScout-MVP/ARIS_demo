// The one place that stores, serves and deletes files.
//
// Every object in R2 has exactly one `media_assets` row (migrations/0002). Rules enforced here, for every caller:
//   * the type comes from the file's leading bytes, never from the client — PDF, PNG, JPEG and WebP only;
//     SVG (which can carry script) is never accepted from a user
//   * at most 8 MB, hashed with SHA-256, and stored under a key the server generates (`<kind>/<ownerId>/<uuid>.<ext>`)
//   * the R2 object and its row stay in step: a failed batch removes the object, a delete removes both,
//     and replacing a flag / logo / photo removes the previous asset

import type { AuthUser, Env } from "../env";
import { ApiError, notFound, uuid, type Ctx } from "./http";
import { auditStmt } from "./audit";
import { inCountry } from "./access";

export const MAX_BYTES = 8 * 1024 * 1024;

export type MediaKind = "flag" | "crest" | "logo" | "photo" | "document" | "receipt" | "stadium" | "other";
export type OwnerType = "country" | "federation" | "team" | "stadium" | "official" | "payment";

export interface Detected {
  type: "application/pdf" | "image/png" | "image/jpeg" | "image/webp";
  ext: "pdf" | "png" | "jpg" | "webp";
}

/** Identify a file by its magic bytes. Anything else — SVG, HTML, executables, archives — is refused. */
export function sniff(bytes: Uint8Array): Detected | null {
  const at = (offset: number, ...sig: number[]) => sig.every((b, i) => bytes[offset + i] === b);
  if (at(0, 0x25, 0x50, 0x44, 0x46, 0x2d)) return { type: "application/pdf", ext: "pdf" }; // %PDF-
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { type: "image/png", ext: "png" };
  if (at(0, 0xff, 0xd8, 0xff)) return { type: "image/jpeg", ext: "jpg" };
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return { type: "image/webp", ext: "webp" }; // RIFF....WEBP
  return null;
}

export interface Upload extends Detected {
  bytes: Uint8Array;
  filename: string;
  sha256: string;
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

/** Reads and validates the multipart field `file` (plus any other text fields, returned as `fields`). */
export async function readUpload(c: Ctx, opts: { imageOnly?: boolean } = {}): Promise<{ upload: Upload; fields: Record<string, string> }> {
  const declared = Number(c.req.header("content-length") ?? 0);
  if (declared > MAX_BYTES + 256 * 1024) throw new ApiError(413, "too_large", "Files are limited to 8 MB");

  let form: Record<string, unknown>;
  try {
    form = await c.req.parseBody();
  } catch {
    throw new ApiError(422, "file_required", "Send the file in a multipart field named 'file'");
  }
  const file = form.file;
  if (!(file instanceof File)) throw new ApiError(422, "file_required", "Send the file in a multipart field named 'file'");
  if (file.size === 0) throw new ApiError(422, "empty_file", "The file is empty");
  if (file.size > MAX_BYTES) throw new ApiError(413, "too_large", "Files are limited to 8 MB");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const detected = sniff(bytes);
  if (!detected) throw new ApiError(415, "unsupported_type", "Only PDF, PNG, JPEG and WebP files are accepted");
  if (opts.imageOnly && !detected.type.startsWith("image/")) throw new ApiError(415, "unsupported_type", "Only PNG, JPEG and WebP images are accepted here");

  const filename = file.name.replace(/[^\w.\- ()]/g, "_").slice(0, 120) || `file.${detected.ext}`;
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(form)) if (typeof v === "string") fields[k] = v;
  return { upload: { ...detected, bytes, filename, sha256: hex(await crypto.subtle.digest("SHA-256", bytes)) }, fields };
}

export interface StoreSpec {
  kind: MediaKind;
  visibility: "public" | "private";
  ownerType: OwnerType;
  ownerId: string;
}

export interface CommitOptions extends StoreSpec {
  upload: Upload;
  user: AuthUser;
  ip?: string;
  /** The audit row that describes the operation (written in the same batch). */
  audit: { action: string; entity: string; entityId: string; countryCode?: string | null; after?: unknown };
  /** Statements that need the new asset's id (the owner row pointing at it, a `documents` row …). Run after the media row exists. */
  then: (mediaId: string) => D1PreparedStatement[];
  /** Assets this upload replaces: their rows go in the same batch, their objects once it has committed. */
  replaces?: Array<string | null | undefined>;
}

const safeSegment = (s: string) => s.replace(/[^\w-]/g, "_").slice(0, 80);

/** Statements that delete assets: the `documents` rows that point at them, then the registry rows. */
export function removeMediaStmts(db: D1Database, ids: string[]): D1PreparedStatement[] {
  return ids.flatMap((id) => [db.prepare("DELETE FROM documents WHERE media_id = ?").bind(id), db.prepare("DELETE FROM media_assets WHERE id = ?").bind(id)]);
}

async function keysOf(db: D1Database, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await Promise.all(ids.map((id) => db.prepare("SELECT r2_key FROM media_assets WHERE id = ?").bind(id).first<{ r2_key: string }>()));
  return rows.flatMap((r) => (r ? [r.r2_key] : []));
}

/** Removes objects from the bucket once their rows are gone. Failures leave an orphan, which is harmless, never a dangling row. */
async function purge(env: Env, keys: string[]) {
  await Promise.all(
    keys.map(async (k) => {
      try {
        await env.MEDIA.delete(k);
      } catch (err) {
        console.error("could not remove media object", k, err);
      }
    }),
  );
}

/**
 * Store one file: R2 put, then ONE batch holding the registry row, the caller's statements, the removal of the
 * replaced assets and the audit entry. If the batch fails the new object is removed again.
 */
export async function commitMedia(env: Env, o: CommitOptions): Promise<{ id: string; key: string }> {
  if (!env.MEDIA) throw new ApiError(503, "storage_unavailable", "Media storage is not configured");
  const db = env.DB;
  const id = uuid();
  const key = `${o.kind}/${safeSegment(o.ownerId)}/${uuid()}.${o.upload.ext}`;
  const oldIds = [...new Set((o.replaces ?? []).filter((x): x is string => !!x))];
  const oldKeys = await keysOf(db, oldIds);

  await env.MEDIA.put(key, o.upload.bytes, {
    httpMetadata: { contentType: o.upload.type },
    customMetadata: { mediaId: id, ownerType: o.ownerType, ownerId: o.ownerId, uploadedBy: o.user.id },
  });
  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO media_assets (id, kind, visibility, r2_key, filename, content_type, size, sha256, owner_type, owner_id, uploaded_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(id, o.kind, o.visibility, key, o.upload.filename, o.upload.type, o.upload.bytes.length, o.upload.sha256, o.ownerType, o.ownerId, o.user.id),
      ...o.then(id),
      ...removeMediaStmts(db, oldIds),
      auditStmt(db, o.user, { ...o.audit, after: { ...(o.audit.after as object | undefined), mediaId: id, filename: o.upload.filename, size: o.upload.bytes.length }, ip: o.ip }),
    ]);
  } catch (err) {
    await purge(env, [key]); // never leave an orphan in the bucket
    throw err;
  }
  await purge(env, oldKeys);
  return { id, key };
}

/** Delete a file: the extra statements (and the audit entry) and the registry row in one batch, then the object. */
export async function deleteMedia(env: Env, ids: string[], extra: D1PreparedStatement[]) {
  const keys = await keysOf(env.DB, ids);
  await env.DB.batch([...extra, ...removeMediaStmts(env.DB, ids)]);
  await purge(env, keys);
}

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

export interface AssetRow {
  id: string;
  kind: MediaKind;
  visibility: "public" | "private";
  r2_key: string;
  filename: string;
  content_type: string;
  size: number;
  sha256: string;
  owner_type: OwnerType | null;
  owner_id: string | null;
}

export const ASSET_SQL = "SELECT id, kind, visibility, r2_key, filename, content_type, size, sha256, owner_type, owner_id FROM media_assets WHERE id = ?";

/**
 * May this signed-in user read a private asset? Access follows the owner:
 *   official            the referee it belongs to, a federation seat of that official's country, an admin
 *   payment             the referee paid, a federation seat of the country paying it (the fixture's), an admin
 *   country / federation / team / stadium  staff of that country (an admin: any)
 *   no owner            admins only
 * An owner that cannot be resolved (deleted, unknown) answers "no" for everyone.
 */
export async function canReadAsset(db: D1Database, user: AuthUser, a: AssetRow): Promise<boolean> {
  if (!a.owner_type || !a.owner_id) return user.role === "admin";

  let country: string | null = null;
  let officialId: string | null = null;
  switch (a.owner_type) {
    case "official": {
      const r = await db.prepare("SELECT id, country_code FROM officials WHERE id = ?").bind(a.owner_id).first<{ id: string; country_code: string }>();
      if (!r) return false;
      officialId = r.id;
      country = r.country_code;
      break;
    }
    case "payment": {
      const r = await db
        // a receipt sits with the payment: the paying (host) country's staff, or the official paid
        .prepare("SELECT p.official_id AS id, f.country_code FROM payments p JOIN fixtures f ON f.id = p.fixture_id WHERE p.id = ?")
        .bind(a.owner_id)
        .first<{ id: string; country_code: string }>();
      if (!r) return false;
      officialId = r.id;
      country = r.country_code;
      break;
    }
    case "country": {
      const r = await db.prepare("SELECT code FROM countries WHERE code = ?").bind(a.owner_id).first<{ code: string }>();
      country = r?.code ?? null;
      break;
    }
    case "federation": {
      const r = await db.prepare("SELECT country FROM federations WHERE id = ?").bind(a.owner_id).first<{ country: string }>();
      country = r?.country ?? null;
      break;
    }
    case "team": {
      const r = await db.prepare("SELECT country FROM teams WHERE id = ?").bind(a.owner_id).first<{ country: string }>();
      country = r?.country ?? null;
      break;
    }
    case "stadium": {
      const r = await db.prepare("SELECT country FROM stadiums WHERE id = ?").bind(a.owner_id).first<{ country: string }>();
      country = r?.country ?? null;
      break;
    }
  }
  if (!country) return false;
  if (user.role === "referee") return !!officialId && user.officialId === officialId;
  return inCountry(user, country);
}

function etagMatches(header: string | null, etag: string) {
  if (!header) return false;
  if (header.trim() === "*") return true;
  return header.split(",").some((t) => t.trim().replace(/^W\//, "") === etag);
}

/**
 * Stream an asset with the headers every file leaves with: sniffing off, a sandboxing CSP (a file opened on its own
 * can run nothing), inline for images and attachment for PDFs, an ETag from the content hash and 304 support.
 * Public files are cacheable by anyone; private ones are revalidated on every use.
 */
export async function serveAsset(env: Env, req: Request, a: AssetRow, opts: { disposition?: "inline" | "attachment" } = {}): Promise<Response> {
  const etag = `"${a.sha256}"`;
  const disposition = opts.disposition ?? (a.content_type === "application/pdf" ? "attachment" : "inline");
  const headers = new Headers({
    "content-type": a.content_type,
    "content-disposition": `${disposition}; filename="${a.filename.replace(/["\\\r\n]/g, "_")}"`,
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'; sandbox",
    etag,
    "cache-control": a.visibility === "public" ? "public, max-age=86400" : "private, no-cache",
  });
  if (a.visibility === "private") headers.set("cross-origin-resource-policy", "same-origin");

  if (etagMatches(req.headers.get("if-none-match"), etag)) return new Response(null, { status: 304, headers });

  const obj = await env.MEDIA.get(a.r2_key);
  if (!obj) throw notFound("File"); // the row exists but the object is gone
  headers.set("content-length", String(obj.size));
  return new Response(obj.body, { status: 200, headers });
}
