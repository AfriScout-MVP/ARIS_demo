"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, ShieldCheck } from "lucide-react";
import { useT } from "@/lib/i18n/LocaleProvider";
import { Avatar, Badge } from "@/components/ui";

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
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-md border border-line bg-ink-2 p-1 pr-1.5 transition-colors hover:border-line-strong"
      >
        <Avatar initials="NB" size={24} tone="chalk" />
        <ChevronDown size={13} className="hidden text-chalk-faint sm:block" />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-lg border border-line bg-ink-2 shadow-2xl shadow-black/60">
          <div className="border-b border-line p-3">
            <p className="text-[13px] font-medium text-chalk">Nadia Boukhari</p>
            <p className="text-[11.5px] text-chalk-faint">referees@caf-demo.org</p>
            <Badge tone="neutral" className="mt-2">
              <ShieldCheck size={11} />
              CAF referees department
            </Badge>
          </div>
          <div className="p-1">
            <Link
              href="/development"
              onClick={() => setOpen(false)}
              className="block rounded-md px-2.5 py-2 text-[12.5px] text-chalk-dim transition-colors hover:bg-white/5 hover:text-chalk"
            >
              {t("nav.development")}
            </Link>
            <Link
              href="/federations"
              onClick={() => setOpen(false)}
              className="block rounded-md px-2.5 py-2 text-[12.5px] text-chalk-dim transition-colors hover:bg-white/5 hover:text-chalk"
            >
              {t("nav.federations")}
            </Link>
          </div>
          <div className="border-t border-line p-1">
            <button className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-[12.5px] text-chalk-faint transition-colors hover:bg-white/5 hover:text-chalk">
              <LogOut size={14} />
              {t("common.signOut")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
