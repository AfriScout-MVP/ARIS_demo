"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { countryFlag, countryFlagUrl, countryName } from "@/lib/store";

/**
 * The one place a flag is drawn. Shows the country's uploaded image (`flagUrl`, served by
 * the API) and falls back to the emoji flag when there is none or the image fails to load.
 */
export function CountryFlag({ code, className }: { code: string; className?: string }) {
  const { locale } = useLocale();
  const url = countryFlagUrl(code);
  const [failed, setFailed] = useState<string | null>(null);

  if (url && failed !== url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- static export: next/image would only add a loader
      <img
        src={url}
        alt={countryName(code, locale)}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(url)}
        className={cn("inline-block h-[1em] w-[1.4em] shrink-0 rounded-[2px] object-cover align-[-0.12em]", className)}
      />
    );
  }
  return (
    <span role="img" aria-label={countryName(code, locale)} className={cn("inline-block shrink-0 leading-none", className)}>
      {countryFlag(code)}
    </span>
  );
}
