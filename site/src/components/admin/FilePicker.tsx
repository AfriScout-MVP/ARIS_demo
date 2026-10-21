"use client";

import { useCallback, useRef, useState } from "react";
import { IMAGE_TYPES } from "@/lib/admin/constants";
import { describeError } from "@/lib/admin/errors";
import { validateImage } from "@/lib/admin/validators";
import { useDataset } from "@/lib/dataset/DatasetProvider";
import { useT } from "@/lib/i18n/LocaleProvider";
import { useToast } from "@/lib/toast/ToastProvider";

/**
 * One hidden file input for a whole table: `start(id)` opens the picker for that row, the chosen file is
 * checked (type, size) before it leaves the browser, uploaded, and the page is told to reload.
 */
export function useImageUpload(upload: (id: string, file: File) => Promise<unknown>, onDone: () => void) {
  const t = useT();
  const toast = useToast();
  const { noteFailure } = useDataset();
  const input = useRef<HTMLInputElement>(null);
  const target = useRef<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const start = useCallback((id: string) => {
    target.current = id;
    input.current?.click();
  }, []);

  const onChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    const id = target.current;
    if (!file || !id) return;

    const problem = validateImage(file);
    if (problem) {
      toast.push("error", t(problem === "size" ? "admin.errors.file_size" : problem === "type" ? "admin.errors.file_type" : "admin.errors.file_empty"));
      return;
    }
    setBusyId(id);
    try {
      await upload(id, file);
      toast.push("success", t("admin.common.imageSaved"));
      onDone();
    } catch (err) {
      noteFailure(err);
      toast.push("error", t(describeError(err).key));
    } finally {
      setBusyId(null);
    }
  };

  const element = (
    <input
      ref={input}
      type="file"
      accept={IMAGE_TYPES.join(",")}
      tabIndex={-1}
      aria-hidden
      className="sr-only"
      onChange={(e) => void onChange(e)}
    />
  );

  return { input: element, start, busyId };
}
