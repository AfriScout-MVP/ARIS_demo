"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { LIVE } from "@/lib/api/config";
import { api, ApiError, NetworkError } from "@/lib/api/client";
import type { ApiNotification, SessionUser } from "@/lib/api/types";
import { applySnapshot, notifications as demoNotifications, type ApiSnapshot, type Notification } from "@/lib/mock-data";

export type DatasetStatus = "loading" | "signed-out" | "ready" | "error";

interface DatasetValue {
  /** True when ARIS reads from the Worker; false on the GitHub Pages demo. */
  live: boolean;
  status: DatasetStatus;
  user: SessionUser | null;
  /** Bumps every time the data is replaced, so screens can start afresh. */
  version: number;
  error: "network" | "server" | null;
  reload: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<"ok" | "invalid" | "throttled" | "network">;
  signOut: () => Promise<void>;
  /** Call with anything a request threw: a 401 sends the visitor back to sign-in. */
  noteFailure: (err: unknown) => void;
  notifications: Notification[];
  unread: number;
  markRead: (id: string) => void;
  markAllRead: () => void;
}

const DatasetContext = createContext<DatasetValue | null>(null);

const POLL_MS = 60_000;

function relative(iso: string): Notification["time"] {
  const stamp = new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`).getTime();
  const minutes = Math.max(0, Math.round((Date.now() - stamp) / 60_000));
  if (!Number.isFinite(minutes)) return { en: "", fr: "" };
  if (minutes < 1) return { en: "just now", fr: "à l'instant" };
  if (minutes < 60) return { en: `${minutes} min ago`, fr: `il y a ${minutes} min` };
  const hours = Math.round(minutes / 60);
  if (hours < 24) return { en: `${hours} h ago`, fr: `il y a ${hours} h` };
  const days = Math.round(hours / 24);
  return { en: `${days} d ago`, fr: `il y a ${days} j` };
}

function toNotification(n: ApiNotification): Notification {
  return { id: n.id, title: n.title, detail: n.detail, time: relative(n.createdAt), tone: n.tone, read: n.read, href: n.href || "/" };
}

const DEMO_USER: SessionUser = {
  id: "demo",
  email: "referees@caf-demo.org",
  name: "Nadia Boukhari",
  role: "commission",
  officialId: null,
  scope: "all",
  locale: "fr",
};

export function DatasetProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<DatasetStatus>(LIVE ? "loading" : "ready");
  const [user, setUser] = useState<SessionUser | null>(LIVE ? null : DEMO_USER);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<DatasetValue["error"]>(null);
  const [items, setItems] = useState<Notification[]>(LIVE ? [] : demoNotifications);
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
      // referees have a personal space and no access to the commission snapshot
      if (me.user.role !== "referee") {
        const snapshot = await api<ApiSnapshot>("/snapshot");
        if (mine !== loadId.current) return;
        applySnapshot(snapshot);
      }
      setUser(me.user);
      setVersion((v) => v + 1);
      setStatus("ready");
      void loadNotifications();
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
    if (!LIVE) return;
    // first load of the session: an effect is the right place to start a request
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    if (!LIVE || status !== "ready") return;
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
        await api("/auth/login", { method: "POST", body: { email, password } });
      } catch (err) {
        if (err instanceof NetworkError) return "network";
        if (err instanceof ApiError && err.status === 429) return "throttled";
        return "invalid";
      }
      await load();
      return "ok";
    },
    [load],
  );

  const signOut = useCallback(async () => {
    if (LIVE) {
      try {
        await api("/auth/logout", { method: "POST" });
      } catch {
        // the cookie is cleared by the Worker; if the call failed the session still expires on its own
      }
      loadId.current += 1;
      setUser(null);
      setItems([]);
      setStatus("signed-out");
    }
  }, []);

  const noteFailure = useCallback((err: unknown) => {
    if (LIVE && err instanceof ApiError && err.status === 401) {
      setUser(null);
      setStatus("signed-out");
    }
  }, []);

  const markRead = useCallback((id: string) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    if (LIVE) void api(`/notifications/${encodeURIComponent(id)}/read`, { method: "POST" }).catch(() => undefined);
  }, []);

  const markAllRead = useCallback(() => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    if (LIVE) void api("/notifications/read-all", { method: "POST" }).catch(() => undefined);
  }, []);

  const value = useMemo<DatasetValue>(
    () => ({
      live: LIVE,
      status,
      user,
      version,
      error,
      reload: load,
      signIn,
      signOut,
      noteFailure,
      notifications: items,
      unread: items.filter((n) => !n.read).length,
      markRead,
      markAllRead,
    }),
    [status, user, version, error, load, signIn, signOut, noteFailure, items, markRead, markAllRead],
  );

  return <DatasetContext.Provider value={value}>{children}</DatasetContext.Provider>;
}

export function useDataset() {
  const ctx = useContext(DatasetContext);
  if (!ctx) throw new Error("useDataset must be used inside DatasetProvider");
  return ctx;
}
