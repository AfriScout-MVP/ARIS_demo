"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { createStadium, createTeam, patchStadium, patchTeam, type StadiumRow, type TeamRow } from "@/lib/api/admin";
import { TEAM_KINDS, type TeamKind } from "@/lib/admin/constants";
import {
  hasErrors,
  toStadiumBody,
  toStadiumPatch,
  toTeamBody,
  toTeamPatch,
  validateStadium,
  validateTeam,
  type FormErrors,
  type StadiumValues,
  type TeamValues,
} from "@/lib/admin/forms";
import { useAction } from "@/lib/admin/hooks";
import { teamKindKey } from "@/lib/admin/labels";
import { useT } from "@/lib/i18n/LocaleProvider";
import { useToast } from "@/lib/toast/ToastProvider";
import { Dialog } from "./Dialog";
import { fieldMessage, FormError, SelectField, TextField } from "./fields";

function Footer({ busy, onClose, submit }: { busy: boolean; onClose: () => void; submit: string }) {
  const t = useT();
  return (
    <>
      <Button type="button" onClick={onClose} disabled={busy}>
        {t("common.cancel")}
      </Button>
      <Button type="submit" variant="primary" disabled={busy}>
        {busy ? t("admin.common.working") : submit}
      </Button>
    </>
  );
}

export function TeamFormDialog({ country, team, onClose, onDone }: { country: string; team?: TeamRow; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const toast = useToast();
  const { busy, error, serverFields, run } = useAction();
  const [values, setValues] = useState<TeamValues>({
    name: team?.name ?? "",
    shortName: team?.shortName ?? "",
    kind: team?.kind ?? "club",
    city: team?.city ?? "",
  });
  const [errors, setErrors] = useState<FormErrors<"name" | "shortName" | "kind">>({});
  const set = (key: keyof TeamValues, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };
  const msg = (f: "name" | "shortName" | "kind") => fieldMessage(t, errors, serverFields, f);

  async function submit() {
    const found = validateTeam(values);
    setErrors(found);
    if (hasErrors(found)) return;
    const result = await run(() => (team ? patchTeam(team.id, toTeamPatch(values)) : createTeam(country, toTeamBody(values))));
    if (result.ok) {
      toast.push("success", t(team ? "admin.teams.teamUpdated" : "admin.teams.teamCreated", { name: values.name.trim() }));
      onDone();
    }
  }

  return (
    <Dialog
      title={t(team ? "admin.teams.editTeam" : "admin.teams.newTeam")}
      description={country}
      onClose={onClose}
      onSubmit={() => void submit()}
      busy={busy}
      footer={<Footer busy={busy} onClose={onClose} submit={t(team ? "common.save" : "admin.teams.createTeam")} />}
    >
      <TextField label={t("admin.teams.name")} value={values.name} onChange={(v) => set("name", v)} error={msg("name")} required autoComplete="off" />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label={t("admin.teams.shortName")} value={values.shortName} onChange={(v) => set("shortName", v)} error={msg("shortName")} maxLength={20} autoComplete="off" />
        <SelectField
          label={t("admin.teams.kind")}
          value={values.kind}
          onChange={(v) => set("kind", v as TeamKind)}
          options={TEAM_KINDS.map((k) => ({ value: k, label: t(teamKindKey(k)) }))}
          error={msg("kind")}
          required
        />
      </div>
      <TextField label={t("admin.teams.city")} value={values.city} onChange={(v) => set("city", v)} autoComplete="off" />
      <FormError error={error} />
    </Dialog>
  );
}

export function StadiumFormDialog({ country, stadium, onClose, onDone }: { country: string; stadium?: StadiumRow; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const toast = useToast();
  const { busy, error, serverFields, run } = useAction();
  const [values, setValues] = useState<StadiumValues>({
    name: stadium?.name ?? "",
    city: stadium?.city ?? "",
    capacity: stadium?.capacity != null ? String(stadium.capacity) : "",
  });
  const [errors, setErrors] = useState<FormErrors<"name" | "city" | "capacity">>({});
  const set = (key: keyof StadiumValues, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };
  const msg = (f: "name" | "city" | "capacity") => fieldMessage(t, errors, serverFields, f);

  async function submit() {
    const found = validateStadium(values);
    setErrors(found);
    if (hasErrors(found)) return;
    const result = await run(() => (stadium ? patchStadium(stadium.id, toStadiumPatch(values)) : createStadium(country, toStadiumBody(values))));
    if (result.ok) {
      toast.push("success", t(stadium ? "admin.teams.stadiumUpdated" : "admin.teams.stadiumCreated", { name: values.name.trim() }));
      onDone();
    }
  }

  return (
    <Dialog
      title={t(stadium ? "admin.teams.editStadium" : "admin.teams.newStadium")}
      description={country}
      onClose={onClose}
      onSubmit={() => void submit()}
      busy={busy}
      footer={<Footer busy={busy} onClose={onClose} submit={t(stadium ? "common.save" : "admin.teams.createStadium")} />}
    >
      <TextField label={t("admin.teams.name")} value={values.name} onChange={(v) => set("name", v)} error={msg("name")} required autoComplete="off" />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label={t("admin.teams.city")} value={values.city} onChange={(v) => set("city", v)} error={msg("city")} required autoComplete="off" />
        <TextField
          label={t("admin.teams.capacity")}
          value={values.capacity}
          onChange={(v) => set("capacity", v)}
          error={msg("capacity")}
          inputMode="numeric"
          autoComplete="off"
        />
      </div>
      <FormError error={error} />
    </Dialog>
  );
}
