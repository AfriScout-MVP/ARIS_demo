"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, IdCard, Pencil } from "@/components/icons/glyphs";
import { Avatar, Badge, Button, Card, CardHeader, EmptyState } from "@/components/ui";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { ErrorState, ListSkeleton } from "@/components/admin/states";
import { getOfficial, type OfficialFile } from "@/lib/api/officials";
import { STATUS_TONE } from "@/lib/officials/forms";
import { useResource } from "@/lib/admin/hooks";
import { useDataset } from "@/lib/dataset/DatasetProvider";
import { countryName } from "@/lib/store";
import { useFormatters, useLocale, useT } from "@/lib/i18n/LocaleProvider";
import { ConflictsCard } from "./ConflictsCard";
import { DocumentsCard } from "./DocumentsCard";
import { OfficialDialog } from "./OfficialDialog";

function RegistryCard({ file, onEdit }: { file: OfficialFile; onEdit: () => void }) {
  const t = useT();
  const fmt = useFormatters();
  const none = t("officials.registry.none");
  const rows: Array<[string, string]> = [
    [t("officials.fields.matricule"), file.matricule ?? none],
    [t("officials.fields.licenceNo"), file.licenceNo ?? none],
    [t("officials.fields.kind"), t(`officials.kinds.${file.kind}`)],
    [t("officials.fields.nationality"), file.nationality ?? none],
    [t("officials.fields.birthDate"), file.birthDate ? fmt.date(file.birthDate) : none],
    [t("officials.fields.email"), file.email ?? none],
    [t("officials.fields.phone"), file.phone ?? none],
    [t("officials.fields.city"), [file.city, file.region].filter(Boolean).join(" · ") || none],
    [t("officials.fields.league"), file.league ?? none],
    [t("officials.fields.disciplines"), file.disciplines.map((d) => t(`officials.disciplines.${d}`)).join(", ") || none],
    [t("officials.fields.zones"), file.interventionZones.join(", ") || none],
    [t("officials.fields.updatedAt"), file.updatedAt ? fmt.date(file.updatedAt.slice(0, 10)) : none],
  ];
  return (
    <Card>
      <CardHeader
        icon={IdCard}
        tint="gold"
        title={t("officials.registry.title")}
        subtitle={t("officials.registry.subtitle")}
        action={
          <Button size="sm" variant="primary" onClick={onEdit}>
            <Pencil size={13} />
            {t("officials.editFile")}
          </Button>
        }
      />
      <dl className="grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-[11px] text-chalk-faint">{label}</dt>
            <dd className="truncate text-sm text-chalk" title={value}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

/**
 * What only the federation and the official see: the register entry, the documents, and the edit.
 * `standalone` renders a header too, for officials the rankings do not carry (assistants, the retired).
 */
export function OfficialFilePanels({ id, standalone = false }: { id: string; standalone?: boolean }) {
  const t = useT();
  const { locale } = useLocale();
  const { refresh } = useDataset();
  const detail = useResource(`official|${id}`, (signal) => getOfficial(id, signal));
  const [editing, setEditing] = useState(false);

  if (detail.loading) return <ListSkeleton rows={4} />;
  if (detail.error || !detail.data) {
    return standalone ? (
      <Card>
        <EmptyState title={t("referees.notFound")} />
      </Card>
    ) : (
      <ErrorState onRetry={detail.reload} />
    );
  }
  const file = detail.data.official;

  return (
    <div className="space-y-4">
      {standalone && (
        <>
          <Link href="/referees" className="inline-flex items-center gap-1.5 text-xs text-chalk-faint hover:text-chalk">
            <ArrowLeft size={14} />
            {t("referees.backToDirectory")}
          </Link>
          <Card>
            <div className="flex items-center gap-4">
              <Avatar initials={file.initials} photoUrl={file.photoUrl} name={file.name} size={56} tone="chalk" className="rounded-[14px]" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-display text-[22px] font-semibold text-chalk">{file.name}</h1>
                  <Badge tone="neutral">{file.level}</Badge>
                  <Badge tone={STATUS_TONE[file.status]}>{t(`officials.status.${file.status}`)}</Badge>
                </div>
                <p className="mt-1 text-xs text-chalk-faint">
                  <CountryFlag code={file.countryCode} /> {countryName(file.countryCode, locale)} · {t(`officials.kinds.${file.kind}`)}
                </p>
              </div>
            </div>
            <p className="mt-3 text-xs text-chalk-faint">{t("officials.fileOnly")}</p>
          </Card>
        </>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RegistryCard file={file} onEdit={() => setEditing(true)} />
        <DocumentsCard officialId={id} documents={detail.data.documents} canReview onChanged={detail.reload} />
        <ConflictsCard officialId={id} countryCode={file.countryCode} conflicts={detail.data.conflicts ?? []} canRemove onChanged={detail.reload} />
      </div>

      {editing && (
        <OfficialDialog
          file={file}
          onClose={() => setEditing(false)}
          onDone={() => {
            setEditing(false);
            detail.reload();
            void refresh(); // name, level and status also live in the snapshot the rankings read
          }}
        />
      )}
    </div>
  );
}
