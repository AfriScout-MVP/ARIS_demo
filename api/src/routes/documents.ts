import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../env";
import { ApiError, notFound, readJson } from "../lib/http";
import { auditStmt } from "../lib/audit";
import { isStaff, officialAccess } from "../lib/access";
import { deleteMedia, serveAsset, type AssetRow } from "../lib/media";
import { notifyOfficialStmts } from "../lib/notify";
import { currentUser, staff } from "../middleware/auth";

/** Documents of an official's file. The bytes are in R2 (registry: media_assets); this row says what the file is for. */
export const documents = new Hono<AppEnv>();

interface DocRow extends AssetRow {
  doc_id: string;
  official_id: string;
  doc_kind: string;
  status: string;
}

const DOC_SQL = `SELECT d.id AS doc_id, d.official_id, d.kind AS doc_kind, d.status, m.id, m.kind, m.visibility, m.r2_key, m.filename,
       m.content_type, m.size, m.sha256, m.owner_type, m.owner_id
  FROM documents d JOIN media_assets m ON m.id = d.media_id WHERE d.id = ?`;

/** Same answer whether the document does not exist or is not the caller's — ids are not confirmed. */
async function loadVisible(c: { env: AppEnv["Bindings"] }, user: ReturnType<typeof currentUser>, id: string) {
  const doc = await c.env.DB.prepare(DOC_SQL).bind(id).first<DocRow>();
  if (!doc) throw notFound("Document");
  const access = await officialAccess(c.env.DB, user, doc.official_id);
  if (!access.canRead) throw notFound("Document");
  return { doc, access };
}

documents.get("/:id", async (c) => {
  const { doc } = await loadVisible(c, currentUser(c), c.req.param("id"));
  return serveAsset(c.env, c.req.raw, doc, { disposition: "attachment" });
});

documents.patch("/:id/status", staff, async (c) => {
  const user = currentUser(c);
  const { status } = await readJson(c, z.object({ status: z.enum(["verified", "rejected", "pending"]) }));
  const { doc, access } = await loadVisible(c, user, c.req.param("id"));
  const db = c.env.DB;
  const notice =
    status === "pending"
      ? []
      : await notifyOfficialStmts(db, doc.official_id, {
          title: status === "verified" ? { fr: "Document validé", en: "Document verified" } : { fr: "Document refusé", en: "Document rejected" },
          detail: { fr: `Votre document « ${doc.filename} » a été ${status === "verified" ? "validé" : "refusé"}.`, en: `Your document "${doc.filename}" was ${status}.` },
          tone: status === "verified" ? "pitch" : "amber",
          href: "/me",
        });
  await db.batch([
    db.prepare("UPDATE documents SET status = ? WHERE id = ?").bind(status, doc.doc_id),
    auditStmt(db, user, { action: `document.${status}`, entity: "official", entityId: doc.official_id, after: { documentId: doc.doc_id }, countryCode: access.countryCode, ip: c.get("ip") }),
    ...notice,
  ]);
  return c.json({ ok: true, status });
});

documents.delete("/:id", async (c) => {
  const user = currentUser(c);
  const { doc, access } = await loadVisible(c, user, c.req.param("id"));
  // An official may withdraw a file they uploaded only until the federation has looked at it.
  if (!isStaff(user) && doc.status !== "pending") throw new ApiError(403, "forbidden", "A reviewed document can only be removed by the federation");
  await deleteMedia(c.env, [doc.id], [
    auditStmt(c.env.DB, user, { action: "document.delete", entity: "official", entityId: doc.official_id, before: { documentId: doc.doc_id, filename: doc.filename }, countryCode: access.countryCode, ip: c.get("ip") }),
  ]);
  return c.json({ ok: true });
});
