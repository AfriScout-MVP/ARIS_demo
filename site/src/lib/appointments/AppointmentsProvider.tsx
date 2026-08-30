"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { bestCandidate } from "@/lib/assignment";
import { fixtureById, type CrewRole, type CrewSlot, type Fixture } from "@/lib/mock-data";

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
  assign: (fixtureId: string, role: CrewRole, officialId: string, actor?: TraceEntry["actor"], reason?: TraceEntry["reason"]) => void;
  clear: (fixtureId: string, role: CrewRole) => void;
  confirmAll: (fixtureId: string) => void;
  autoFill: (list: Fixture[]) => number;
  undoAutoFill: () => void;
  trace: TraceEntry[];
  touched: number;
}

const AppointmentsContext = createContext<AppointmentsValue | null>(null);

function clock() {
  return new Date().toLocaleTimeString("en-GB", { hour12: false });
}

export function AppointmentsProvider({ children }: { children: React.ReactNode }) {
  const [overrides, setOverrides] = useState<Record<string, CrewSlot[]>>({});
  const [trace, setTrace] = useState<TraceEntry[]>([]);
  const [lastAutoFill, setLastAutoFill] = useState<Record<string, CrewSlot[]> | null>(null);

  const crewFor = useCallback(
    (fixture: Fixture) => overrides[fixture.id] ?? fixture.crew,
    [overrides],
  );

  const write = useCallback(
    (fixtureId: string, updater: (crew: CrewSlot[]) => CrewSlot[]) => {
      setOverrides((prev) => {
        const base = prev[fixtureId] ?? fixtureById.get(fixtureId)?.crew ?? [];
        return { ...prev, [fixtureId]: updater(base) };
      });
    },
    [],
  );

  const assign = useCallback<AppointmentsValue["assign"]>(
    (fixtureId, role, officialId, actor = "you", reason) => {
      write(fixtureId, (crew) =>
        crew.map((slot) =>
          slot.role === role ? { ...slot, officialId, state: "confirmed" as const } : slot,
        ),
      );
      setTrace((prev) => [
        { id: `${fixtureId}-${role}-${prev.length}`, at: clock(), fixtureId, role, officialId, actor, reason },
        ...prev,
      ]);
    },
    [write],
  );

  const clear = useCallback<AppointmentsValue["clear"]>(
    (fixtureId, role) => {
      write(fixtureId, (crew) =>
        crew.map((slot) => (slot.role === role ? { ...slot, officialId: null, state: "empty" as const } : slot)),
      );
      setTrace((prev) => [
        { id: `${fixtureId}-${role}-clear-${prev.length}`, at: clock(), fixtureId, role, officialId: null, actor: "you" },
        ...prev,
      ]);
    },
    [write],
  );

  const confirmAll = useCallback<AppointmentsValue["confirmAll"]>(
    (fixtureId) => {
      write(fixtureId, (crew) =>
        crew.map((slot) => (slot.officialId ? { ...slot, state: "confirmed" as const } : slot)),
      );
    },
    [write],
  );

  const autoFill = useCallback<AppointmentsValue["autoFill"]>(
    (list) => {
      const snapshot: Record<string, CrewSlot[]> = {};
      const entries: TraceEntry[] = [];
      let filled = 0;

      setOverrides((prev) => {
        const next = { ...prev };
        list.forEach((fixture) => {
          const base = next[fixture.id] ?? fixture.crew;
          snapshot[fixture.id] = base;
          let working = base;
          base.forEach((slot) => {
            if (slot.role === "OBS") return;
            if (slot.state !== "empty" && slot.state !== "declined") return;
            const pick = bestCandidate(fixture, slot.role, working);
            if (!pick) return;
            working = working.map((s) =>
              s.role === slot.role ? { ...s, officialId: pick.id, state: "pending" as const } : s,
            );
            filled += 1;
            entries.push({
              id: `${fixture.id}-${slot.role}-auto-${filled}`,
              at: clock(),
              fixtureId: fixture.id,
              role: slot.role,
              officialId: pick.id,
              actor: "engine",
              reason: {
                rating: pick.rating,
                travel: pick.travelHours,
                rest: pick.rest,
                friction: pick.frictionRisk,
              },
            });
          });
          next[fixture.id] = working;
        });
        return next;
      });

      setLastAutoFill(snapshot);
      setTrace((prev) => [...entries.reverse(), ...prev]);
      return filled;
    },
    [],
  );

  const undoAutoFill = useCallback(() => {
    if (!lastAutoFill) return;
    setOverrides((prev) => ({ ...prev, ...lastAutoFill }));
    setLastAutoFill(null);
  }, [lastAutoFill]);

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

  return <AppointmentsContext.Provider value={value}>{children}</AppointmentsContext.Provider>;
}

export function useAppointments() {
  const ctx = useContext(AppointmentsContext);
  if (!ctx) throw new Error("useAppointments must be used inside AppointmentsProvider");
  return ctx;
}
