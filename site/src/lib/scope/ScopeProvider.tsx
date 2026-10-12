"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import { usePersistent, writeStore } from "@/lib/persistent-store";
import { countries, type Zone } from "@/lib/mock-data";
import { useDataset } from "@/lib/dataset/DatasetProvider";

export type Scope =
  | { kind: "all" }
  | { kind: "zone"; zone: Zone }
  | { kind: "country"; code: string };

interface ScopeContextValue {
  scope: Scope;
  setScope: (next: Scope) => void;
  /** Country codes inside the current scope. */
  codes: string[];
  /** True when the scope holds every country. */
  isAll: boolean;
  matches: (countryCode: string) => boolean;
}

const ScopeContext = createContext<ScopeContextValue | null>(null);
const STORAGE_KEY = "aris.scope";
const ALL: Scope = { kind: "all" };

function serialise(scope: Scope) {
  if (scope.kind === "all") return "all";
  if (scope.kind === "zone") return `zone:${scope.zone}`;
  return `country:${scope.code}`;
}

function parseScope(raw: string | null): Scope {
  if (!raw || raw === "all") return ALL;
  const [kind, value] = raw.split(":");
  if (kind === "zone" && countries.some((c) => c.zone === value)) {
    return { kind: "zone", zone: value as Zone };
  }
  if (kind === "country" && countries.some((c) => c.code === value)) {
    return { kind: "country", code: value };
  }
  return ALL;
}

export function ScopeProvider({ children }: { children: React.ReactNode }) {
  const scope = usePersistent(STORAGE_KEY, parseScope, ALL);
  // the country list is replaced when live data loads, so the codes must be recomputed
  const { version } = useDataset();

  const setScope = useCallback((next: Scope) => {
    writeStore(STORAGE_KEY, serialise(next));
  }, []);

  const value = useMemo<ScopeContextValue>(() => {
    const codes =
      scope.kind === "all"
        ? countries.map((c) => c.code)
        : scope.kind === "zone"
          ? countries.filter((c) => c.zone === scope.zone).map((c) => c.code)
          : [scope.code];
    const set = new Set(codes);
    return {
      scope,
      setScope,
      codes,
      isAll: scope.kind === "all",
      // Continental fixtures ("CAF") always stay in view: they are the
      // fixtures a zone or federation desk most needs to see.
      matches: (code: string) => code === "CAF" || set.has(code),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, setScope, version]);

  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}

export function useScope() {
  const ctx = useContext(ScopeContext);
  if (!ctx) throw new Error("useScope must be used inside ScopeProvider");
  return ctx;
}
