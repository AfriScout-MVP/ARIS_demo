"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LogOut, ShieldCheck } from "@/components/icons/glyphs";
import { useT } from "@/lib/i18n/LocaleProvider";
import { Badge } from "@/components/ui";
import { useDataset } from "@/lib/dataset/DatasetProvider";

export function AvatarMenu() {
  const t = useT();
  const { live, user, signOut } = useDataset();
  const name = user?.name ?? "Nadia Boukhari";
  const email = user?.email ?? "referees@caf-demo.org";
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
        aria-label={name}
        className="flex h-9 w-9 items-center justify-center rounded-[32%] bg-red-600 text-sm font-semibold text-white"
      >
        {name.charAt(0).toUpperCase()}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-[14px] border border-line bg-ink-2 shadow-xl shadow-black/20">
          <div className="border-b border-line p-3">
            <p className="text-sm font-semibold text-chalk">{name}</p>
            <p className="text-xs text-chalk-dim">{email}</p>
            <Badge tone="neutral" className="mt-2">
              <ShieldCheck size={11} />
              {live && user ? t(`auth.role.${user.role}`) : "CAF referees department"}
            </Badge>
          </div>
          <div className="p-1">
            <Link
              href="/development"
              onClick={() => setOpen(false)}
              className="block rounded-[10px] px-3 py-2 text-sm text-chalk-dim transition-colors hover:bg-red-500/10 hover:text-chalk"
            >
              {t("nav.development")}
            </Link>
            <Link
              href="/federations"
              onClick={() => setOpen(false)}
              className="block rounded-[10px] px-3 py-2 text-sm text-chalk-dim transition-colors hover:bg-red-500/10 hover:text-chalk"
            >
              {t("nav.federations")}
            </Link>
          </div>
          <div className="border-t border-line p-1">
            <button
              onClick={() => void signOut()}
              className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-sm text-red-700 transition-colors hover:bg-red-500/10 dark:text-red-400"
            >
              <LogOut size={14} />
              {t("common.signOut")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
