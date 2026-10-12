"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LogOut, ShieldCheck } from "lucide-react";
import { useT } from "@/lib/i18n/LocaleProvider";
import { Badge } from "@/components/ui";

export function AvatarMenu() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointer(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, []);

  return (
    <div className="relative" ref={ref}>
      {/* The admin header's avatar: a red→orange disc with the initial. */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Nadia Boukhari"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-linear-to-br from-red-600 to-orange-700 text-sm font-medium text-white"
      >
        N
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-2xl border border-line bg-ink-2 shadow-xl shadow-black/20">
          <div className="border-b border-line p-3">
            <p className="text-sm font-semibold text-chalk">Nadia Boukhari</p>
            <p className="text-xs text-chalk-dim">referees@caf-demo.org</p>
            <Badge tone="neutral" className="mt-2">
              <ShieldCheck size={11} />
              CAF referees department
            </Badge>
          </div>
          <div className="p-1">
            <Link
              href="/development"
              onClick={() => setOpen(false)}
              className="block rounded-xl px-3 py-2 text-sm text-chalk-dim transition-colors hover:bg-red-500/10 hover:text-chalk"
            >
              {t("nav.development")}
            </Link>
            <Link
              href="/federations"
              onClick={() => setOpen(false)}
              className="block rounded-xl px-3 py-2 text-sm text-chalk-dim transition-colors hover:bg-red-500/10 hover:text-chalk"
            >
              {t("nav.federations")}
            </Link>
          </div>
          <div className="border-t border-line p-1">
            <button className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-red-700 transition-colors hover:bg-red-500/10 dark:text-red-400">
              <LogOut size={14} />
              {t("common.signOut")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
