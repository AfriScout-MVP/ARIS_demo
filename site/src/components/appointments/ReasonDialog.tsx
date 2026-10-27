"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { Dialog } from "@/components/admin/Dialog";
import { TextAreaField } from "@/components/admin/fields";
import { useT } from "@/lib/i18n/LocaleProvider";

export const REASON_MIN = 3;

/**
 * The written reason the Worker asks for before a change that reaches people (replacing a confirmed official,
 * clearing a validated crew) or before overriding a soft blocker. Logged in the designation history and sent
 * to the officials concerned.
 */
export function ReasonDialog({ message, override, onAnswer }: { message: string; override: boolean; onAnswer: (reason: string | null) => void }) {
  const t = useT();
  const [text, setText] = useState("");
  const [short, setShort] = useState(false);

  return (
    <Dialog
      size="sm"
      title={t(override ? "live.reasonDialog.overrideTitle" : "live.reasonDialog.title")}
      description={message}
      onClose={() => onAnswer(null)}
      onSubmit={() => {
        if (text.trim().length < REASON_MIN) return setShort(true);
        onAnswer(text.trim());
      }}
      footer={
        <>
          <Button type="button" onClick={() => onAnswer(null)}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" variant={override ? "danger" : "primary"}>
            {t(override ? "live.reasonDialog.override" : "live.reasonDialog.confirm")}
          </Button>
        </>
      }
    >
      <TextAreaField
        label={t("live.reasonDialog.label")}
        value={text}
        onChange={(v) => {
          setText(v);
          setShort(false);
        }}
        rows={3}
        maxLength={300}
        hint={t("live.reasonDialog.hint")}
        error={short ? t("live.reasonDialog.short") : undefined}
        required
        autoFocus
      />
    </Dialog>
  );
}
