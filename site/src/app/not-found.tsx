"use client";

import Link from "next/link";
import { MarkTile } from "@/components/icons/Mark";
import { useT } from "@/lib/i18n/LocaleProvider";

/** A 404 that reads as part of the product: the pitch diagonal, one line, one way out. */
export default function NotFound() {
  const t = useT();
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-md">
        <MarkTile size={44} />
        <p className="board mt-8 text-7xl leading-none text-chalk-faint">404</p>
        <h1 className="mt-3 text-3xl font-extrabold text-chalk">{t("common.lost")}</h1>
        <p className="mt-2 text-chalk-dim">{t("common.lostBody")}</p>
        <Link
          href="/"
          className="mt-6 inline-flex min-h-10 items-center rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white shadow-[0_6px_14px_-8px_rgba(185,28,28,0.8)] transition-colors hover:bg-red-700"
        >
          {t("common.lostHome")}
        </Link>
      </div>
    </main>
  );
}
