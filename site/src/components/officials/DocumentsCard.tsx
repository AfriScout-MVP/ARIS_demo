"use client";

import { useRef, useState } from "react";
import { Check, Download, Files, RefreshCcw, Trash2, Upload, X } from "@/components/icons/glyphs";
import { Badge, Button, Card, CardHeader, EmptyState } from "@/components/ui";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { FormError, SelectField, TextField } from "@/components/admin/fields";
import {
  deleteDocument,
  DOC_KINDS,
  DOC_TYPES,
  documentHref,
  setDocumentStatus,
  uploadDocument,
  type DocKind,
  type DocStatus,
  type OfficialDocument,
} from "@/lib/api/officials";
import { DOC_STATUS_TONE, docExpiry, documentSummary, formatBytes, validateDocumentFile } from "@/lib/officials/forms";
import { useAction } from "@/lib/admin/hooks";
import { today } from "@/lib/store";
import { useFormatters, useT, type TKey } from "@/lib/i18n/LocaleProvider";
import { useToast } from "@/lib/toast/ToastProvider";

const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/**
 * An official's documents. Staff check each one (verified / rejected, the official is told) and may delete any;
 * the official files their own and may withdraw one only while it is still waiting to be checked.
 */
export function DocumentsCard({
  officialId,
  documents,
  canReview,
  onChanged,
}: {
  officialId: string;
  documents: OfficialDocument[];
  canReview: boolean;
  onChanged: () => void;
}) {
  const t = useT();
  const fmt = useFormatters();
  const toast = useToast();
  const upload = useAction();
  const review = useAction();
  const input = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<DocKind>("licence");
  const [expiresOn, setExpiresOn] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<TKey | null>(null);
  const [removing, setRemoving] = useState<OfficialDocument | null>(null);
  const day = today();
  const summary = documentSummary(documents, day);
  // the console's own file messages speak of images; a document may also be a PDF
  const uploadError =
    upload.error && (upload.error.code === "unsupported_type" || upload.error.code === "too_large")
      ? { ...upload.error, key: (upload.error.code === "too_large" ? "officials.documents.errors.size" : "officials.documents.errors.type") as TKey }
      : upload.error;

  function pick(next: File | null) {
    setFile(next);
    setFileError(null);
    if (!next) return;
    const problem = validateDocumentFile(next, kind);
    if (problem) setFileError(`officials.documents.errors.${problem}`);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return setFileError("officials.documents.errors.missing");
    const problem = validateDocumentFile(file, kind);
    if (problem) return setFileError(`officials.documents.errors.${problem}`);
    if (expiresOn && !isDay(expiresOn)) return setFileError("officials.documents.errors.date");
    const res = await upload.run(() => uploadDocument(officialId, file, kind, expiresOn || undefined));
    if (res.ok) {
      toast.push("success", t("officials.documents.uploaded"));
      setFile(null);
      setExpiresOn("");
      if (input.current) input.current.value = "";
      onChanged();
    }
  }

  async function mark(doc: OfficialDocument, status: DocStatus) {
    const res = await review.run(() => setDocumentStatus(doc.id, status));
    if (res.ok) {
      toast.push("success", t(`officials.documents.toast.${status}`));
      onChanged();
    }
  }

  return (
    <Card>
      <CardHeader
        icon={Files}
        tint="var"
        title={t("officials.documents.title")}
        subtitle={t(canReview ? "officials.documents.staffHint" : "officials.documents.selfHint")}
      />

      {(summary.pending > 0 || summary.expired > 0 || summary.expiring > 0) && (
        <div className="mb-3 flex flex-wrap gap-2">
          {summary.pending > 0 && <Badge tone="amber">{t("officials.documents.toReview", { n: summary.pending })}</Badge>}
          {summary.expired > 0 && <Badge tone="red">{t("officials.documents.lapsed", { n: summary.expired })}</Badge>}
          {summary.expiring > 0 && <Badge tone="amber">{t("officials.documents.lapsing", { n: summary.expiring })}</Badge>}
        </div>
      )}

      <FormError error={review.error} />

      {documents.length === 0 ? (
        <EmptyState title={t("officials.documents.empty")} hint={t("officials.documents.emptyHint")} />
      ) : (
        <ul className="space-y-2">
          {documents.map((doc) => {
            const expiry = docExpiry(doc, day);
            const canDelete = canReview || doc.status === "pending";
            return (
              <li key={doc.id} className="rounded-[10px] border border-line bg-ink-1 px-3 py-2.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-chalk">
                      {t(`officials.documents.kinds.${doc.kind}`)} · <span className="text-chalk-dim">{doc.filename}</span>
                    </p>
                    <p className="text-[11px] text-chalk-faint">
                      {t("officials.documents.uploadedOn", { date: fmt.date(doc.createdAt.slice(0, 10)) })} · {formatBytes(doc.size)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={DOC_STATUS_TONE[doc.status]}>{t(`officials.documents.statuses.${doc.status}`)}</Badge>
                    {expiry !== "none" && doc.expiresOn && (
                      <Badge tone={expiry === "expired" ? "red" : expiry === "expiring" ? "amber" : "neutral"}>
                        {t(`officials.documents.${expiry}`, { date: fmt.date(doc.expiresOn) })}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <a
                    href={documentHref(doc.id)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs text-chalk-dim hover:text-chalk"
                  >
                    <Download size={13} />
                    {t("officials.documents.download")}
                  </a>
                  {canReview && doc.status !== "verified" && (
                    <Button size="sm" variant="secondary" disabled={review.busy} onClick={() => void mark(doc, "verified")}>
                      <Check size={13} />
                      {t("officials.documents.verify")}
                    </Button>
                  )}
                  {canReview && doc.status !== "rejected" && (
                    <Button size="sm" variant="ghost" disabled={review.busy} onClick={() => void mark(doc, "rejected")}>
                      <X size={13} />
                      {t("officials.documents.reject")}
                    </Button>
                  )}
                  {canReview && doc.status !== "pending" && (
                    <Button size="sm" variant="ghost" disabled={review.busy} onClick={() => void mark(doc, "pending")}>
                      <RefreshCcw size={13} />
                      {t("officials.documents.reopen")}
                    </Button>
                  )}
                  {canDelete ? (
                    <Button size="sm" variant="ghost" onClick={() => setRemoving(doc)} aria-label={`${t("officials.documents.delete")} ${doc.filename}`}>
                      <Trash2 size={13} />
                      {t("officials.documents.delete")}
                    </Button>
                  ) : (
                    <span className="self-center text-[11px] text-chalk-faint">{t("officials.documents.lockedSelf")}</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={(e) => void send(e)} className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-[1fr_1fr_1.4fr_auto] sm:items-end">
        <SelectField
          label={t("officials.documents.kind")}
          value={kind}
          onChange={(v) => {
            setKind(v as DocKind);
            if (file) setFileError(validateDocumentFile(file, v) ? `officials.documents.errors.${validateDocumentFile(file, v)!}` : null);
          }}
          options={DOC_KINDS.map((k) => ({ value: k, label: t(`officials.documents.kinds.${k}`) }))}
          hint={kind === "photo" ? t("officials.documents.photoNote") : undefined}
        />
        <TextField label={t("officials.documents.expiresOn")} type="date" value={expiresOn} onChange={setExpiresOn} min={day} />
        <div>
          <label className="mb-1.5 block text-xs font-medium text-chalk-dim" htmlFor={`doc-file-${officialId}`}>
            {t("officials.documents.file")}
          </label>
          <input
            ref={input}
            id={`doc-file-${officialId}`}
            type="file"
            accept={(kind === "photo" ? DOC_TYPES.filter((x) => x.startsWith("image/")) : DOC_TYPES).join(",")}
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
            aria-invalid={fileError ? true : undefined}
            aria-describedby={`doc-file-${officialId}-hint`}
            className="block w-full text-xs text-chalk-dim file:me-3 file:h-9 file:rounded-lg file:border file:border-field file:bg-ink-2 file:px-3 file:text-xs file:text-chalk"
          />
          <p id={`doc-file-${officialId}-hint`} className={fileError ? "mt-1 text-xs text-card-red" : "mt-1 text-[11px] text-chalk-faint"}>
            {fileError ? t(fileError) : t("officials.documents.fileHint")}
          </p>
        </div>
        <Button type="submit" variant="primary" disabled={upload.busy || !file || Boolean(fileError)}>
          <Upload size={14} />
          {upload.busy ? t("admin.common.working") : t("officials.documents.upload")}
        </Button>
        <div className="sm:col-span-4">
          <FormError error={uploadError} />
        </div>
      </form>

      {removing && (
        <ConfirmDialog
          danger
          title={t("officials.documents.deleteTitle")}
          confirmLabel={t("officials.documents.delete")}
          perform={() => deleteDocument(removing.id)}
          onCancel={() => setRemoving(null)}
          onDone={() => {
            setRemoving(null);
            toast.push("success", t("officials.documents.toast.deleted"));
            onChanged();
          }}
        >
          <p>{t("officials.documents.deleteBody", { name: removing.filename })}</p>
        </ConfirmDialog>
      )}
    </Card>
  );
}
