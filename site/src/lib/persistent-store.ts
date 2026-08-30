"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * localStorage read as an external store rather than an effect.
 *
 * The app is a static export: the server snapshot has to be the neutral
 * default, and the client picks up the stored value on the first render after
 * hydration. `useSyncExternalStore` is what does that without a setState pass.
 */

const listeners = new Map<string, Set<() => void>>();
const cache = new Map<string, { raw: string | null; value: unknown }>();

function emit(key: string) {
  cache.delete(key);
  listeners.get(key)?.forEach((listener) => listener());
}

export function writeStore(key: string, raw: string) {
  window.localStorage.setItem(key, raw);
  emit(key);
}

export function usePersistent<T>(key: string, parse: (raw: string | null) => T, serverValue: T): T {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const set = listeners.get(key) ?? new Set<() => void>();
      set.add(onChange);
      listeners.set(key, set);

      // Keep tabs in step with each other.
      const onStorage = (event: StorageEvent) => {
        if (event.key === key) emit(key);
      };
      window.addEventListener("storage", onStorage);

      return () => {
        set.delete(onChange);
        window.removeEventListener("storage", onStorage);
      };
    },
    [key],
  );

  const getSnapshot = useCallback(() => {
    const raw = window.localStorage.getItem(key);
    const entry = cache.get(key);
    // The snapshot must be referentially stable while the raw string is
    // unchanged, or React re-renders forever.
    if (entry && entry.raw === raw) return entry.value as T;
    const value = parse(raw);
    cache.set(key, { raw, value });
    return value;
  }, [key, parse]);

  return useSyncExternalStore(subscribe, getSnapshot, () => serverValue);
}
