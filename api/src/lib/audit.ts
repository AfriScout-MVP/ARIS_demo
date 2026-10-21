import type { AuthUser } from "../env";

/**
 * A prepared INSERT for the audit log. Callers add it to the same `db.batch()`
 * as the change it describes, so the change and its record commit together or
 * not at all.
 */
export function auditStmt(
  db: D1Database,
  actor: Pick<AuthUser, "id" | "role"> | null,
  entry: {
    action: string;
    entity: string;
    entityId?: string | null;
    before?: unknown;
    after?: unknown;
    reason?: string | null;
    /** The country the change concerns, so a federation can read the trail of its own country. */
    countryCode?: string | null;
    ip?: string;
  },
) {
  return db
    .prepare(
      "INSERT INTO audit_log (actor_user_id, actor_role, action, entity, entity_id, country_code, before, after, reason, ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      actor?.id ?? null,
      actor?.role ?? null,
      entry.action,
      entry.entity,
      entry.entityId ?? null,
      entry.countryCode ?? null,
      entry.before === undefined ? null : JSON.stringify(entry.before),
      entry.after === undefined ? null : JSON.stringify(entry.after),
      entry.reason ?? null,
      entry.ip ?? null,
    );
}
