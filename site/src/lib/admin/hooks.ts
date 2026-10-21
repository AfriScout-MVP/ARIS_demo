"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDataset } from "@/lib/dataset/DatasetProvider";
import { describeError, type ErrorInfo } from "./errors";
import { toActor, type Actor } from "./actor";

/** The signed-in person as the console reads them; null until the session is known. */
export function useActor(): Actor | null {
  const { user } = useDataset();
  return useMemo(() => toActor(user), [user]);
}

interface Settled<T> {
  key: string;
  tick: number;
  data: T | undefined;
  error: unknown;
}

/**
 * Loads one resource. `key` names what is being loaded (a country, a filter): when it changes the old data is
 * dropped and the skeleton shows again; `reload()` refetches under the same key and keeps the old data on screen
 * until the new data arrives. Nothing is fetched while `enabled` is false.
 */
export function useResource<T>(key: string, load: (signal: AbortSignal) => Promise<T>, enabled = true) {
  const { noteFailure } = useDataset();
  const [state, setState] = useState<Settled<T> | null>(null);
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);

  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    loadRef.current(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ key, tick, data, error: null });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        noteFailure(error);
        setState({ key, tick, data: undefined, error });
      },
    );
    return () => controller.abort();
  }, [key, tick, enabled, noteFailure]);

  const sameKey = state !== null && state.key === key;
  const settled = sameKey && state.tick === tick;
  const reload = useCallback(() => setTick((n) => n + 1), []);

  return {
    data: sameKey ? state.data : undefined,
    error: settled ? state.error : null,
    /** First load, or a new key: nothing to show yet. */
    loading: enabled && !settled && !(sameKey && state.data !== undefined),
    /** A reload under the same key: the old data is still showing. */
    refreshing: enabled && sameKey && !settled,
    reload,
  };
}

export type ActionResult<T> = { ok: true; value: T } | { ok: false };

/** Runs a write, tracks its busy state and keeps the translated error for the form to show. */
export function useAction() {
  const { noteFailure } = useDataset();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorInfo | null>(null);

  const run = useCallback(
    async <T,>(task: () => Promise<T>): Promise<ActionResult<T>> => {
      setBusy(true);
      setError(null);
      try {
        const value = await task();
        setBusy(false);
        return { ok: true, value };
      } catch (err) {
        noteFailure(err);
        setError(describeError(err));
        setBusy(false);
        return { ok: false };
      }
    },
    [noteFailure],
  );

  const reset = useCallback(() => setError(null), []);

  return { busy, error, serverFields: error?.fields ?? {}, run, reset };
}

/** A value that follows `value` after it has stopped changing for `delay` ms. */
export function useDebounced<T>(value: T, delay = 300): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return settled;
}
