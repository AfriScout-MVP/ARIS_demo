"use client";

import { cn } from "@/lib/utils";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { localeLabels, locales } from "@/lib/i18n/dictionary";

export function LocaleToggle() {
  const { locale, setLocale } = useLocale();
  return (
    <div className="inline-flex rounded-md border border-line bg-ink-2 p-0.5" role="group" aria-label="Language">
      {locales.map((code) => (
        <button
          key={code}
          onClick={() => setLocale(code)}
          aria-pressed={locale === code}
          className={cn(
            "rounded-[5px] px-1.5 py-1 text-[11px] font-medium transition-colors",
            locale === code ? "bg-pitch text-[#04140c]" : "text-chalk-faint hover:text-chalk",
          )}
        >
          {localeLabels[code]}
        </button>
      ))}
    </div>
  );
}
