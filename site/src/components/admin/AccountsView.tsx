"use client";

import { useMemo, useState } from "react";
import { LockKeyhole, Plus, User as UserIcon, Users, Wand2 } from "@/components/icons/glyphs";
import { Avatar, Badge, Button, Card, EmptyState, Segmented, Td, Th } from "@/components/ui";
import { listCountries, listUsers, patchUser, type UserRow } from "@/lib/api/admin";
import { canManageUser, isAdmin, isSelf, type Actor } from "@/lib/admin/actor";
import { describeError } from "@/lib/admin/errors";
import { filterUsers } from "@/lib/admin/filters";
import { formatDateTime, initials } from "@/lib/admin/format";
import { useActor, useResource } from "@/lib/admin/hooks";
import { countryLabel, roleLabelKey, roleTone } from "@/lib/admin/labels";
import type { AdminRole } from "@/lib/admin/constants";
import { useDataset } from "@/lib/dataset/DatasetProvider";
import { useLocale, useT } from "@/lib/i18n/LocaleProvider";
import { useToast } from "@/lib/toast/ToastProvider";
import { localeLabels, localeTags } from "@/locales";
import { AdminPage } from "./AdminPage";
import { CreateAccountDialog, LanguageDialog, ResetPasswordDialog, RoleDialog } from "./AccountDialogs";
import { ConfirmDialog } from "./ConfirmDialog";
import { ErrorState, ListSkeleton, ResultsLive } from "./states";
import { RowMenu, type MenuItem } from "./RowMenu";
import { SearchBox } from "./Toolbar";
import { Thumb } from "./Thumb";

type DialogState =
  | { kind: "create" }
  | { kind: "reset"; user: UserRow }
  | { kind: "language"; user: UserRow }
  | { kind: "role"; user: UserRow }
  | { kind: "deactivate"; user: UserRow };

export function AccountsView() {
  const t = useT();
  const { locale } = useLocale();
  const toast = useToast();
  const { noteFailure } = useDataset();
  const actor = useActor() as Actor;
  const admin = isAdmin(actor);

  const users = useResource("users", (signal) => listUsers({}, signal));
  const countries = useResource("countries", (signal) => listCountries(false, signal));
  const countryByCode = useMemo(() => new Map((countries.data ?? []).map((c) => [c.code, c])), [countries.data]);

  const [q, setQ] = useState("");
  const [role, setRole] = useState<AdminRole | "all">("all");
  const [dialog, setDialog] = useState<DialogState | null>(null);

  const rows = useMemo(() => filterUsers(users.data ?? [], { q, role }), [users.data, q, role]);

  const done = () => {
    setDialog(null);
    users.reload();
  };

  async function activate(user: UserRow) {
    try {
      await patchUser(user.id, { active: true });
      toast.push("success", t("admin.accounts.activated", { name: user.name }));
      users.reload();
    } catch (err) {
      noteFailure(err);
      toast.push("error", t(describeError(err).key));
    }
  }

  function menuFor(user: UserRow): MenuItem[] {
    if (!canManageUser(actor, user)) return [];
    const self = isSelf(actor, user.id);
    const items: MenuItem[] = [];
    if (user.active) {
      items.push({ key: "deactivate", label: t("admin.accounts.deactivate"), icon: LockKeyhole, danger: true, disabled: self, onSelect: () => setDialog({ kind: "deactivate", user }) });
    } else {
      items.push({ key: "activate", label: t("admin.accounts.activate"), icon: UserIcon, onSelect: () => void activate(user) });
    }
    items.push({ key: "reset", label: t("admin.accounts.resetPassword"), icon: Wand2, onSelect: () => setDialog({ kind: "reset", user }) });
    items.push({ key: "language", label: t("admin.accounts.changeLanguage"), icon: Users, onSelect: () => setDialog({ kind: "language", user }) });
    if (admin) {
      items.push({ key: "role", label: t("admin.accounts.changeRole"), icon: UserIcon, disabled: self, onSelect: () => setDialog({ kind: "role", user }) });
    }
    return items;
  }

  const scopeCell = (u: UserRow) => {
    if (u.role === "admin") return <span className="text-chalk-faint">{t("admin.accounts.allCountries")}</span>;
    const country = u.country ? countryByCode.get(u.country) : undefined;
    return (
      <span className="inline-flex min-w-0 items-center gap-2">
        <Thumb url={country?.flagUrl} kind="flag" size={18} />
        <span className="min-w-0 truncate">
          {u.federationCode && <span className="font-semibold">{u.federationCode} · </span>}
          {u.country ? countryLabel(country ?? { code: u.country }, locale, u.country) : "—"}
        </span>
      </span>
    );
  };

  const lastLogin = (u: UserRow) => (u.lastLoginAt ? formatDateTime(u.lastLoginAt, localeTags[locale]) : t("admin.accounts.never"));

  return (
    <AdminPage
      titleKey="admin.accounts.title"
      subtitleKey={admin ? "admin.accounts.subtitleAdmin" : "admin.accounts.subtitleFederation"}
      action={
        <Button variant="primary" onClick={() => setDialog({ kind: "create" })}>
          <Plus size={16} />
          {t("admin.accounts.new")}
        </Button>
      }
    >
      {!admin && (
        <p role="note" className="rounded-lg border border-line bg-ink-2 px-3 py-2.5 text-sm text-chalk-dim">
          {t("admin.accounts.federationNote", { country: countryLabel(countryByCode.get(actor.country ?? ""), locale, actor.country ?? "") })}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <SearchBox value={q} onChange={setQ} placeholder={t("admin.accounts.searchPlaceholder")} label={t("admin.accounts.search")} />
        {admin && (
          <div className="scroll-x -mx-1 px-1">
            <Segmented
              value={role}
              onChange={setRole}
              options={[
                { value: "all" as const, label: t("common.all") },
                { value: "admin" as const, label: t("admin.roles.admin") },
                { value: "federation" as const, label: t("admin.roles.federation") },
                { value: "referee" as const, label: t("admin.roles.referee") },
              ]}
            />
          </div>
        )}
      </div>

      {users.loading ? (
        <ListSkeleton />
      ) : users.error ? (
        <ErrorState onRetry={users.reload} />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            title={(users.data ?? []).length === 0 ? t("admin.accounts.empty") : t("admin.common.noMatch")}
            hint={(users.data ?? []).length === 0 ? t("admin.accounts.emptyHint") : t("admin.common.noMatchHint")}
            action={
              (users.data ?? []).length === 0 ? (
                <Button variant="primary" onClick={() => setDialog({ kind: "create" })}>
                  <Plus size={16} />
                  {t("admin.accounts.new")}
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <>
          <ResultsLive count={rows.length} />

          <ul className="space-y-2 lg:hidden">
            {rows.map((u) => {
              const items = menuFor(u);
              return (
                <li key={u.id}>
                  <Card className="p-4 sm:p-4">
                    <div className="flex items-start gap-3">
                      <Avatar initials={initials(u.name)} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-chalk">{u.name}</p>
                        <p className="truncate text-xs text-chalk-faint">{u.email}</p>
                      </div>
                      {items.length > 0 && <RowMenu label={t("admin.accounts.actionsFor", { name: u.name })} items={items} />}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Badge tone={roleTone(u.role)}>{t(roleLabelKey(u.role))}</Badge>
                      <Badge tone={u.active ? "pitch" : "neutral"}>{t(u.active ? "admin.accounts.active" : "admin.accounts.inactive")}</Badge>
                      <Badge>{localeLabels[u.locale] ?? u.locale}</Badge>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                      <div className="min-w-0">
                        <dt className="text-chalk-faint">{t("admin.accounts.scope")}</dt>
                        <dd className="mt-0.5 text-chalk-dim">{scopeCell(u)}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-chalk-faint">{t("admin.accounts.official")}</dt>
                        <dd className="mt-0.5 truncate text-chalk-dim">{u.officialName ?? u.officialId ?? "—"}</dd>
                      </div>
                      <div className="col-span-2">
                        <dt className="text-chalk-faint">{t("admin.accounts.lastLogin")}</dt>
                        <dd className="mt-0.5 text-chalk-dim">{lastLogin(u)}</dd>
                      </div>
                    </dl>
                  </Card>
                </li>
              );
            })}
          </ul>

          <Card padded={false} className="hidden lg:block">
            <div className="scroll-x">
              <table className="w-full border-collapse">
                <caption className="sr-only">{t("admin.accounts.title")}</caption>
                <thead>
                  <tr className="border-b border-line">
                    <Th>{t("admin.accounts.account")}</Th>
                    <Th>{t("admin.accounts.role")}</Th>
                    <Th>{t("admin.accounts.scope")}</Th>
                    <Th>{t("admin.accounts.official")}</Th>
                    <Th>{t("admin.accounts.status")}</Th>
                    <Th>{t("admin.accounts.lastLogin")}</Th>
                    <Th>
                      <span className="sr-only">{t("admin.common.actions")}</span>
                    </Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((u) => {
                    const items = menuFor(u);
                    return (
                      <tr key={u.id} className="hover:bg-red-500/[0.03]">
                        <Td>
                          <div className="flex items-center gap-3">
                            <Avatar initials={initials(u.name)} />
                            <div className="min-w-0">
                              <p className="max-w-56 truncate font-semibold">{u.name}</p>
                              <p className="max-w-56 truncate text-xs text-chalk-faint">{u.email}</p>
                            </div>
                          </div>
                        </Td>
                        <Td>
                          <Badge tone={roleTone(u.role)}>{t(roleLabelKey(u.role))}</Badge>
                        </Td>
                        <Td className="max-w-56">{scopeCell(u)}</Td>
                        <Td className="max-w-48 truncate">{u.officialName ?? u.officialId ?? "—"}</Td>
                        <Td>
                          <Badge tone={u.active ? "pitch" : "neutral"}>{t(u.active ? "admin.accounts.active" : "admin.accounts.inactive")}</Badge>
                        </Td>
                        <Td className="text-chalk-dim">{lastLogin(u)}</Td>
                        <Td className="text-end">
                          {items.length > 0 ? (
                            <RowMenu label={t("admin.accounts.actionsFor", { name: u.name })} items={items} />
                          ) : (
                            <span className="text-xs text-chalk-faint">{t("admin.accounts.readOnly")}</span>
                          )}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {dialog?.kind === "create" && <CreateAccountDialog actor={actor} onClose={() => setDialog(null)} onCreated={done} />}
      {dialog?.kind === "reset" && <ResetPasswordDialog user={dialog.user} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === "language" && <LanguageDialog user={dialog.user} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === "role" && <RoleDialog user={dialog.user} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === "deactivate" && (
        <ConfirmDialog
          title={t("admin.accounts.deactivateTitle")}
          confirmLabel={t("admin.accounts.deactivate")}
          danger
          perform={() => patchUser(dialog.user.id, { active: false })}
          onDone={() => {
            toast.push("success", t("admin.accounts.deactivated", { name: dialog.user.name }));
            done();
          }}
          onCancel={() => setDialog(null)}
        >
          <p>{t("admin.accounts.deactivateBody", { name: dialog.user.name })}</p>
        </ConfirmDialog>
      )}
    </AdminPage>
  );
}

