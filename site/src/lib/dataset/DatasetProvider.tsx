"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, NetworkError } from "@/lib/api/client";
import type { ApiNotification, SessionUser } from "@/lib/api/types";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { applySnapshot, resetStore, type ApiSnapshot, type Notification } from "@/lib/store";
import { isStaff } from "@/lib/roles";
import type { Locale } from "@/locales";
import { isLocale } from "@/locales";

export type DatasetStatus = "loading" | "signed-out" | "ready" | "error";

interface DatasetValue {
  status: DatasetStatus;
  user: SessionUser | null;
  /** Bumps every time the data is replaced, so screens can start afresh. */
  version: number;
  error: "network" | "server" | null;
  reload: () => Promise<void>;
  /** Fetch the snapshot again without leaving the screen. Resolves false when the request failed. */
  refresh: () => Promise<boolean>;
  signIn: (email: string, password: string) => Promise<"ok" | "invalid" | "throttled" | "network">;
  signOut: () => Promise<void>;
  /** Call with anything a request threw: a 401 sends the visitor back to sign-in. */
  noteFailure: (err: unknown) => void;
  /** Remember the chosen language on the account (`PATCH /auth/me`); a failure is silent, the choice still applies here. */
  saveLocale: (locale: Locale) => void;
  notifications: Notification[];
  unread: number;
  markRead: (id: string) => void;
  markAllRead: () => void;
}

const DatasetContext = createContext<DatasetValue | null>(null);

const POLL_MS = 60_000;

function toNotification(n: ApiNotification): Notification {
  return { id: n.id, title: n.title, detail: n.detail, createdAt: n.createdAt, tone: n.tone, read: n.read, href: n.href || "/" };
}

export function DatasetProvider({ children }: { children: React.ReactNode }) {
  const { setLocale } = useLocale();
  const [status, setStatus] = useState<DatasetStatus>("loading");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<DatasetValue["error"]>(null);
  const [items, setItems] = useState<Notification[]>([]);
  const loadId = useRef(0);

  const loadNotifications = useCallback(async () => {
    try {
      const res = await api<{ notifications: ApiNotification[] }>("/notifications");
      setItems(res.notifications.map(toNotification));
    } catch {
      // the bell is a convenience; a failed poll must not interrupt the work
    }
  }, []);

  const load = useCallback(async () => {
    const mine = ++loadId.current;
    setStatus("loading");
    setError(null);
    try {
      const me = await api<{ user: SessionUser }>("/auth/me");
      if (mine !== loadId.current) return;
      // a staff-set password blocks every route but /auth (see api/src/index.ts): fetching the snapshot
      // would only 403. DataGate shows the forced change-password screen instead until it is cleared.
      if (isStaff(me.user) && !me.user.mustChangePassword) {
        const snapshot = await api<ApiSnapshot>("/snapshot");
        if (mine !== loadId.current) return;
        applySnapshot(snapshot);
      }
      setUser(me.user);
      setVersion((v) => v + 1);
      setStatus("ready");
      if (!me.user.mustChangePassword) void loadNotifications();
    } catch (err) {
      if (mine !== loadId.current) return;
      if (err instanceof ApiError && err.status === 401) {
        setUser(null);
        setStatus("signed-out");
      } else {
        setError(err instanceof NetworkError ? "network" : "server");
        setStatus("error");
      }
    }
  }, [loadNotifications]);

  useEffect(() => {
    // first load of the session: an effect is the right place to start a request
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    if (status !== "ready") return;
    const timer = window.setInterval(() => void loadNotifications(), POLL_MS);
    const onFocus = () => void loadNotifications();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [status, loadNotifications]);

  const signIn = useCallback<DatasetValue["signIn"]>(
    async (email, password) => {
      try {
        const res = await api<{ user?: SessionUser }>("/auth/login", { method: "POST", body: { email, password } });
        // a fresh sign-in speaks the language saved on the account
        if (res?.user && isLocale(res.user.locale)) setLocale(res.user.locale);
      } catch (err) {
        if (err instanceof NetworkError) return "network";
        if (err instanceof ApiError && err.status === 429) return "throttled";
        return "invalid";
      }
      await load();
      return "ok";
    },
    [load, setLocale],
  );

  const signOut = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      // the API clears the cookie; if the call failed the session still expires on its own
    }
    loadId.current += 1;
    resetStore();
    setUser(null);
    setItems([]);
    setStatus("signed-out");
  }, []);

  const noteFailure = useCallback((err: unknown) => {
    if (err instanceof ApiError && err.status === 401) {
      resetStore();
      setUser(null);
      setStatus("signed-out");
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const snapshot = await api<ApiSnapshot>("/snapshot");
      applySnapshot(snapshot);
      setVersion((v) => v + 1);
      return true;
    } catch (err) {
      noteFailure(err);
      return false;
    }
  }, [noteFailure]);

  const saveLocale = useCallback((locale: Locale) => {
    setUser((prev) => (prev ? { ...prev, locale } : prev));
    void api("/auth/me", { method: "PATCH", body: { locale } }).catch(() => undefined);
  }, []);

  const markRead = useCallback((id: string) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    void api(`/notifications/${encodeURIComponent(id)}/read`, { method: "POST" }).catch(() => undefined);
  }, []);

  const markAllRead = useCallback(() => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    void api("/notifications/read-all", { method: "POST" }).catch(() => undefined);
  }, []);

  const value = useMemo<DatasetValue>(
    () => ({
      status,
      user,
      version,
      error,
      reload: load,
      refresh,
      signIn,
      signOut,
      noteFailure,
      saveLocale,
      notifications: items,
      unread: items.filter((n) => !n.read).length,
      markRead,
      markAllRead,
    }),
    [status, user, version, error, load, refresh, signIn, signOut, noteFailure, saveLocale, items, markRead, markAllRead],
  );

  return <DatasetContext.Provider value={value}>{children}</DatasetContext.Provider>;
}

export function useDataset() {
  const ctx = useContext(DatasetContext);
  if (!ctx) throw new Error("useDataset must be used inside DatasetProvider");
  return ctx;
}
