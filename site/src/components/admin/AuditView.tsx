"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, RefreshCcw } from "@/components/icons/glyphs";
import { Badge, Button, Card, EmptyState } from "@/components/ui";
import { listAudit, type AuditEntry, type AuditPage } from "@/lib/api/admin";
import { isAdmin, type Actor } from "@/lib/admin/actor";
import { describeError } from "@/lib/admin/errors";
import { filterAudit, newestFirst, prettyJson } from "@/lib/admin/filters";
import { formatDateTime } from "@/lib/admin/format";
import { useActor, useResource } from "@/lib/admin/hooks";
import { translateOr } from "@/lib/admin/labels";
import { useDataset } from "@/lib/dataset/DatasetProvider";
import { useLocale, useT } from "@/lib/i18n/LocaleProvider";
import { useToast } from "@/lib/toast/ToastProvider";
import { localeTags } from "@/locales";
import { AdminPage } from "./AdminPage";
import { SelectField, TextField } from "./fields";
import { ErrorState, ListSkeleton, ResultsLive } from "./states";

const PAGE = 100;
const ENTITIES = ["user", "federation", "country", "team", "stadium", "official", "fixture", "match", "payment", "document", "course", "case"];

export function AuditView() {
  const t = useT();
  const { locale } = useLocale();
  const toast = useToast();
  const { noteFailure } = useDataset();
  const actor = useActor() as Actor;
  const admin = isAdmin(actor);

  const [entity, setEntity] = useState("");
  const [action, setAction] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [more, setMore] = useState<{ base: AuditPage; entries: AuditEntry[]; next: number | null } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const first = useResource(`audit|${entity}`, (signal) => listAudit({ entity: entity || undefined, limit: PAGE }, signal));
  const base = first.data;
  const extra = base && more?.base === base ? more : null;
  const cursor = base ? (extra ? extra.next : base.nextBefore) : null;

  const entries = useMemo(() => {
    const byId = new Map<number, AuditEntry>();
    for (const e of [...(base?.entries ?? []), ...(extra?.entries ?? [])]) byId.set(e.id, e);
    return [...byId.values()].sort(newestFirst);
  }, [base, extra]);

  const rows = useMemo(() => filterAudit(entries, { action, q }), [entries, action, q]);

  const entityOptions = useMemo(() => {
    const seen = new Set([...ENTITIES, ...entries.map((e) => e.entity), ...(entity ? [entity] : [])]);
    return [...seen].sort().map((value) => ({ value, label: translateOr(t, `admin.audit.entities.${value}`, value) }));
  }, [entries, entity, t]);

  async function loadMore() {
    if (!base || cursor === null) return;
    setLoadingMore(true);
    try {
      const page = await listAudit({ entity: entity || undefined, limit: PAGE, before: cursor });
      setMore({ base, entries: [...(extra?.entries ?? []), ...page.entries], next: page.nextBefore });
    } catch (err) {
      noteFailure(err);
      toast.push("error", t(describeError(err).key));
    } finally {
      setLoadingMore(false);
    }
  }

  const stamp = (e: AuditEntry) => formatDateTime(e.at, localeTags[locale]);
  const entityLabel = (e: AuditEntry) => translateOr(t, `admin.audit.entities.${e.entity}`, e.entity);

  return (
    <AdminPage
      titleKey="admin.audit.title"
      subtitleKey={admin ? "admin.audit.subtitleAdmin" : "admin.audit.subtitleFederation"}
      action={
        <Button onClick={first.reload} disabled={first.loading || first.refreshing}>
          <RefreshCcw size={14} />
          {t("admin.audit.refresh")}
        </Button>
      }
    >
      {!admin && (
        <p role="note" className="rounded-lg border border-line bg-ink-2 px-3 py-2.5 text-sm text-chalk-dim">
          {t("admin.audit.federationNote", { country: actor.country ?? "" })}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <SelectField
          label={t("admin.audit.entity")}
          value={entity}
          onChange={(v) => {
            setEntity(v);
            setOpen(null);
          }}
          placeholder={t("admin.audit.allEntities")}
          options={entityOptions}
        />
        <TextField label={t("admin.audit.action")} value={action} onChange={setAction} placeholder={t("admin.audit.actionPlaceholder")} autoComplete="off" spellCheck={false} />
        <TextField type="search" label={t("admin.audit.search")} value={q} onChange={setQ} placeholder={t("admin.audit.searchPlaceholder")} autoComplete="off" />
      </div>

      {first.loading ? (
        <ListSkeleton rows={8} />
      ) : first.error ? (
        <ErrorState onRetry={first.reload} />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            title={entries.length === 0 ? t("admin.audit.empty") : t("admin.common.noMatch")}
            hint={entries.length === 0 ? t("admin.audit.emptyHint") : t("admin.common.noMatchHint")}
          />
        </Card>
      ) : (
        <>
          <ResultsLive count={rows.length} />
          <Card padded={false}>
            <ol className="divide-y divide-line">
              {rows.map((e) => {
                const expanded = open === e.id;
                const before = prettyJson(e.before);
                const after = prettyJson(e.after);
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      aria-expanded={expanded}
                      aria-controls={`audit-${e.id}`}
                      onClick={() => setOpen(expanded ? null : e.id)}
                      className="flex w-full items-start gap-3 px-4 py-3 text-start hover:bg-red-500/[0.03] lg:grid lg:grid-cols-[12rem_14rem_minmax(0,1fr)_14rem] lg:items-center"
                    >
                      <span className="mt-0.5 text-chalk-faint lg:hidden">{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
                      <span className="min-w-0 flex-1 space-y-1 lg:contents">
                        <span className="block text-xs text-chalk-dim tnum">{stamp(e)}</span>
                        <span className="block truncate font-mono text-sm font-semibold text-chalk">{e.action}</span>
                        <span className="block min-w-0 truncate text-sm text-chalk-dim">
                          {entityLabel(e)}
                          {e.entityId && <span className="ms-1 font-mono text-xs text-chalk-faint">{e.entityId}</span>}
                        </span>
                        <span className="block truncate text-xs text-chalk-faint">
                          {e.actorName ?? t("admin.audit.system")}
                          {e.actorRole && ` · ${translateOr(t, `admin.roles.${e.actorRole}`, e.actorRole)}`}
                        </span>
                      </span>
                      <span className="hidden text-chalk-faint lg:block">{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
                    </button>
                    {expanded && (
                      <div id={`audit-${e.id}`} className="space-y-3 border-t border-line bg-ink-1 px-4 py-4">
                        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
                          {e.countryCode && (
                            <div className="flex gap-1.5">
                              <dt className="text-chalk-faint">{t("admin.audit.country")}</dt>
                              <dd className="text-chalk-dim">{e.countryCode}</dd>
                            </div>
                          )}
                          {e.ip && (
                            <div className="flex gap-1.5">
                              <dt className="text-chalk-faint">{t("admin.audit.ip")}</dt>
                              <dd className="font-mono text-chalk-dim">{e.ip}</dd>
                            </div>
                          )}
                          {e.reason && (
                            <div className="flex gap-1.5">
                              <dt className="text-chalk-faint">{t("admin.audit.reason")}</dt>
                              <dd className="text-chalk-dim">{e.reason}</dd>
                            </div>
                          )}
                          <div className="flex gap-1.5">
                            <dt className="text-chalk-faint">{t("admin.audit.number")}</dt>
                            <dd className="font-mono text-chalk-dim">{e.id}</dd>
                          </div>
                        </dl>
                        {before || after ? (
                          <div className="grid gap-3 md:grid-cols-2">
                            <Payload title={t("admin.audit.before")} text={before} empty={t("admin.audit.noPayload")} />
                            <Payload title={t("admin.audit.after")} text={after} empty={t("admin.audit.noPayload")} />
                          </div>
                        ) : (
                          <Badge>{t("admin.audit.noPayload")}</Badge>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </Card>
          {cursor !== null && (
            <div className="flex justify-center">
              <Button onClick={() => void loadMore()} disabled={loadingMore}>
                {loadingMore ? t("admin.common.working") : t("admin.audit.older")}
              </Button>
            </div>
          )}
        </>
      )}
    </AdminPage>
  );
}

/** Payloads are shown as text only: React escapes them, and nothing here is ever parsed as markup. */
function Payload({ title, text, empty }: { title: string; text: string; empty: string }) {
  return (
    <div className="min-w-0">
      <h3 className="mb-1 text-xs font-semibold text-chalk-dim">{title}</h3>
      <pre
        tabIndex={0}
        className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-line bg-ink-2 p-3 font-mono text-xs leading-relaxed text-chalk"
      >
        {text || empty}
      </pre>
    </div>
  );
}
