"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { blockerKey } from "@/lib/assignment";
import { api, ApiError, NetworkError } from "@/lib/api/client";
import type { ApiFixture, AutofillResult } from "@/lib/api/types";
import { useDataset } from "@/lib/dataset/DatasetProvider";
import { useT } from "@/lib/i18n/LocaleProvider";
import { useToast } from "@/lib/toast/ToastProvider";
import { ReasonDialog } from "@/components/appointments/ReasonDialog";
import { fixtureById, normalizeFixture, patchFixtureCrew, type CrewRole, type CrewSlot, type Fixture } from "@/lib/store";
import type { BlockerId } from "@/lib/core/types";

export interface TraceEntry {
  id: string;
  at: string;
  fixtureId: string;
  role: CrewRole;
  officialId: string | null;
  actor: "you" | "engine";
  /** Why the engine picked this official — empty for manual choices. */
  reason?: { rating: number; travel: number; rest: number; friction: string };
}

interface AppointmentsValue {
  crewFor: (fixture: Fixture) => CrewSlot[];
  assign: (fixtureId: string, role: CrewRole, officialId: string) => void;
  clear: (fixtureId: string, role: CrewRole) => void;
  confirmAll: (fixtureId: string) => void;
  /** Resolves with how many slots were filled. */
  autoFill: (list: Fixture[]) => Promise<number>;
  undoAutoFill: () => void;
  trace: TraceEntry[];
  touched: number;
}

const AppointmentsContext = createContext<AppointmentsValue | null>(null);

function clock() {
  return new Date().toLocaleTimeString("en-GB", { hour12: false });
}

/** Stable empty map, so an unchanged store keeps the same identity between renders. */
const EMPTY: Record<string, CrewSlot[]> = {};

export function AppointmentsProvider({ children }: { children: React.ReactNode }) {
  const t = useT();
  const toast = useToast();
  const { version, noteFailure } = useDataset();
  const [store, setStore] = useState<{ version: number; map: Record<string, CrewSlot[]> }>({ version, map: EMPTY });
  const [trace, setTrace] = useState<TraceEntry[]>([]);
  const lastRun = useRef<{ runId: string; fixtureIds: string[] } | null>(null);

  // a reload of the data (sign-in, retry) makes the Worker's crews the truth again
  const overrides = store.version === version ? store.map : EMPTY;

  const crewFor = useCallback((fixture: Fixture) => overrides[fixture.id] ?? fixture.crew, [overrides]);

  const setCrew = useCallback(
    (fixtureId: string, crew: CrewSlot[]) => {
      setStore((prev) => ({ version, map: { ...(prev.version === version ? prev.map : EMPTY), [fixtureId]: crew } }));
    },
    [version],
  );

  /* ---------------- the API decides ---------------- */

  const adopt = useCallback(
    (fixture: ApiFixture) => {
      const next = normalizeFixture(fixture);
      patchFixtureCrew(next.id, next.crew);
      setCrew(next.id, next.crew);
    },
    [setCrew],
  );

  const refetch = useCallback(
    async (fixtureId: string) => {
      try {
        const res = await api<{ fixture: ApiFixture }>(`/fixtures/${encodeURIComponent(fixtureId)}`);
        adopt(res.fixture);
      } catch (err) {
        noteFailure(err);
      }
    },
    [adopt, noteFailure],
  );

  const blockerText = useCallback(
    (blockers: BlockerId[]) => blockers.map((b) => t(blockerKey[b]).toLowerCase()).join(", "),
    [t],
  );

  /** What the visitor should read when a request did not go through. */
  const explain = useCallback(
    (err: unknown, fixtureId?: string): string => {
      noteFailure(err);
      if (err instanceof NetworkError) return t("live.offline");
      if (err instanceof ApiError) {
        if (err.code === "stale") {
          if (fixtureId) void refetch(fixtureId);
          return t("live.stale");
        }
        if (err.code === "match_played") return t("live.played");
        if (err.code === "reason_required") return t("live.reasonRequired");
        if (err.status === 403) return t("live.forbidden");
        if (err.code === "ineligible") {
          const blockers = (err.details as { blockers?: BlockerId[] } | undefined)?.blockers ?? [];
          return t("live.ineligible", { why: blockerText(blockers) });
        }
      }
      return t("live.notSaved");
    },
    [t, refetch, blockerText, noteFailure],
  );

  /** Ask for the written reason the Worker requires; null when the visitor backs out. */
  const [asking, setAsking] = useState<{ message: string; override: boolean; answer: (reason: string | null) => void } | null>(null);
  const askReason = useCallback(
    (blockers?: BlockerId[]) =>
      new Promise<string | null>((resolve) => {
        const override = Boolean(blockers?.length);
        setAsking({
          message: override ? t("live.overridePrompt", { why: blockerText(blockers!) }) : t("live.reasonPrompt"),
          override,
          answer: (reason) => {
            setAsking(null);
            resolve(reason);
          },
        });
      }),
    [t, blockerText],
  );

  const liveAssign = useCallback(
    async (fixtureId: string, role: CrewRole, officialId: string): Promise<void> => {
      let reason: string | undefined;
      let override = false;
      // at most one retry per question the Worker can ask (a reason, then an override)
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const slot = fixtureById.get(fixtureId)?.crew.find((s) => s.role === role);
        try {
          const res = await api<{ fixture: ApiFixture }>(`/fixtures/${encodeURIComponent(fixtureId)}/designations/${role}`, {
            method: "PUT",
            // the official is notified and answers; "pending" is where the brief's workflow starts
            body: { officialId, state: "pending", reason, override, expectedVersion: slot?.version },
          });
          adopt(res.fixture);
          setTrace((prev) => [{ id: `${fixtureId}-${role}-${prev.length}`, at: clock(), fixtureId, role, officialId, actor: "you" }, ...prev]);
          return;
        } catch (err) {
          const details = err instanceof ApiError ? (err.details as { blockers?: BlockerId[]; overridable?: boolean } | undefined) : undefined;
          const askable =
            err instanceof ApiError &&
            !reason &&
            (err.code === "reason_required" || (err.code === "ineligible" && details?.overridable));
          if (!askable) {
            toast.push("error", explain(err, fixtureId));
            return;
          }
          const text = await askReason(details?.blockers);
          if (!text) return;
          reason = text;
          override = Boolean(details?.blockers?.length);
        }
      }
    },
    [adopt, explain, toast, askReason],
  );

  const liveClear = useCallback(
    async (fixtureId: string, role: CrewRole): Promise<void> => {
      let reason: string | undefined;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const slot = fixtureById.get(fixtureId)?.crew.find((s) => s.role === role);
        try {
          const res = await api<{ fixture: ApiFixture }>(`/fixtures/${encodeURIComponent(fixtureId)}/designations/${role}`, {
            method: "DELETE",
            body: { reason, expectedVersion: slot?.version },
          });
          adopt(res.fixture);
          setTrace((prev) => [{ id: `${fixtureId}-${role}-clear-${prev.length}`, at: clock(), fixtureId, role, officialId: null, actor: "you" }, ...prev]);
          return;
        } catch (err) {
          if (!(err instanceof ApiError && err.code === "reason_required" && !reason)) {
            toast.push("error", explain(err, fixtureId));
            return;
          }
          const text = await askReason();
          if (!text) return;
          reason = text;
        }
      }
    },
    [adopt, explain, toast, askReason],
  );

  const liveConfirmAll = useCallback(
    async (fixtureId: string) => {
      try {
        const res = await api<{ fixture: ApiFixture }>(`/fixtures/${encodeURIComponent(fixtureId)}/designations/confirm-all`, { method: "POST" });
        adopt(res.fixture);
      } catch (err) {
        toast.push("error", explain(err, fixtureId));
      }
    },
    [adopt, explain, toast],
  );

  /** Pull the crews of the given fixtures back from the Worker. */
  const refreshMany = useCallback(
    async (list: Fixture[]) => {
      const dates = list.map((f) => f.date).sort();
      if (dates.length === 0) return;
      const res = await api<{ fixtures: ApiFixture[] }>("/fixtures", { query: { from: dates[0], to: dates[dates.length - 1], limit: 500 } });
      const wanted = new Set(list.map((f) => f.id));
      res.fixtures.filter((f) => wanted.has(f.id)).forEach(adopt);
    },
    [adopt],
  );

  const liveAutoFill = useCallback(
    async (list: Fixture[]): Promise<number> => {
      try {
        const res = await api<AutofillResult>("/fixtures/autofill", { method: "POST", body: { fixtureIds: list.map((f) => f.id) } });
        lastRun.current = res.runId ? { runId: res.runId, fixtureIds: list.map((f) => f.id) } : null;
        await refreshMany(list);
        setTrace((prev) => [
          ...res.assignments
            .map((a, i): TraceEntry => ({
              id: `${a.fixtureId}-${a.role}-auto-${i}`,
              at: clock(),
              fixtureId: a.fixtureId,
              role: a.role,
              officialId: a.officialId,
              actor: "engine",
              reason: { rating: a.reason.rating, travel: a.reason.travel, rest: a.reason.rest, friction: a.reason.friction },
            }))
            .reverse(),
          ...prev,
        ]);
        return res.filled;
      } catch (err) {
        toast.push("error", err instanceof ApiError || err instanceof NetworkError ? explain(err) : t("live.autoFillFailed"));
        return 0;
      }
    },
    [refreshMany, toast, explain, t],
  );

  const liveUndo = useCallback(async () => {
    const run = lastRun.current;
    if (!run) return;
    try {
      await api("/fixtures/autofill/undo", { method: "POST", body: { runId: run.runId } });
      lastRun.current = null;
      await refreshMany(run.fixtureIds.map((id) => fixtureById.get(id)).filter((f): f is Fixture => Boolean(f)));
    } catch (err) {
      toast.push("error", explain(err));
    }
  }, [refreshMany, toast, explain]);

  const assign = useCallback<AppointmentsValue["assign"]>(
    (fixtureId, role, officialId) => {
      void liveAssign(fixtureId, role, officialId);
    },
    [liveAssign],
  );

  const clear = useCallback<AppointmentsValue["clear"]>(
    (fixtureId, role) => {
      void liveClear(fixtureId, role);
    },
    [liveClear],
  );

  const confirmAll = useCallback<AppointmentsValue["confirmAll"]>(
    (fixtureId) => {
      void liveConfirmAll(fixtureId);
    },
    [liveConfirmAll],
  );

  const autoFill = useCallback<AppointmentsValue["autoFill"]>((list) => liveAutoFill(list), [liveAutoFill]);

  const undoAutoFill = useCallback(() => {
    void liveUndo();
  }, [liveUndo]);

  const value = useMemo<AppointmentsValue>(
    () => ({
      crewFor,
      assign,
      clear,
      confirmAll,
      autoFill,
      undoAutoFill,
      trace,
      touched: Object.keys(overrides).length,
    }),
    [crewFor, assign, clear, confirmAll, autoFill, undoAutoFill, trace, overrides],
  );

  return (
    <AppointmentsContext.Provider value={value}>
      {children}
      {asking && <ReasonDialog message={asking.message} override={asking.override} onAnswer={asking.answer} />}
    </AppointmentsContext.Provider>
  );
}

export function useAppointments() {
  const ctx = useContext(AppointmentsContext);
  if (!ctx) throw new Error("useAppointments must be used inside AppointmentsProvider");
  return ctx;
}
