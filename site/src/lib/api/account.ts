// The signed-in person's own account (name, recovery) and their notifications; the administrators' delivery queue.
import type { Localized } from "@/lib/store/types";
import { api } from "./client";
import type { ApiNotification, SessionUser } from "./types";

/* ---------------------------- recovery (signed out) ---------------------------- */

/** Always answers 202 — whether or not the address has an account. */
export const requestPasswordReset = (email: string) => api<{ ok: true }>("/auth/forgot", { method: "POST", body: { email } });

export const resetPassword = (token: string, password: string) => api<{ ok: true }>("/auth/reset", { method: "POST", body: { token, password } });

export const changeMyPassword = (currentPassword: string, newPassword: string) =>
  api<{ ok: true; signedOut: true }>("/auth/change-password", { method: "POST", body: { currentPassword, newPassword } });

export const renameMe = (name: string) => api<{ user: SessionUser }>("/auth/me", { method: "PATCH", body: { name } });

/* --------------------------------- notifications --------------------------------- */

export interface NotificationPage {
  unread: number;
  notifications: ApiNotification[];
  /** Pass back as `cursor` for the next (older) page; null on the last one. */
  nextCursor: string | null;
}

export const listNotifications = (q: { cursor?: string; unread?: boolean; limit?: number } = {}, signal?: AbortSignal) =>
  api<NotificationPage>("/notifications", { query: { cursor: q.cursor, unread: q.unread ? "1" : undefined, limit: q.limit ?? 30 }, signal });

export const removeNotification = (id: string) => api<{ ok: true }>(`/notifications/${encodeURIComponent(id)}`, { method: "DELETE" });

/* ------------------------------------ outbox ------------------------------------ */

export type OutboxStatus = "queued" | "sent" | "failed" | "dead";

export interface OutboxMessage {
  id: number;
  kind: "notification" | "direct";
  notificationId: string | null;
  channel: "email" | "sms" | "whatsapp";
  recipient: string;
  status: OutboxStatus;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  sentAt: string | null;
  /** Direct messages (a reset link): the subject line. The body is never sent to the client. */
  subject: string | null;
  /** Notification messages: the notice's title. */
  title: Localized | null;
  userId: string | null;
  userName: string | null;
  country: string | null;
}

export interface OutboxPage {
  messages: OutboxMessage[];
  counts: Record<OutboxStatus, number>;
  nextCursor: number | null;
}

export const listOutbox = (q: { status?: OutboxStatus; cursor?: number; limit?: number } = {}, signal?: AbortSignal) =>
  api<OutboxPage>("/notifications/outbox", { query: { status: q.status, cursor: q.cursor, limit: q.limit ?? 50 }, signal });

export const retryOutbox = (id: number) => api<{ message: OutboxMessage }>(`/notifications/outbox/${id}/retry`, { method: "POST" });
