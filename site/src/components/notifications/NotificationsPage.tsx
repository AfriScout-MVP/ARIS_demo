"use client";

import Link from "next/link";
import { useState } from "react";
import { PageHeading } from "@/components/layout/PageHeading";
import { CardError, CardSkeleton } from "@/components/me/CardStates";
import { Button, Card, Dot, EmptyState, Segmented, type Tone } from "@/components/ui";
import { appendPage } from "@/lib/account/rules";
import { listNotifications, removeNotification } from "@/lib/api/account";
import type { ApiNotification } from "@/lib/api/types";
import { useResource } from "@/lib/admin/hooks";
import { useDataset } from "@/lib/dataset/DatasetProvider";
import { useLocale, useT } from "@/lib/i18n/LocaleProvider";
import { pickLocalized } from "@/lib/i18n/localized";
import { formatRelative } from "@/lib/i18n/relative";
import { useToast } from "@/lib/toast/ToastProvider";
import { cn } from "@/lib/utils";

type View = "all" | "unread";
interface MorePages {
  view: View;
  items: ApiNotification[];
  cursor: string | null;
}

/**
 * Every notice the signed-in person has, newest first, with a filter, read / unread, remove, and paging.
 * The bell menu shows the latest few; this is where "See all" leads (`/notifications`, `/me/notifications`).
 */
export function NotificationsPage() {
  const t = useT();
  const toast = useToast();
  const { locale } = useLocale();
  const { markRead, markAllRead } = useDataset();
  const [view, setView] = useState<View>("all");
  const first = useResource(`notifications:page|${view}`, (signal) => listNotifications({ unread: view === "unread" }, signal));
  const [more, setMore] = useState<MorePages | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [problem, setProblem] = useState(false);
  const [readHere, setReadHere] = useState<Set<string>>(new Set());
  const [gone, setGone] = useState<Set<string>>(new Set());

  const extra = more?.view === view ? more : null;
  const items = first.data ? appendPage(first.data.notifications, extra?.items ?? []).filter((n) => !gone.has(n.id)) : [];
  const cursor = extra ? extra.cursor : (first.data?.nextCursor ?? null);
  const isRead = (n: ApiNotification) => n.read || readHere.has(n.id);
  const unread = items.filter((n) => !isRead(n)).length;

  const read = (id: string) => {
    markRead(id);
    setReadHere((s) => new Set(s).add(id));
  };

  async function showMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setProblem(false);
    try {
      const page = await listNotifications({ cursor, unread: view === "unread" });
      setMore({ view, items: [...(extra?.items ?? []), ...page.notifications], cursor: page.nextCursor });
    } catch {
      setProblem(true);
    } finally {
      setLoadingMore(false);
    }
  }

  async function remove(id: string) {
    try {
      await removeNotification(id);
      setGone((s) => new Set(s).add(id));
      toast.push("success", t("account.notifications.removed"));
    } catch {
      toast.push("error", t("account.notifications.failed"));
    }
  }

  const frame = (body: React.ReactNode) => (
    <>
      <PageHeading titleKey="account.notifications.title" subtitleKey="account.notifications.subtitle" />
      {body}
    </>
  );

  if (first.loading) return frame(<CardSkeleton title={t("account.notifications.title")} rows={5} />);
  if (first.error || !first.data) return frame(<CardError title={t("account.notifications.title")} error={first.error} onRetry={first.reload} />);

  return frame(
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: "all", label: t("account.notifications.all") },
            { value: "unread", label: t("account.notifications.unread") },
          ]}
        />
        <div className="flex items-center gap-3">
          <span className="text-sm text-chalk-dim" aria-live="polite">
            {t("account.notifications.unreadCount", { n: unread })}
          </span>
          {unread > 0 && (
            <Button
              size="sm"
              onClick={() => {
                markAllRead();
                setReadHere(new Set(items.map((n) => n.id)));
              }}
            >
              {t("account.notifications.markAllRead")}
            </Button>
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState title={t(view === "unread" ? "account.notifications.emptyUnread" : "account.notifications.empty")} />
      ) : (
        <ul className="divide-y divide-line">
          {items.map((n) => (
            <li key={n.id} className="flex items-start gap-3 py-3">
              <span className="mt-1.5">
                <Dot tone={n.tone as Tone} />
              </span>
              <Link href={n.href} onClick={() => read(n.id)} className="min-w-0 flex-1">
                <span className={cn("block text-sm", isRead(n) ? "text-chalk-dim" : "font-medium text-chalk")}>{pickLocalized(n.title, locale)}</span>
                <span className="mt-0.5 block text-sm text-chalk-faint">{pickLocalized(n.detail, locale)}</span>
                <span className="mt-1 block text-xs text-chalk-faint">{formatRelative(n.createdAt, locale)}</span>
              </Link>
              <div className="flex shrink-0 gap-1">
                {!isRead(n) && (
                  <Button size="sm" variant="ghost" onClick={() => read(n.id)}>
                    {t("account.notifications.markRead")}
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => void remove(n.id)}>
                  {t("account.notifications.remove")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {problem && (
        <p role="alert" className="mt-3 text-sm text-card-red">
          {t("account.notifications.failed")}
        </p>
      )}
      {cursor && (
        <div className="mt-4 flex justify-center">
          <Button onClick={() => void showMore()} disabled={loadingMore}>
            {loadingMore ? t("account.notifications.loading") : t("account.notifications.loadMore")}
          </Button>
        </div>
      )}
    </Card>,
  );
}
