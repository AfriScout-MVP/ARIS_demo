"use client";

import { useState } from "react";
import { IdCard } from "@/components/icons/glyphs";
import { Badge, Button, Card, CardHeader } from "@/components/ui";
import { FormError, TextField } from "@/components/admin/fields";
import { ErrorState, ListSkeleton } from "@/components/admin/states";
import { getOfficial, updateOfficial, type OfficialFile } from "@/lib/api/officials";
import { parseZones, toSelfPatch } from "@/lib/officials/forms";
import { isEmail } from "@/lib/admin/validators";
import { useAction, useResource } from "@/lib/admin/hooks";
import { useT } from "@/lib/i18n/LocaleProvider";
import { useToast } from "@/lib/toast/ToastProvider";
import { ConflictsCard } from "./ConflictsCard";
import { DocumentsCard } from "./DocumentsCard";

interface Contact {
  email: string;
  phone: string;
  city: string;
  region: string;
  zones: string;
}

const contactOf = (f: OfficialFile): Contact => ({
  email: f.email ?? "",
  phone: f.phone ?? "",
  city: f.city ?? "",
  region: f.region ?? "",
  zones: f.interventionZones.join(", "),
});

function ContactForm({ file, onSaved }: { file: OfficialFile; onSaved: () => void }) {
  const t = useT();
  const toast = useToast();
  const { busy, error, run } = useAction();
  const [v, setV] = useState<Contact>(() => contactOf(file));
  const [emailError, setEmailError] = useState(false);
  const [zonesError, setZonesError] = useState(false);
  const set = (key: keyof Contact, value: string) => setV((c) => ({ ...c, [key]: value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const badEmail = Boolean(v.email.trim()) && !isEmail(v.email);
    const zones = parseZones(v.zones);
    const badZones = zones.length > 30 || zones.some((z) => z.length > 20);
    setEmailError(badEmail);
    setZonesError(badZones);
    if (badEmail || badZones) return;
    const patch = toSelfPatch(v, file);
    if (Object.keys(patch).length === 0) return toast.push("success", t("officials.dialog.unchanged"));
    const res = await run(() => updateOfficial(file.id, patch));
    if (res.ok) {
      toast.push("success", t("officials.mine.saved"));
      onSaved();
    }
  }

  return (
    <form onSubmit={(e) => void save(e)} className="space-y-3">
      <FormError error={error} />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label={t("officials.fields.email")} type="email" value={v.email} onChange={(x) => set("email", x)} error={emailError ? t("admin.errors.emailInvalid") : undefined} maxLength={200} autoComplete="email" />
        <TextField label={t("officials.fields.phone")} type="tel" value={v.phone} onChange={(x) => set("phone", x)} maxLength={40} autoComplete="tel" />
        <TextField label={t("officials.fields.city")} value={v.city} onChange={(x) => set("city", x)} maxLength={80} autoComplete="address-level2" />
        <TextField label={t("officials.fields.region")} value={v.region} onChange={(x) => set("region", x)} maxLength={80} autoComplete="address-level1" />
      </div>
      <TextField
        label={t("officials.fields.zones")}
        value={v.zones}
        onChange={(x) => set("zones", x)}
        hint={t("officials.hints.zones")}
        error={zonesError ? t("officials.errors.zones") : undefined}
      />
      <div className="flex justify-end">
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? t("admin.common.working") : t("officials.mine.save")}
        </Button>
      </div>
    </form>
  );
}

/** The referee's own file in their space: contact details they keep, documents they file. */
export function MyFile({ officialId }: { officialId: string }) {
  const t = useT();
  const detail = useResource(`official|${officialId}`, (signal) => getOfficial(officialId, signal));

  if (detail.loading) return <ListSkeleton rows={3} />;
  if (detail.error || !detail.data) return <ErrorState onRetry={detail.reload} />;
  const file = detail.data.official;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader icon={IdCard} tint="gold" title={t("officials.mine.title")} subtitle={t("officials.mine.hint")} />
        <div className="mb-3 flex flex-wrap gap-2">
          {file.matricule && <Badge tone="neutral">{`${t("officials.fields.matricule")} ${file.matricule}`}</Badge>}
          {file.licenceNo && <Badge tone="neutral">{`${t("officials.fields.licenceNo")} ${file.licenceNo}`}</Badge>}
          <Badge tone="neutral">{file.level}</Badge>
        </div>
        {/* keyed by the last update, so a save shows what the server kept */}
        <ContactForm key={file.updatedAt} file={file} onSaved={detail.reload} />
      </Card>
      <DocumentsCard officialId={officialId} documents={detail.data.documents} canReview={false} onChanged={detail.reload} />
      <ConflictsCard officialId={officialId} countryCode={file.countryCode} conflicts={detail.data.conflicts ?? []} canRemove={false} onChanged={detail.reload} />
    </div>
  );
}
