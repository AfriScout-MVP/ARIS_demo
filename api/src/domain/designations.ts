import type { BlockerId, CrewRole, CrewSlot, SlotState } from "@core/types";
import { blockersFor } from "@core/engine";
import type { AuthUser } from "../env";
import { ApiError } from "../lib/http";
import { auditStmt } from "../lib/audit";
import { CONTINENTAL } from "../lib/access";
import { notifyStmts, type NotificationInput } from "../lib/notify";
import type { DbEngineContext, LoadedFixture } from "./engine-ctx";

/** Rules a human may waive with a written reason, versus rules nobody may waive. */
const SOFT: BlockerId[] = ["rest", "pool", "unavailable", "conflict"];

export type HistoryAction =
  | "assign"
  | "clear"
  | "confirm"
  | "accept"
  | "decline"
  | "replace"
  | "autofill"
  | "validate"
  | "publish"
  | "revert";

export interface SlotChange {
  fixture: LoadedFixture;
  role: CrewRole;
  toOfficialId: string | null;
  toState: SlotState;
  action: HistoryAction;
  reason?: string | null;
  engineReason?: unknown;
  runId?: string | null;
  actor: Pick<AuthUser, "id" | "role"> | null;
  actorKind?: "user" | "engine" | "system";
  ip?: string;
}

/**
 * Throws 409 when `officialId` cannot legally take `role`. Soft rules can be
 * overridden by staff with a reason; neutrality, qualification, duplicate and
 * double-booking can never be.
 */
export function assertEligible(
  ctx: DbEngineContext,
  fixture: LoadedFixture,
  role: CrewRole,
  officialId: string,
  opts: { override?: boolean; reason?: string | null },
) {
  const blockers = blockersFor(ctx, fixture, role, officialId, fixture.crew);
  if (blockers === null) throw new ApiError(422, "unknown_official", "That official is not on the appointing list");
  if (blockers.length === 0) return;

  const hard = blockers.filter((b) => !SOFT.includes(b));
  if (hard.length > 0) {
    throw new ApiError(409, "ineligible", "That official cannot take this role", { blockers, overridable: false });
  }
  if (!opts.override) {
    throw new ApiError(409, "ineligible", "That official breaks a designation rule", { blockers, overridable: true });
  }
  if (!opts.reason || opts.reason.trim().length < 5) {
    throw new ApiError(422, "reason_required", "Overriding a rule needs a written reason", { blockers });
  }
}

/**
 * The statements that make one change to one slot: the guarded update, its
 * history row, its audit row, and the status fall-back. They are returned, not
 * run, so a caller can put many in one `db.batch()`.
 *
 * The update only applies when the slot is still at `expectedVersion`; the
 * history and audit rows are written only if it did (they test for the bumped
 * version), so a lost race leaves no trace instead of a false record.
 */
export function slotChangeStmts(db: D1Database, change: SlotChange, current: CrewSlot & { version: number }) {
  const { fixture, role } = change;
  const newVersion = current.version + 1;
  const applied = "EXISTS (SELECT 1 FROM designations WHERE fixture_id = ? AND role = ? AND version = ?)";
  const appliedArgs = [fixture.id, role, newVersion] as const;

  return [
    db
      .prepare(
        `UPDATE designations SET official_id = ?, state = ?, version = ?, updated_by = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
          WHERE fixture_id = ? AND role = ? AND version = ?`,
      )
      .bind(change.toOfficialId, change.toState, newVersion, change.actor?.id ?? null, fixture.id, role, current.version),
    db
      .prepare(
        `INSERT INTO designation_history
           (fixture_id, role, action, from_official_id, to_official_id, from_state, to_state, actor_user_id, actor_kind, reason, engine_reason, run_id)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${applied}`,
      )
      .bind(
        fixture.id,
        role,
        change.action,
        current.officialId,
        change.toOfficialId,
        current.state,
        change.toState,
        change.actor?.id ?? null,
        change.actorKind ?? "user",
        change.reason ?? null,
        change.engineReason ? JSON.stringify(change.engineReason) : null,
        change.runId ?? null,
        ...appliedArgs,
      ),
    // downgrade a validated / published match whose crew is no longer fully confirmed
    db
      .prepare(
        `UPDATE fixtures SET designation_status = 'awaiting_confirmation', validated_by = NULL, validated_at = NULL, published_at = NULL
          WHERE id = ? AND designation_status IN ('validated', 'published')
            AND EXISTS (SELECT 1 FROM designations WHERE fixture_id = fixtures.id AND role <> 'OBS' AND state <> 'confirmed')`,
      )
      .bind(fixture.id),
    auditStmt(db, change.actor, {
      action: `designation.${change.action}`,
      entity: "fixture",
      entityId: fixture.id,
      before: { role, officialId: current.officialId, state: current.state },
      after: { role, officialId: change.toOfficialId, state: change.toState },
      reason: change.reason,
      countryCode: fixture.countryCode,
      ip: change.ip,
    }),
  ];
}

/** The slot's row, or 404 — fixtures only have the roles their shape needs. */
export function slotOf(fixture: LoadedFixture, role: CrewRole) {
  const slot = fixture.crew.find((s) => s.role === role);
  if (!slot) throw new ApiError(404, "not_found", `This fixture has no ${role} slot`);
  return slot;
}

/** The slots a competition's crew needs: always R + 2 assistants + fourth, VAR/AVAR where the competition has VAR, an observer on big ties. */
export function slotsFor(opts: { varEnabled: boolean; tier: string; importance: number }): CrewRole[] {
  const roles: CrewRole[] = ["R", "AR1", "AR2", "FOURTH"];
  if (opts.varEnabled) roles.push("VAR", "AVAR");
  if (opts.tier === "continental" || opts.tier === "cup" || opts.importance >= 70) roles.push("OBS");
  return roles;
}

/** Roles that must be filled before a fixture counts as covered. */
export const requiredSlots = (fixture: LoadedFixture) => fixture.crew.filter((s) => s.role !== "OBS");

/**
 * A notice for the people who run a fixture: the federation of its country (never role-wide across countries),
 * or the platform administrators for a continental tie, which belongs to no federation.
 */
export function staffNoticeStmts(
  db: D1Database,
  fixture: Pick<LoadedFixture, "countryCode">,
  n: Omit<NotificationInput, "userId" | "audienceRole" | "countryCode" | "channels">,
) {
  return notifyStmts(db, fixture.countryCode === CONTINENTAL ? { ...n, audienceRole: "admin" } : { ...n, audienceRole: "federation", countryCode: fixture.countryCode });
}
