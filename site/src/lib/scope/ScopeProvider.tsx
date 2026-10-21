"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import { usePersistent, writeStore } from "@/lib/persistent-store";
import { CAF } from "@/lib/store";
import { codesFor, parseScope, serialiseScope, type Scope } from "./scope";
import { useDataset } from "@/lib/dataset/DatasetProvider";
import { lockedCountry } from "@/lib/roles";

interface ScopeContextValue {
  scope: Scope;
  setScope: (next: Scope) => void;
  /** Country codes inside the current scope. */
  codes: string[];
  /** True when the scope holds every country. */
  isAll: boolean;
  /** The country a federation seat is confined to; null for admins, who choose their scope. */
  lockedTo: string | null;
  matches: (countryCode: string) => boolean;
}

const ScopeContext = createContext<ScopeContextValue | null>(null);
const STORAGE_KEY = "aris.scope";

export type { Scope };

const identity = (raw: string | null) => raw;

export function ScopeProvider({ children }: { children: React.ReactNode }) {
  const stored = usePersistent(STORAGE_KEY, identity, null);
  // the country list is replaced when data loads, so the scope must be read against it again
  const { version, user } = useDataset();
  const lockedTo = lockedCountry(user);

  const setScope = useCallback(
    (next: Scope) => {
      // a federation seat has exactly one scope and cannot change it
      if (lockedTo) return;
      writeStore(STORAGE_KEY, serialiseScope(next));
    },
    [lockedTo],
  );

  const value = useMemo<ScopeContextValue>(() => {
    const scope: Scope = lockedTo ? { kind: "country", code: lockedTo } : parseScope(stored);
    const codes = codesFor(scope);
    const set = new Set(codes);
    return {
      scope,
      setScope,
      codes,
      isAll: scope.kind === "all",
      lockedTo,
      // An admin always keeps continental fixtures ("CAF") in view: they are what a zone or
      // federation desk most needs to see. A federation seat never sees them.
      matches: (code: string) => (lockedTo ? code === lockedTo : code === CAF || set.has(code)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored, setScope, lockedTo, version]);

  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}

export function useScope() {
  const ctx = useContext(ScopeContext);
  if (!ctx) throw new Error("useScope must be used inside ScopeProvider");
  return ctx;
}
