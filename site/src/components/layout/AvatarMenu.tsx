"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LogOut, ShieldCheck } from "@/components/icons/glyphs";
import { useLocale, useT } from "@/lib/i18n/LocaleProvider";
import { Badge } from "@/components/ui";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { LocaleToggle } from "@/components/layout/LocaleToggle";
import { useDataset } from "@/lib/dataset/DatasetProvider";
import { countryName } from "@/lib/store";
import { isAdmin, isReferee, roleLabelKey } from "@/lib/roles";

/** The account menu: who is signed in, in which role and for which federation, the language, and sign-out. */
export function AvatarMenu() {
  const t = useT();
  const { locale } = useLocale();
  const { user, signOut } = useDataset();
  const name = user?.name ?? "";
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointer(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, []);

  const linkClass =
    "block rounded-[10px] px-3 py-2 text-sm text-chalk-dim transition-colors hover:bg-red-500/10 hover:text-chalk";

  return (
    <div className="relative" ref={ref}>
      {/* The admin header's avatar: a red→orange disc with the initial. */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={name || t("common.account")}
        className="flex h-9 w-9 items-center justify-center rounded-[32%] bg-red-600 text-sm font-semibold text-white"
      >
        {name.charAt(0).toUpperCase()}
      </button>

      {open && user && (
        <div className="absolute right-0 z-50 mt-2 w-64 rounded-[14px] border border-line bg-ink-2 shadow-xl shadow-black/20">
          <div className="border-b border-line p-3">
            <p className="truncate text-sm font-semibold text-chalk">{name}</p>
            <p className="truncate text-xs text-chalk-dim">{user.email}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge tone="neutral">
                <ShieldCheck size={11} />
                {t(roleLabelKey(user.role))}
              </Badge>
              {user.federationCode && <Badge tone="neutral">{user.federationCode}</Badge>}
              {user.country && (
                <Badge tone="neutral">
                  <CountryFlag code={user.country} />
                  {countryName(user.country, locale)}
                </Badge>
              )}
            </div>
          </div>
          <div className="p-1">
            {!isReferee(user) && (
              <Link href="/development" onClick={() => setOpen(false)} className={linkClass}>
                {t("nav.development")}
              </Link>
            )}
            {isAdmin(user) && (
              <Link href="/federations" onClick={() => setOpen(false)} className={linkClass}>
                {t("nav.federations")}
              </Link>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2">
            <span className="text-xs text-chalk-faint">{t("common.language")}</span>
            <LocaleToggle />
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
