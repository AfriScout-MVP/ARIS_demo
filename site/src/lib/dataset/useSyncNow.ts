"use client";

import { useCallback, useState } from "react";
import { useT } from "@/lib/i18n/LocaleProvider";
import { useToast } from "@/lib/toast/ToastProvider";
import { useDataset } from "./DatasetProvider";

/** The "Sync now" button: fetch the snapshot again so the screen shows what the API holds right now. */
export function useSyncNow() {
  const t = useT();
  const toast = useToast();
  const { refresh } = useDataset();
  const [syncing, setSyncing] = useState(false);

  const syncNow = useCallback(async () => {
    setSyncing(true);
    const ok = await refresh();
    setSyncing(false);
    toast.push(ok ? "success" : "error", t(ok ? "common.synced" : "admin.errors.network"));
  }, [refresh, t, toast]);

  return { syncing, syncNow };
}
