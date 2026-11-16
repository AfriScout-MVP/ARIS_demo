"use client";

import Link from "next/link";
import { ArrowLeft } from "@/components/icons/glyphs";
import { useT, type TKey } from "@/lib/i18n/LocaleProvider";

/** "Back to my space" under a referee's detail page; sized as a touch target. */
export function BackLink({ labelKey }: { labelKey: TKey }) {
  const t = useT();
  return (
    <Link href="/me" className="inline-flex min-h-10 items-center gap-1.5 text-xs text-chalk-faint hover:text-chalk">
      <ArrowLeft size={14} />
      {t(labelKey)}
    </Link>
  );
}
