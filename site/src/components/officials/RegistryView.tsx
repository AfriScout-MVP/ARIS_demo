"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Pencil, UserPlus } from "@/components/icons/glyphs";
import { Avatar, Badge, Button, Card, EmptyState, Segmented, Td, Th } from "@/components/ui";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { SelectField } from "@/components/admin/fields";
import { ErrorState, ListSkeleton, ResultsLive } from "@/components/admin/states";
import { SearchBox } from "@/components/admin/Toolbar";
import { EDITABLE_STATUSES, listOfficials, OFFICIALS_PAGE, type OfficialFile } from "@/lib/api/officials";
import { STATUS_TONE } from "@/lib/officials/forms";
import { useDebounced, useResource } from "@/lib/admin/hooks";
import { useDataset } from "@/lib/dataset/DatasetProvider";
import { useScope } from "@/lib/scope/ScopeProvider";
import { countryName, refereeHref } from "@/lib/store";
import { useLocale, useT } from "@/lib/i18n/LocaleProvider";
import { OfficialDialog } from "./OfficialDialog";

type KindFilter = "all" | "referee" | "assistant";

/** The federation's register: every official it holds, referees and assistants, the retired included. */
export function RegistryView() {
  const t = useT();
  const { locale } = useLocale();
  const { refresh } = useDataset();
  const { scope, matches, lockedTo } = useScope();
  const country = lockedTo ?? (scope.kind === "country" ? scope.code : undefined);
  const [q, setQ] = useState("");
  const query = useDebounced(q.trim(), 300);
  const [kind, setKind] = useState<KindFilter>("all");
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<OfficialFile | "new" | null>(null);

  const key = `officials|${country ?? ""}|${kind}|${status}|${query}`;
  const list = useResource(key, (signal) =>
    listOfficials({ country, kind: kind === "all" ? undefined : kind, status: status || undefined, q: query || undefined }, signal),
  );
  const rows = useMemo(() => (list.data ?? []).filter((o) => matches(o.countryCode)), [list.data, matches]);
  const truncated = (list.data?.length ?? 0) >= OFFICIALS_PAGE;

  const done = () => {
    setEditing(null);
    list.reload();
    void refresh();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <SearchBox value={q} onChange={setQ} placeholder={t("officials.searchPlaceholder")} className="min-w-[210px] flex-1 sm:max-w-xs" />
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: "all", label: t("officials.allKinds") },
            { value: "referee", label: t("officials.kinds.referee") },
            { value: "assistant", label: t("officials.kinds.assistant") },
          ]}
        />
        <SelectField
          label={t("officials.fields.status")}
          value={status}
          onChange={setStatus}
          placeholder={t("officials.allStatuses")}
          options={[...EDITABLE_STATUSES, "suspended" as const].map((s) => ({ value: s, label: t(`officials.status.${s}`) }))}
          className="w-44"
        />
        <Button variant="primary" className="ms-auto" onClick={() => setEditing("new")}>
          <UserPlus size={14} />
          {t("officials.register")}
        </Button>
      </div>

      {list.loading ? (
        <ListSkeleton rows={6} />
      ) : list.error ? (
        <ErrorState onRetry={list.reload} />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState title={t("officials.empty")} hint={t("officials.emptyHint")} />
        </Card>
      ) : (
        <>
          <p className="text-xs text-chalk-faint">
            {t("officials.count", { n: rows.length })}
            {truncated && <span className="ms-2 text-amber">{t("officials.truncated")}</span>}
          </p>
          <ResultsLive count={rows.length} />

          <ul className="space-y-2 lg:hidden">
            {rows.map((o) => (
              <li key={o.id} className="flex items-center gap-3 rounded-[14px] border border-line bg-ink-2 p-3">
                <Avatar initials={o.initials} photoUrl={o.photoUrl} name={o.name} size={38} />
                <Link href={refereeHref(o.id)} className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-chalk">{o.name}</p>
                  <p className="truncate text-xs text-chalk-faint">
                    {o.matricule ?? "—"} · {t(`officials.kinds.${o.kind}`)} · {o.level}
                  </p>
                </Link>
                <Badge tone={STATUS_TONE[o.status]}>{t(`officials.status.${o.status}`)}</Badge>
                <Button size="sm" variant="ghost" onClick={() => setEditing(o)} aria-label={`${t("officials.edit")} ${o.name}`}>
                  <Pencil size={13} />
                </Button>
              </li>
            ))}
          </ul>

          <Card padded={false} className="hidden lg:block">
            <div className="scroll-x">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-line">
                    <Th>{t("officials.fields.name")}</Th>
                    <Th>{t("officials.fields.matricule")}</Th>
                    <Th>{t("officials.fields.kind")}</Th>
                    <Th>{t("officials.fields.country")}</Th>
                    <Th>{t("officials.fields.level")}</Th>
                    <Th>{t("officials.fields.status")}</Th>
                    <Th>{t("officials.fields.licenceNo")}</Th>
                    <Th className="text-right">
                      <span className="sr-only">{t("officials.edit")}</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((o) => (
                    <tr key={o.id} className="border-b border-line last:border-0 row-hover">
                      <Td>
                        <Link href={refereeHref(o.id)} className="flex items-center gap-2.5">
                          <Avatar initials={o.initials} photoUrl={o.photoUrl} name={o.name} size={28} />
                          <span className="text-chalk hover:underline">{o.name}</span>
                        </Link>
                      </Td>
                      <Td className="font-mono text-xs">{o.matricule ?? "—"}</Td>
                      <Td>{t(`officials.kinds.${o.kind}`)}</Td>
                      <Td>
                        <CountryFlag code={o.countryCode} /> {countryName(o.countryCode, locale)}
                      </Td>
                      <Td>{o.level}</Td>
                      <Td>
                        <Badge tone={STATUS_TONE[o.status]}>{t(`officials.status.${o.status}`)}</Badge>
                      </Td>
                      <Td className="font-mono text-xs text-chalk-faint">{o.licenceNo ?? "—"}</Td>
                      <Td className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => setEditing(o)}>
                          <Pencil size={13} />
                          {t("officials.edit")}
                        </Button>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {editing && (
        <OfficialDialog
          file={editing === "new" ? undefined : editing}
          defaultCountry={country}
          onClose={() => setEditing(null)}
          onDone={done}
        />
      )}
    </div>
  );
}
