"use client";

import { Button } from "@/components/ui";
import { useT } from "@/lib/i18n/LocaleProvider";
import { useAction } from "@/lib/admin/hooks";
import { Dialog } from "./Dialog";
import { FormError } from "./fields";

/** "Are you sure?" for the actions with side effects. The dialog runs `perform`, shows its error, and calls `onDone` on success. */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  danger = false,
  perform,
  onDone,
  onCancel,
}: {
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  perform: () => Promise<unknown>;
  onDone: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const { busy, error, run } = useAction();

  async function confirm() {
    const result = await run(perform);
    if (result.ok) onDone();
  }

  return (
    <Dialog
      size="sm"
      title={title}
      onClose={onCancel}
      busy={busy}
      onSubmit={() => void confirm()}
      footer={
        <>
          <Button type="button" onClick={onCancel} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" variant={danger ? "danger" : "primary"} disabled={busy}>
            {busy ? t("admin.common.working") : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-2 text-sm leading-relaxed text-chalk-dim">{children}</div>
      <FormError error={error} />
    </Dialog>
  );
}
