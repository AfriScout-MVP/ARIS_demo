"use client";

import { cn } from "@/lib/utils";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { localeLabels, locales } from "@/lib/i18n/dictionary";

export function LocaleToggle() {
  const { locale, setLocale } = useLocale();
  return (
    <div className="inline-flex rounded-[10px] border border-field bg-ink-2 p-0.5" role="group" aria-label="Language">
      {locales.map((code) => (
        <button
          key={code}
          onClick={() => setLocale(code)}
          aria-pressed={locale === code}
          className={cn(
            "min-h-9 min-w-9 rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors",
            locale === code ? "bg-red-600 text-white" : "text-chalk-faint hover:text-chalk",
          )}
        >
          {localeLabels[code]}
        </button>
      ))}
    </div>
  );
}
