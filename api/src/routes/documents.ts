import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { ApiError, notFound, readJson } from "../lib/http";
import { auditStmt } from "../lib/audit";
import { canActFor, isStaff } from "../lib/access";
import { currentUser, staff } from "../middleware/auth";

export const documents = new Hono<AppEnv>();

interface DocRow {
  id: string;
  official_id: string;
  kind: string;
  r2_key: string;
  filename: string;
  content_type: string;
  status: string;
}

documents.get("/:id", async (c) => {
  const user = currentUser(c);
  const doc = await c.env.DB.prepare("SELECT id, official_id, kind, r2_key, filename, content_type, status FROM documents WHERE id = ?").bind(c.req.param("id")).first<DocRow>();
  // Same answer whether it does not exist or is not yours — do not confirm which ids are real.
  if (!doc || !canActFor(user, doc.official_id)) throw notFound("Document");
  const obj = await c.env.MEDIA.get(doc.r2_key);
  if (!obj) throw notFound("Document");
  return new Response(obj.body, {
    headers: {
      "content-type": doc.content_type,
      "content-disposition": `attachment; filename="${doc.filename.replace(/"/g, "")}"`,
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
    },
  });
});

documents.patch("/:id/status", staff, async (c) => {
  const user = currentUser(c);
  const { status } = await readJson(c, z.object({ status: z.enum(["verified", "rejected", "pending"]) }));
  const id = c.req.param("id");
  const res = await c.env.DB.batch([
    c.env.DB.prepare("UPDATE documents SET status = ? WHERE id = ?").bind(status, id),
    auditStmt(c.env.DB, user, { action: `document.${status}`, entity: "document", entityId: id, ip: c.get("ip") }),
  ]);
  if (res[0].meta.changes === 0) throw notFound("Document");
  return c.json({ ok: true, status });
});

documents.delete("/:id", async (c) => {
  const user = currentUser(c);
  const id = c.req.param("id");
  const doc = await c.env.DB.prepare("SELECT id, official_id, kind, r2_key, filename, content_type, status FROM documents WHERE id = ?").bind(id).first<DocRow>();
  if (!doc || !canActFor(user, doc.official_id)) throw notFound("Document");
  // An official may withdraw a file they uploaded only until the commission has looked at it.
  if (!isStaff(user) && doc.status !== "pending") throw new ApiError(403, "forbidden", "A reviewed document can only be removed by the commission");
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM documents WHERE id = ?").bind(id),
    c.env.DB.prepare("UPDATE officials SET photo_key = NULL WHERE id = ? AND photo_key = ?").bind(doc.official_id, doc.r2_key),
    auditStmt(c.env.DB, user, { action: "document.delete", entity: "official", entityId: doc.official_id, before: { documentId: id, filename: doc.filename }, ip: c.get("ip") }),
  ]);
  await c.env.MEDIA.delete(doc.r2_key);
  return c.json({ ok: true });
});
