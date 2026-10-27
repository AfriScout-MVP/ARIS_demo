import { Hono } from "hono";
import type { AppEnv } from "../env";
import { ApiError, notFound } from "../lib/http";
import { auditStmt } from "../lib/audit";
import { deleteMedia } from "../lib/media";
import { currentUser, requireRole } from "../middleware/auth";

/**
 * Permanently deleting an official — for a file created by mistake (a duplicate, a typo in the country). Admin only.
 * Officials retire; they are not deleted: anyone who has ever been designated, paid, assessed, reported or given an
 * account is part of the record, and the answer is 409 `in_use` with what still refers to them (retire them instead).
 * What belongs only to the file (documents and photo in R2, licences, availability, conflicts, enrolments) goes with it.
 */
export const officialRemoval = new Hono<AppEnv>();

officialRemoval.delete("/:id", requireRole("admin"), async (c) => {
  const user = currentUser(c);
  const db = c.env.DB;
  const id = c.req.param("id");
  const row = await db.prepare("SELECT id, name, kind, country_code AS countryCode, status FROM officials WHERE id = ?").bind(id).first<{ id: string; name: string; kind: string; countryCode: string; status: string }>();
  if (!row) throw notFound("Official");
  const use = (await db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM designations WHERE official_id = ?1) AS designations,
              (SELECT COUNT(*) FROM designation_history WHERE from_official_id = ?1 OR to_official_id = ?1) AS designationHistory,
              (SELECT COUNT(*) FROM matches WHERE referee_id = ?1) AS matches,
              (SELECT COUNT(*) FROM assessments WHERE referee_id = ?1 OR observer_id = ?1) AS assessments,
              (SELECT COUNT(*) FROM payments WHERE official_id = ?1) AS payments,
              (SELECT COUNT(*) FROM advances WHERE official_id = ?1) AS advances,
              (SELECT COUNT(*) FROM incidents WHERE official_id = ?1) AS incidents,
              (SELECT COUNT(*) FROM disciplinary_cases WHERE official_id = ?1) AS cases,
              (SELECT COUNT(*) FROM users WHERE official_id = ?1) AS accounts`,
    )
    .bind(id)
    .first<Record<string, number>>())!;
  const refs = Object.fromEntries(Object.entries(use).filter(([, n]) => n > 0));
  if (Object.keys(refs).length) throw new ApiError(409, "in_use", "This official is part of the record; retire them instead", refs);

  const { results: media } = await db.prepare("SELECT id FROM media_assets WHERE owner_type = 'official' AND owner_id = ?").bind(id).all<{ id: string }>();
  // one batch: the file (its own rows cascade with it), its files' registry rows and the audit entry; then the R2 objects
  await deleteMedia(c.env, media.map((m) => m.id), [
    db.prepare("DELETE FROM officials WHERE id = ?").bind(id),
    auditStmt(db, user, { action: "official.delete", entity: "official", entityId: id, before: row, countryCode: row.countryCode, ip: c.get("ip") }),
  ]);
  return c.json({ ok: true });

});
