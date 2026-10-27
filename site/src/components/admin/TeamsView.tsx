"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2, Upload } from "@/components/icons/glyphs";
import { Badge, Button, Card, EmptyState, Segmented, Td, Th } from "@/components/ui";
import { deleteStadium, deleteTeam, listCountries, listStadiums, listTeams, uploadTeamLogo, type StadiumRow, type TeamRow } from "@/lib/api/admin";
import { isAdmin, type Actor } from "@/lib/admin/actor";
import type { TeamKind } from "@/lib/admin/constants";
import { filterTeams, matches } from "@/lib/admin/filters";
import { useActor, useResource } from "@/lib/admin/hooks";
import { countryLabel, teamKindKey } from "@/lib/admin/labels";
import { useLocale, useT } from "@/lib/i18n/LocaleProvider";
import { useToast } from "@/lib/toast/ToastProvider";
import { AdminPage } from "./AdminPage";
import { ConfirmDialog } from "./ConfirmDialog";
import { SelectField } from "./fields";
import { useImageUpload } from "./FilePicker";
import { RowMenu } from "./RowMenu";
import { ErrorState, ListSkeleton, ResultsLive } from "./states";
import { StadiumFormDialog, TeamFormDialog } from "./TeamDialogs";
import { Thumb } from "./Thumb";
import { SearchBox } from "./Toolbar";

type Tab = "teams" | "stadiums";
type DialogState =
  | { kind: "team"; team?: TeamRow }
  | { kind: "stadium"; stadium?: StadiumRow }
  | { kind: "deleteTeam"; team: TeamRow }
  | { kind: "deleteStadium"; stadium: StadiumRow };

export function TeamsView() {
  const t = useT();
  const { locale } = useLocale();
  const actor = useActor() as Actor;
  const admin = isAdmin(actor);
  const toast = useToast();

  const countries = useResource("countries", (signal) => listCountries(false, signal));
  const [picked, setPicked] = useState("");
  const country = admin ? picked || countries.data?.[0]?.code || "" : (actor.country ?? "");
  const countryRow = countries.data?.find((c) => c.code === country);

  const [tab, setTab] = useState<Tab>("teams");
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<TeamKind | "all">("all");
  const [dialog, setDialog] = useState<DialogState | null>(null);

  const teams = useResource(`teams|${country}`, (signal) => listTeams(country, signal), country !== "" && tab === "teams");
  const stadiums = useResource(`stadiums|${country}`, (signal) => listStadiums(country, signal), country !== "" && tab === "stadiums");
  const upload = useImageUpload(uploadTeamLogo, teams.reload);

  const teamRows = useMemo(() => filterTeams(teams.data ?? [], { q, kind }), [teams.data, q, kind]);
  const stadiumRows = useMemo(() => (stadiums.data ?? []).filter((s) => matches([s.name, s.city], q)), [stadiums.data, q]);

  const done = () => {
    setDialog(null);
    (tab === "teams" ? teams : stadiums).reload();
  };

  const stadiumMenu = (s: StadiumRow) => [
    { key: "edit", label: t("admin.teams.edit"), icon: Pencil, onSelect: () => setDialog({ kind: "stadium", stadium: s }) },
    { key: "delete", label: t("admin.teams.delete"), icon: Trash2, danger: true, onSelect: () => setDialog({ kind: "deleteStadium", stadium: s }) },
  ];

  const fmt = (n: number | null) => (n === null ? "—" : n.toLocaleString(locale));
  const current = tab === "teams" ? teams : stadiums;
  const noCountry = !countries.loading && country === "";

  return (
    <AdminPage
      titleKey="admin.teams.title"
      subtitleKey={admin ? "admin.teams.subtitleAdmin" : "admin.teams.subtitleFederation"}
      action={
        country ? (
          <Button variant="primary" onClick={() => setDialog(tab === "teams" ? { kind: "team" } : { kind: "stadium" })}>
            <Plus size={16} />
            {t(tab === "teams" ? "admin.teams.newTeam" : "admin.teams.newStadium")}
          </Button>
        ) : undefined
      }
    >
      {upload.input}

      <div className="flex flex-wrap items-end gap-3">
        <SelectField
          className="w-full sm:w-72"
          label={t("admin.teams.country")}
          value={country}
          onChange={setPicked}
          disabled={!admin}
          hint={admin ? undefined : t("admin.teams.lockedCountry")}
          options={
            admin
              ? (countries.data ?? []).map((c) => ({ value: c.code, label: `${countryLabel(c, locale)} (${c.code})` }))
              : [{ value: country, label: countryLabel(countryRow ?? { code: country }, locale, country) }]
          }
        />
        {countryRow && <Thumb url={countryRow.flagUrl} kind="flag" size={28} />}
      </div>

      <div className="scroll-x -mx-4 px-4 lg:mx-0 lg:px-0">
        <Segmented
          value={tab}
          onChange={(next) => {
            setTab(next);
            setQ("");
          }}
          options={[
            { value: "teams" as const, label: t("admin.teams.tabTeams") },
            { value: "stadiums" as const, label: t("admin.teams.tabStadiums") },
          ]}
        />
      </div>

      {countries.error ? (
        <ErrorState onRetry={countries.reload} />
      ) : noCountry ? (
        <Card>
          <EmptyState title={t("admin.teams.pickCountry")} hint={t("admin.teams.pickCountryHint")} />
        </Card>
      ) : (
        <div role="tabpanel" aria-label={t(tab === "teams" ? "admin.teams.tabTeams" : "admin.teams.tabStadiums")} className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <SearchBox
              value={q}
              onChange={setQ}
              placeholder={t(tab === "teams" ? "admin.teams.searchTeams" : "admin.teams.searchStadiums")}
              label={t("common.search")}
            />
            {tab === "teams" && (
              <div className="scroll-x -mx-1 px-1">
                <Segmented
                  value={kind}
                  onChange={setKind}
                  options={[
                    { value: "all" as const, label: t("common.all") },
                    { value: "club" as const, label: t("admin.teams.kinds.club") },
                    { value: "national" as const, label: t("admin.teams.kinds.national") },
                  ]}
                />
              </div>
            )}
          </div>

          {countries.loading || current.loading ? (
            <ListSkeleton />
          ) : current.error ? (
            <ErrorState onRetry={current.reload} />
          ) : tab === "teams" ? (
            teamRows.length === 0 ? (
              <Card>
                <EmptyState
                  title={(teams.data ?? []).length === 0 ? t("admin.teams.emptyTeams") : t("admin.common.noMatch")}
                  hint={(teams.data ?? []).length === 0 ? t("admin.teams.emptyTeamsHint") : t("admin.common.noMatchHint")}
                  action={
                    (teams.data ?? []).length === 0 ? (
                      <Button variant="primary" onClick={() => setDialog({ kind: "team" })}>
                        <Plus size={16} />
                        {t("admin.teams.newTeam")}
                      </Button>
                    ) : undefined
                  }
                />
              </Card>
            ) : (
              <>
                <ResultsLive count={teamRows.length} />
                <ul className="space-y-2 lg:hidden">
                  {teamRows.map((tm) => (
                    <li key={tm.id}>
                      <Card className="p-4 sm:p-4">
                        <div className="flex items-start gap-3">
                          <Thumb url={tm.logoUrl} kind="team" size={36} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-chalk">{tm.name}</p>
                            <p className="text-xs text-chalk-faint">{[tm.shortName, tm.city].filter(Boolean).join(" · ") || "—"}</p>
                            <div className="mt-2">
                              <Badge tone={tm.kind === "national" ? "gold" : "neutral"}>{t(teamKindKey(tm.kind))}</Badge>
                            </div>
                          </div>
                          <TeamMenu team={tm} onEdit={() => setDialog({ kind: "team", team: tm })} onLogo={() => upload.start(tm.id)} onDelete={() => setDialog({ kind: "deleteTeam", team: tm })} busy={upload.busyId === tm.id} />
                        </div>
                      </Card>
                    </li>
                  ))}
                </ul>
                <Card padded={false} className="hidden lg:block">
                  <div className="scroll-x">
                    <table className="w-full border-collapse">
                      <caption className="sr-only">{t("admin.teams.tabTeams")}</caption>
                      <thead>
                        <tr className="border-b border-line">
                          <Th>{t("admin.teams.name")}</Th>
                          <Th>{t("admin.teams.shortName")}</Th>
                          <Th>{t("admin.teams.kind")}</Th>
                          <Th>{t("admin.teams.city")}</Th>
                          <Th>
                            <span className="sr-only">{t("admin.common.actions")}</span>
                          </Th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {teamRows.map((tm) => (
                          <tr key={tm.id} className="hover:bg-red-500/[0.03]">
                            <Td>
                              <span className="inline-flex items-center gap-3">
                                <Thumb url={tm.logoUrl} kind="team" size={30} />
                                <span className="max-w-72 truncate font-semibold">{tm.name}</span>
                              </span>
                            </Td>
                            <Td>{tm.shortName ?? "—"}</Td>
                            <Td>
                              <Badge tone={tm.kind === "national" ? "gold" : "neutral"}>{t(teamKindKey(tm.kind))}</Badge>
                            </Td>
                            <Td>{tm.city ?? "—"}</Td>
                            <Td className="text-end">
                              <TeamMenu team={tm} onEdit={() => setDialog({ kind: "team", team: tm })} onLogo={() => upload.start(tm.id)} onDelete={() => setDialog({ kind: "deleteTeam", team: tm })} busy={upload.busyId === tm.id} />
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </>
            )
          ) : stadiumRows.length === 0 ? (
            <Card>
              <EmptyState
                title={(stadiums.data ?? []).length === 0 ? t("admin.teams.emptyStadiums") : t("admin.common.noMatch")}
                hint={(stadiums.data ?? []).length === 0 ? t("admin.teams.emptyStadiumsHint") : t("admin.common.noMatchHint")}
                action={
                  (stadiums.data ?? []).length === 0 ? (
                    <Button variant="primary" onClick={() => setDialog({ kind: "stadium" })}>
                      <Plus size={16} />
                      {t("admin.teams.newStadium")}
                    </Button>
                  ) : undefined
                }
              />
            </Card>
          ) : (
            <>
              <ResultsLive count={stadiumRows.length} />
              <ul className="space-y-2 lg:hidden">
                {stadiumRows.map((s) => (
                  <li key={s.id}>
                    <Card className="p-4 sm:p-4">
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-chalk">{s.name}</p>
                          <p className="text-xs text-chalk-faint">
                            {s.city ?? "—"} · {t("admin.teams.capacityValue", { count: fmt(s.capacity) })}
                          </p>
                        </div>
                        <RowMenu
                          label={t("admin.teams.actionsFor", { name: s.name })}
                          items={stadiumMenu(s)}
                        />
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
              <Card padded={false} className="hidden lg:block">
                <div className="scroll-x">
                  <table className="w-full border-collapse">
                    <caption className="sr-only">{t("admin.teams.tabStadiums")}</caption>
                    <thead>
                      <tr className="border-b border-line">
                        <Th>{t("admin.teams.name")}</Th>
                        <Th>{t("admin.teams.city")}</Th>
                        <Th className="text-end">{t("admin.teams.capacity")}</Th>
                        <Th>
                          <span className="sr-only">{t("admin.common.actions")}</span>
                        </Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {stadiumRows.map((s) => (
                        <tr key={s.id} className="hover:bg-red-500/[0.03]">
                          <Td className="font-semibold">{s.name}</Td>
                          <Td>{s.city ?? "—"}</Td>
                          <Td className="text-end tnum">{fmt(s.capacity)}</Td>
                          <Td className="text-end">
                            <RowMenu
                              label={t("admin.teams.actionsFor", { name: s.name })}
                              items={stadiumMenu(s)}
                            />
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </div>
      )}

      {dialog?.kind === "team" && <TeamFormDialog country={country} team={dialog.team} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === "stadium" && <StadiumFormDialog country={country} stadium={dialog.stadium} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === "deleteTeam" && (
        <ConfirmDialog
          title={t("admin.teams.deleteTeamTitle")}
          confirmLabel={t("admin.teams.delete")}
          danger
          perform={() => deleteTeam(dialog.team.id)}
          onDone={() => {
            toast.push("success", t("admin.teams.teamDeleted", { name: dialog.team.name }));
            done();
          }}
          onCancel={() => setDialog(null)}
        >
          <p>{t("admin.teams.deleteTeamBody", { name: dialog.team.name })}</p>
        </ConfirmDialog>
      )}
      {dialog?.kind === "deleteStadium" && (
        <ConfirmDialog
          title={t("admin.teams.deleteStadiumTitle")}
          confirmLabel={t("admin.teams.delete")}
          danger
          perform={() => deleteStadium(dialog.stadium.id)}
          onDone={() => {
            toast.push("success", t("admin.teams.stadiumDeleted", { name: dialog.stadium.name }));
            done();
          }}
          onCancel={() => setDialog(null)}
        >
          <p>{t("admin.teams.deleteStadiumBody", { name: dialog.stadium.name })}</p>
        </ConfirmDialog>
      )}
    </AdminPage>
  );
}

function TeamMenu({ team, onEdit, onLogo, onDelete, busy }: { team: TeamRow; onEdit: () => void; onLogo: () => void; onDelete: () => void; busy: boolean }) {
  const t = useT();
  return (
    <RowMenu
      label={t("admin.teams.actionsFor", { name: team.name })}
      items={[
        { key: "edit", label: t("admin.teams.edit"), icon: Pencil, onSelect: onEdit },
        { key: "logo", label: t("admin.teams.uploadLogo"), icon: Upload, disabled: busy, onSelect: onLogo },
        { key: "delete", label: t("admin.teams.delete"), icon: Trash2, danger: true, onSelect: onDelete },
      ]}
    />
  );
}
