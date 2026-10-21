import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { ApiError, notFound, readJson, uuid } from "../lib/http";
import { auditStmt } from "../lib/audit";
import { assertCountry, countryFilter } from "../lib/access";
import { commitMedia, readUpload } from "../lib/media";
import { mediaUrl } from "../domain/mappers";
import { currentUser, requireRole, staff } from "../middleware/auth";

/**
 * National federations — exactly one per supported country. A federation seat is a user whose `federation_id`
 * points here (create seats with POST /users). Suspending a federation closes all its seats at once: the auth
 * middleware joins the federation's status on every request.
 */
export const federations = new Hono<AppEnv>();
federations.use("*", staff);

const SELECT = `SELECT f.id, f.code, f.name, f.country, c.name AS countryName, f.status, f.logo_media_id, f.agreement_reference AS agreementReference,
       (SELECT COUNT(*) FROM users u WHERE u.federation_id = f.id) AS seats, f.created_at AS createdAt
  FROM federations f JOIN countries c ON c.code = f.country`;

interface FedRow {
  id: string;
  code: string;
  name: string;
  country: string;
  countryName: string;
  status: "active" | "suspended";
  logo_media_id: string | null;
  agreementReference: string | null;
  seats: number;
  createdAt: string;
}

function present({ logo_media_id, ...r }: FedRow) {
  return { ...r, logoUrl: mediaUrl(logo_media_id) };
}

async function load(db: D1Database, id: string) {
  const row = await db.prepare(`${SELECT} WHERE f.id = ?`).bind(id).first<FedRow>();
  return row ? present(row) : null;
}

const codeSchema = z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9-]{1,19}$/, "2-20 letters, digits or dashes");

federations.get("/", async (c) => {
  const scope = countryFilter(currentUser(c), "f.country");
  const { results } = await c.env.DB.prepare(`${SELECT} WHERE ${scope.sql} ORDER BY f.code COLLATE NOCASE`).bind(...scope.params).all<FedRow>();
  return c.json({ federations: results.map(present) });
});

federations.post("/", requireRole("admin"), async (c) => {
  const actor = currentUser(c);
  const db = c.env.DB;
  const b = await readJson(
    c,
    z.object({
      code: codeSchema,
      name: z.string().trim().min(2).max(120),
      country: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
      agreementReference: z.string().trim().max(120).optional(),
    }),
  );
  const country = await db.prepare("SELECT active FROM countries WHERE code = ?").bind(b.country).first<{ active: number }>();
  if (!country) throw new ApiError(422, "unknown_country", "That country is not in the supported list");
  if (country.active !== 1) throw new ApiError(422, "country_inactive", "That country is switched off; reactivate it first");
  const clash = await db.prepare("SELECT country FROM federations WHERE country = ? OR code = ?").bind(b.country, b.code).first<{ country: string }>();
  if (clash) {
    throw clash.country === b.country
      ? new ApiError(409, "federation_exists", "This country already has a federation")
      : new ApiError(409, "federation_code_taken", "A federation with this code already exists");
  }
  const id = uuid();
  try {
    await db.batch([
      db.prepare("INSERT INTO federations (id, code, name, country, agreement_reference) VALUES (?, ?, ?, ?, ?)").bind(id, b.code, b.name, b.country, b.agreementReference ?? null),
      auditStmt(db, actor, { action: "federation.create", entity: "federation", entityId: id, after: b, countryCode: b.country, ip: c.get("ip") }),
    ]);
  } catch (err) {
    if (String(err).includes("federations.country")) throw new ApiError(409, "federation_exists", "This country already has a federation");
    if (String(err).includes("federations.code")) throw new ApiError(409, "federation_code_taken", "A federation with this code already exists");
    throw err;
  }
  return c.json({ federation: await load(db, id) }, 201);
});

federations.patch("/:id", requireRole("admin"), async (c) => {
  const actor = currentUser(c);
  const db = c.env.DB;
  const id = c.req.param("id");
  const b = await readJson(
    c,
    z
      .object({
        name: z.string().trim().min(2).max(120),
        code: codeSchema,
        status: z.enum(["active", "suspended"]),
        agreementReference: z.string().trim().max(120).nullable(),
      })
      .partial()
      .refine((x) => Object.keys(x).length > 0, "Nothing to change"),
  );
  const before = await db.prepare("SELECT id, code, name, country, status, agreement_reference FROM federations WHERE id = ?").bind(id).first<{
    id: string; code: string; name: string; country: string; status: string; agreement_reference: string | null;
  }>();
  if (!before) throw notFound("Federation");

  const sets: string[] = [];
  const args: (string | null)[] = [];
  if (b.name !== undefined) (sets.push("name = ?"), args.push(b.name));
  if (b.code !== undefined) (sets.push("code = ?"), args.push(b.code));
  if (b.status !== undefined) (sets.push("status = ?"), args.push(b.status));
  if (b.agreementReference !== undefined) (sets.push("agreement_reference = ?"), args.push(b.agreementReference));
  const action = b.status && b.status !== before.status ? (b.status === "suspended" ? "federation.suspend" : "federation.reactivate") : "federation.update";
  try {
    await db.batch([
      db.prepare(`UPDATE federations SET ${sets.join(", ")} WHERE id = ?`).bind(...args, id),
      auditStmt(db, actor, { action, entity: "federation", entityId: id, before: { code: before.code, name: before.name, status: before.status }, after: b, countryCode: before.country, ip: c.get("ip") }),
    ]);
  } catch (err) {
    if (String(err).includes("federations.code")) throw new ApiError(409, "federation_code_taken", "A federation with this code already exists");
    throw err;
  }
  return c.json({ federation: await load(db, id) });
});

federations.put("/:id/logo", requireRole("admin"), async (c) => {
  const actor = currentUser(c);
  const db = c.env.DB;
  const id = c.req.param("id");
  const fed = await db.prepare("SELECT id, country, logo_media_id FROM federations WHERE id = ?").bind(id).first<{ id: string; country: string; logo_media_id: string | null }>();
  if (!fed) throw notFound("Federation");
  assertCountry(actor, fed.country, "Federation");
  const { upload } = await readUpload(c, { imageOnly: true });
  await commitMedia(c.env, {
    upload,
    user: actor,
    ip: c.get("ip"),
    kind: "logo",
    visibility: "public",
    ownerType: "federation",
    ownerId: id,
    replaces: [fed.logo_media_id],
    then: (mediaId) => [db.prepare("UPDATE federations SET logo_media_id = ? WHERE id = ?").bind(mediaId, id)],
    audit: { action: "federation.logo", entity: "federation", entityId: id, countryCode: fed.country },
  });
  return c.json({ federation: await load(db, id) });
});
