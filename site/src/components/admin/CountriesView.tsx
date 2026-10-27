"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Upload } from "@/components/icons/glyphs";
import { Badge, Button, Card, EmptyState, Segmented, Td, Th } from "@/components/ui";
import { listCountries, patchCountry, uploadCountryFlag, type CountryRow } from "@/lib/api/admin";
import { ZONES, type ZoneCode } from "@/lib/admin/constants";
import { describeError } from "@/lib/admin/errors";
import { filterCountries } from "@/lib/admin/filters";
import { useResource } from "@/lib/admin/hooks";
import { countryLabel } from "@/lib/admin/labels";
import { useDataset } from "@/lib/dataset/DatasetProvider";
import { useLocale, useT } from "@/lib/i18n/LocaleProvider";
import { useToast } from "@/lib/toast/ToastProvider";
import { AdminPage } from "./AdminPage";
import { ConfirmDialog } from "./ConfirmDialog";
import { CountryFormDialog } from "./CountryDialogs";
import { Switch } from "./fields";
import { useImageUpload } from "./FilePicker";
import { RowMenu, type MenuItem } from "./RowMenu";
import { ErrorState, ListSkeleton, ResultsLive } from "./states";
import { Thumb } from "./Thumb";
import { SearchBox } from "./Toolbar";

type DialogState = { kind: "create" } | { kind: "edit"; country: CountryRow } | { kind: "deactivate"; country: CountryRow };

export function CountriesView() {
  const t = useT();
  const { locale } = useLocale();
  const toast = useToast();
  const { noteFailure } = useDataset();

  const countries = useResource("countries-all", (signal) => listCountries(true, signal));
  const upload = useImageUpload(uploadCountryFlag, countries.reload);

  const [q, setQ] = useState("");
  const [zone, setZone] = useState<ZoneCode | "all">("all");
  const [inactive, setInactive] = useState(true);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const rows = useMemo(() => filterCountries(countries.data ?? [], { q, zone, inactive }), [countries.data, q, zone, inactive]);

  const done = () => {
    setDialog(null);
    countries.reload();
  };

  async function activate(c: CountryRow) {
    setPending(c.code);
    try {
      await patchCountry(c.code, { active: true });
      toast.push("success", t("admin.countries.activated", { name: countryLabel(c, locale) }));
      countries.reload();
    } catch (err) {
      noteFailure(err);
      toast.push("error", t(describeError(err).key));
    } finally {
      setPending(null);
    }
  }

  const onToggle = (c: CountryRow, next: boolean) => (next ? void activate(c) : setDialog({ kind: "deactivate", country: c }));

  const menuFor = (c: CountryRow): MenuItem[] => [
    { key: "edit", label: t("admin.countries.edit"), icon: Pencil, onSelect: () => setDialog({ kind: "edit", country: c }) },
    { key: "flag", label: t("admin.countries.uploadFlag"), icon: Upload, disabled: upload.busyId === c.code, onSelect: () => upload.start(c.code) },
  ];

  const names = (c: CountryRow) => (
    <>
      <p className="font-semibold">{countryLabel(c, locale)}</p>
      <p className="mt-0.5 text-xs text-chalk-faint">
        <span lang="en">{c.name}</span> · <span lang="fr">{c.nameFr}</span> · <span lang="es">{c.nameEs}</span> · <span lang="de">{c.nameDe}</span>
      </p>
    </>
  );

  const fed = (c: CountryRow) =>
    c.federation ? (
      <Badge tone="var" className="max-w-full">
        {c.federation}
      </Badge>
    ) : (
      <span className="text-chalk-faint">{t("admin.countries.noFederation")}</span>
    );

  const toggle = (c: CountryRow) => (
    <Switch
      checked={c.active}
      disabled={pending === c.code}
      onChange={(next) => onToggle(c, next)}
      label={t(c.active ? "admin.countries.deactivateAria" : "admin.countries.activateAria", { name: countryLabel(c, locale) })}
    />
  );

  return (
    <AdminPage
      titleKey="admin.countries.title"
      subtitleKey="admin.countries.subtitle"
      action={
        <Button variant="primary" onClick={() => setDialog({ kind: "create" })}>
          <Plus size={16} />
          {t("admin.countries.new")}
        </Button>
      }
    >
      {upload.input}

      <div className="flex flex-wrap items-center gap-3">
        <SearchBox value={q} onChange={setQ} placeholder={t("admin.countries.searchPlaceholder")} label={t("admin.countries.search")} />
        <label className="inline-flex min-h-10 items-center gap-2 text-sm text-chalk-dim">
          <input type="checkbox" checked={inactive} onChange={(e) => setInactive(e.target.checked)} className="h-4 w-4 accent-red-600" />
          {t("admin.countries.showInactive")}
        </label>
      </div>
      <div className="scroll-x -mx-4 px-4 lg:mx-0 lg:px-0">
        <Segmented
          value={zone}
          onChange={setZone}
          options={[{ value: "all" as const, label: t("common.all") }, ...ZONES.map((z) => ({ value: z, label: z }))]}
        />
      </div>

      {countries.loading ? (
        <ListSkeleton rows={8} />
      ) : countries.error ? (
        <ErrorState onRetry={countries.reload} />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            title={(countries.data ?? []).length === 0 ? t("admin.countries.empty") : t("admin.common.noMatch")}
            hint={(countries.data ?? []).length === 0 ? t("admin.countries.emptyHint") : t("admin.common.noMatchHint")}
          />
        </Card>
      ) : (
        <>
          <ResultsLive count={rows.length} />

          <ul className="space-y-2 lg:hidden">
            {rows.map((c) => (
              <li key={c.code}>
                <Card className="p-4 sm:p-4">
                  <div className="flex items-start gap-3">
                    <Thumb url={c.flagUrl} kind="flag" size={30} />
                    <div className="min-w-0 flex-1 text-sm text-chalk">
                      {names(c)}
                      <p className="mt-1 text-xs text-chalk-dim">
                        {c.code} / {c.iso2} · {c.zone}
                      </p>
                    </div>
                    <RowMenu label={t("admin.countries.actionsFor", { name: countryLabel(c, locale) })} items={menuFor(c)} />
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                    <div>
                      <dt className="text-chalk-faint">{t("admin.countries.capital")}</dt>
                      <dd className="mt-0.5 text-chalk-dim">{c.capital}</dd>
                    </div>
                    <div>
                      <dt className="text-chalk-faint">{t("admin.countries.currency")}</dt>
                      <dd className="mt-0.5 text-chalk-dim">{c.currency}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-chalk-faint">{t("admin.countries.timezone")}</dt>
                      <dd className="mt-0.5 break-all text-chalk-dim">{c.timezone}</dd>
                    </div>
                    <div>
                      <dt className="text-chalk-faint">{t("admin.countries.federation")}</dt>
                      <dd className="mt-0.5">{fed(c)}</dd>
                    </div>
                    <div>
                      <dt className="mb-1 text-chalk-faint">{t("admin.countries.active")}</dt>
                      <dd>{toggle(c)}</dd>
                    </div>
                  </dl>
                </Card>
              </li>
            ))}
          </ul>

          <Card padded={false} className="hidden lg:block">
            <div className="scroll-x">
              <table className="w-full border-collapse">
                <caption className="sr-only">{t("admin.countries.title")}</caption>
                <thead>
                  <tr className="border-b border-line">
                    <Th>{t("admin.countries.flag")}</Th>
                    <Th>{t("admin.countries.codes")}</Th>
                    <Th>{t("admin.countries.names")}</Th>
                    <Th>{t("admin.countries.zone")}</Th>
                    <Th>{t("admin.countries.capital")}</Th>
                    <Th className="hidden 2xl:table-cell">{t("admin.countries.timezone")}</Th>
                    <Th>{t("admin.countries.currency")}</Th>
                    <Th>{t("admin.countries.federation")}</Th>
                    <Th>{t("admin.countries.active")}</Th>
                    <Th>
                      <span className="sr-only">{t("admin.common.actions")}</span>
                    </Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((c) => (
                    <tr key={c.code} className={c.active ? "hover:bg-red-500/[0.03]" : "opacity-70 hover:bg-red-500/[0.03]"}>
                      <Td>
                        <Thumb url={c.flagUrl} kind="flag" size={22} />
                      </Td>
                      <Td className="font-mono text-xs">
                        <span className="font-semibold">{c.code}</span> / {c.iso2}
                      </Td>
                      <Td className="min-w-56 whitespace-normal">{names(c)}</Td>
                      <Td>{c.zone}</Td>
                      <Td>{c.capital}</Td>
                      <Td className="hidden font-mono text-xs 2xl:table-cell">{c.timezone}</Td>
                      <Td>{c.currency}</Td>
                      <Td>{fed(c)}</Td>
                      <Td>{toggle(c)}</Td>
                      <Td className="text-end">
                        <RowMenu label={t("admin.countries.actionsFor", { name: countryLabel(c, locale) })} items={menuFor(c)} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {dialog?.kind === "create" && <CountryFormDialog onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === "edit" && <CountryFormDialog country={dialog.country} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === "deactivate" && (
        <ConfirmDialog
          title={t("admin.countries.deactivateTitle", { name: countryLabel(dialog.country, locale) })}
          confirmLabel={t("admin.countries.deactivate")}
          danger
          perform={() => patchCountry(dialog.country.code, { active: false })}
          onDone={() => {
            toast.push("success", t("admin.countries.deactivated", { name: countryLabel(dialog.country, locale) }));
            done();
          }}
          onCancel={() => setDialog(null)}
        >
          <p>{t("admin.countries.deactivateBody", { name: countryLabel(dialog.country, locale) })}</p>
          <p className="font-semibold text-chalk">
            {dialog.country.federation
              ? t("admin.countries.deactivatePortal", { federation: dialog.country.federation })
              : t("admin.countries.deactivateNoPortal")}
          </p>
        </ConfirmDialog>
      )}
    </AdminPage>
  );
}
