"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Landmark, Pencil, Plus, ShieldAlert, Upload, UserPlus } from "@/components/icons/glyphs";
import { Badge, Button, Card, EmptyState, Td, Th } from "@/components/ui";
import {
  listCountries,
  listFederations,
  patchFederation,
  uploadFederationLogo,
  type FederationRow,
} from "@/lib/api/admin";
import type { Actor } from "@/lib/admin/actor";
import { matches } from "@/lib/admin/filters";
import { useActor, useResource } from "@/lib/admin/hooks";
import { countryLabel, federationStatusKey } from "@/lib/admin/labels";
import { useLocale, useT } from "@/lib/i18n/LocaleProvider";
import { useToast } from "@/lib/toast/ToastProvider";
import { AdminPage } from "./AdminPage";
import { CreateAccountDialog } from "./AccountDialogs";
import { ConfirmDialog } from "./ConfirmDialog";
import { FederationFormDialog } from "./FederationDialogs";
import { useImageUpload } from "./FilePicker";
import { RowMenu, type MenuItem } from "./RowMenu";
import { SeatsPanel } from "./SeatsPanel";
import { ErrorState, ListSkeleton, ResultsLive } from "./states";
import { Thumb } from "./Thumb";
import { SearchBox } from "./Toolbar";

type DialogState =
  | { kind: "create" }
  | { kind: "edit"; federation: FederationRow }
  | { kind: "status"; federation: FederationRow }
  | { kind: "seat"; federation: FederationRow };

export function FederationsView() {
  const t = useT();
  const { locale } = useLocale();
  const toast = useToast();
  const actor = useActor() as Actor;

  const federations = useResource("federations", (signal) => listFederations(signal));
  const countries = useResource("countries-all", (signal) => listCountries(true, signal));
  const countryByCode = useMemo(() => new Map((countries.data ?? []).map((c) => [c.code, c])), [countries.data]);

  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [seatsVersion, setSeatsVersion] = useState(0);
  const [dialog, setDialog] = useState<DialogState | null>(null);

  const upload = useImageUpload(uploadFederationLogo, federations.reload);

  const rows = useMemo(
    () => (federations.data ?? []).filter((f) => matches([f.code, f.name, f.countryName, f.country], q)),
    [federations.data, q],
  );

  const taken = new Set((federations.data ?? []).map((f) => f.country));
  const freeCountries = (countries.data ?? []).filter((c) => c.active && !c.federation && !taken.has(c.code));

  const done = () => {
    setDialog(null);
    federations.reload();
  };

  const menuFor = (f: FederationRow): MenuItem[] => [
    { key: "edit", label: t("admin.federations.edit"), icon: Pencil, onSelect: () => setDialog({ kind: "edit", federation: f }) },
    { key: "logo", label: t("admin.federations.uploadLogo"), icon: Upload, disabled: upload.busyId === f.id, onSelect: () => upload.start(f.id) },
    { key: "seat", label: t("admin.federations.addSeat"), icon: UserPlus, disabled: f.status !== "active", onSelect: () => setDialog({ kind: "seat", federation: f }) },
    f.status === "active"
      ? { key: "suspend", label: t("admin.federations.suspend"), icon: ShieldAlert, danger: true, onSelect: () => setDialog({ kind: "status", federation: f }) }
      : { key: "reactivate", label: t("admin.federations.reactivate"), icon: Landmark, onSelect: () => setDialog({ kind: "status", federation: f }) },
  ];

  const countryCell = (f: FederationRow) => {
    const c = countryByCode.get(f.country);
    return (
      <span className="inline-flex min-w-0 items-center gap-2">
        <Thumb url={c?.flagUrl} kind="flag" size={18} />
        <span className="truncate">{c ? countryLabel(c, locale) : f.countryName}</span>
      </span>
    );
  };

  const statusBadge = (f: FederationRow) => (
    <Badge tone={f.status === "active" ? "pitch" : "amber"}>{t(federationStatusKey(f.status))}</Badge>
  );

  const toggle = (id: string) => setOpen((cur) => (cur === id ? null : id));

  return (
    <AdminPage
      titleKey="admin.federations.title"
      subtitleKey="admin.federations.subtitle"
      action={
        <Button variant="primary" onClick={() => setDialog({ kind: "create" })}>
          <Plus size={16} />
          {t("admin.federations.new")}
        </Button>
      }
    >
      {upload.input}
      <SearchBox value={q} onChange={setQ} placeholder={t("admin.federations.searchPlaceholder")} label={t("admin.federations.search")} />

      {federations.loading ? (
        <ListSkeleton />
      ) : federations.error ? (
        <ErrorState onRetry={federations.reload} />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            title={(federations.data ?? []).length === 0 ? t("admin.federations.empty") : t("admin.common.noMatch")}
            hint={(federations.data ?? []).length === 0 ? t("admin.federations.emptyHint") : t("admin.common.noMatchHint")}
          />
        </Card>
      ) : (
        <>
          <ResultsLive count={rows.length} />

          <ul className="space-y-2 lg:hidden">
            {rows.map((f) => {
              const expanded = open === f.id;
              return (
                <li key={f.id}>
                  <Card padded={false}>
                    <div className="flex items-start gap-3 p-4">
                      <Thumb url={f.logoUrl} kind="federation" size={40} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-chalk">
                          {f.code} <span className="font-normal text-chalk-dim">· {f.name}</span>
                        </p>
                        <p className="mt-0.5 text-xs text-chalk-dim">{countryCell(f)}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {statusBadge(f)}
                          <Badge>{t("admin.federations.seatCount", { count: f.seats })}</Badge>
                        </div>
                      </div>
                      <RowMenu label={t("admin.federations.actionsFor", { name: f.code })} items={menuFor(f)} />
                    </div>
                    <button
                      type="button"
                      aria-expanded={expanded}
                      aria-controls={`seats-${f.id}`}
                      onClick={() => toggle(f.id)}
                      className="flex min-h-11 w-full items-center gap-2 border-t border-line px-4 text-sm font-medium text-chalk-dim hover:text-chalk"
                    >
                      {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      {t(expanded ? "admin.federations.hideSeats" : "admin.federations.showSeats")}
                    </button>
                    {expanded && (
                      <div id={`seats-${f.id}`}>
                        <SeatsPanel federation={f} version={seatsVersion} onAdd={() => setDialog({ kind: "seat", federation: f })} />
                      </div>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>

          <Card padded={false} className="hidden lg:block">
            <div className="scroll-x">
              <table className="w-full border-collapse">
                <caption className="sr-only">{t("admin.federations.title")}</caption>
                <thead>
                  <tr className="border-b border-line">
                    <Th>
                      <span className="sr-only">{t("admin.federations.showSeats")}</span>
                    </Th>
                    <Th>{t("admin.federations.code")}</Th>
                    <Th>{t("admin.federations.name")}</Th>
                    <Th>{t("admin.federations.country")}</Th>
                    <Th>{t("admin.federations.status")}</Th>
                    <Th className="text-end">{t("admin.federations.seats")}</Th>
                    <Th>
                      <span className="sr-only">{t("admin.common.actions")}</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((f) => {
                    const expanded = open === f.id;
                    return (
                      <Fragment key={f.id}>
                        <tr className="border-b border-line hover:bg-red-500/[0.03]">
                          <Td className="w-10 !px-2">
                            <button
                              type="button"
                              aria-expanded={expanded}
                              aria-controls={`seats-${f.id}`}
                              aria-label={t(expanded ? "admin.federations.hideSeats" : "admin.federations.showSeats")}
                              onClick={() => toggle(f.id)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-chalk-dim hover:bg-red-500/10 hover:text-chalk"
                            >
                              {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </button>
                          </Td>
                          <Td className="font-semibold">{f.code}</Td>
                          <Td>
                            <span className="inline-flex items-center gap-3">
                              <Thumb url={f.logoUrl} kind="federation" size={32} />
                              <span className="max-w-72 truncate">{f.name}</span>
                            </span>
                          </Td>
                          <Td>{countryCell(f)}</Td>
                          <Td>{statusBadge(f)}</Td>
                          <Td className="text-end tnum">{f.seats}</Td>
                          <Td className="text-end">
                            <RowMenu label={t("admin.federations.actionsFor", { name: f.code })} items={menuFor(f)} />
                          </Td>
                        </tr>
                        {expanded && (
                          <tr className="border-b border-line">
                            <td colSpan={7} id={`seats-${f.id}`} className="p-0">
                              <SeatsPanel federation={f} version={seatsVersion} onAdd={() => setDialog({ kind: "seat", federation: f })} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {dialog?.kind === "create" && <FederationFormDialog freeCountries={freeCountries} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === "edit" && <FederationFormDialog federation={dialog.federation} freeCountries={[]} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === "seat" && (
        <CreateAccountDialog
          actor={actor}
          preset={{ role: "federation", federationId: dialog.federation.id, federationLabel: `${dialog.federation.code} — ${dialog.federation.name}` }}
          onClose={() => setDialog(null)}
          onCreated={() => {
            setSeatsVersion((n) => n + 1);
            done();
          }}
        />
      )}
      {dialog?.kind === "status" && (
        <ConfirmDialog
          title={t(dialog.federation.status === "active" ? "admin.federations.suspendTitle" : "admin.federations.reactivateTitle", { code: dialog.federation.code })}
          confirmLabel={t(dialog.federation.status === "active" ? "admin.federations.suspend" : "admin.federations.reactivate")}
          danger={dialog.federation.status === "active"}
          perform={() => patchFederation(dialog.federation.id, { status: dialog.federation.status === "active" ? "suspended" : "active" })}
          onDone={() => {
            toast.push("success", t(dialog.federation.status === "active" ? "admin.federations.suspended" : "admin.federations.reactivated", { code: dialog.federation.code }));
            setSeatsVersion((n) => n + 1);
            done();
          }}
          onCancel={() => setDialog(null)}
        >
          {dialog.federation.status === "active" ? (
            <>
              <p>{t("admin.federations.suspendBody", { name: dialog.federation.name, country: dialog.federation.countryName })}</p>
              <p className="font-semibold text-chalk">{t("admin.federations.suspendSeats", { count: dialog.federation.seats })}</p>
            </>
          ) : (
            <p>{t("admin.federations.reactivateBody", { name: dialog.federation.name })}</p>
          )}
        </ConfirmDialog>
      )}
    </AdminPage>
  );
}
