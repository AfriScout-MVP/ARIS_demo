"use client";

import { useId, useState } from "react";
import { Search } from "@/components/icons/glyphs";
import { Badge } from "@/components/ui";
import { listOfficials, type CountryRow, type OfficialOption } from "@/lib/api/admin";
import { useDebounced, useResource } from "@/lib/admin/hooks";
import { useLocale, useT } from "@/lib/i18n/LocaleProvider";
import { cn } from "@/lib/utils";
import { controlClass, SelectField } from "./fields";
import { Skeleton } from "./states";

/**
 * Choose the official a referee account belongs to (`GET /officials?country=&q=&limit=30`).
 * A federation seat passes its own `country`; the super-admin gets a country filter first.
 */
export function OfficialPicker({
  value,
  onChange,
  country,
  countries,
  error,
  onPickOption,
}: {
  value: string;
  onChange: (id: string) => void;
  /** Also hands over the picked row, for callers that keep a list of names. */
  onPickOption?: (official: OfficialOption) => void;
  /** Fixed country (federation seats). When omitted the picker offers `countries` as a filter. */
  country?: string | null;
  countries?: CountryRow[];
  error?: string;
}) {
  const t = useT();
  const { locale } = useLocale();
  const searchId = useId();
  const [pickedCountry, setPickedCountry] = useState("");
  const [q, setQ] = useState("");
  const query = useDebounced(q.trim(), 300);
  const scope = country ?? pickedCountry;

  const { data, loading, error: loadError, reload } = useResource(`officials|${scope}|${query}`, (signal) =>
    listOfficials({ country: scope || undefined, q: query || undefined, limit: 30 }, signal),
  );

  const names = new Map((countries ?? []).map((c) => [c.code, locale === "fr" ? c.nameFr : locale === "es" ? c.nameEs : locale === "de" ? c.nameDe : c.name]));

  return (
    <fieldset className="space-y-2" aria-describedby={error ? `${searchId}-error` : undefined}>
      <legend className="mb-1 text-xs font-semibold text-chalk-dim">
        {t("admin.accounts.official")}
        <span aria-hidden className="ms-0.5 text-card-red">
          *
        </span>
      </legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {country === undefined || country === null ? (
          <SelectField
            label={t("admin.accounts.officialCountry")}
            value={pickedCountry}
            onChange={setPickedCountry}
            placeholder={t("admin.common.allCountries")}
            options={(countries ?? []).map((c) => ({ value: c.code, label: names.get(c.code) ?? c.code }))}
          />
        ) : null}
        <div className={cn("flex flex-col gap-1", country ? "sm:col-span-2" : "")}>
          <label htmlFor={searchId} className="text-xs font-semibold text-chalk-dim">
            {t("admin.accounts.officialSearch")}
          </label>
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-chalk-faint" />
            <input
              id={searchId}
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("admin.accounts.officialSearchPlaceholder")}
              className={cn(controlClass(), "ps-9")}
            />
          </div>
        </div>
      </div>

      <div
        role="radiogroup"
        aria-label={t("admin.accounts.official")}
        aria-busy={loading}
        className={cn("max-h-52 overflow-y-auto rounded-lg border bg-ink-1", error ? "border-red-500" : "border-line")}
      >
        {loading && !data ? (
          <div className="space-y-2 p-3">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-3/5" />
          </div>
        ) : loadError ? (
          <p className="p-3 text-sm text-card-red">
            {t("admin.common.loadFailed")}{" "}
            <button type="button" className="font-semibold underline" onClick={reload}>
              {t("admin.common.retry")}
            </button>
          </p>
        ) : data && data.length === 0 ? (
          <p className="p-3 text-sm text-chalk-dim">{t("admin.accounts.officialNone")}</p>
        ) : (
          <ul className="divide-y divide-line">
            {(data ?? []).map((o) => (
              <li key={o.id}>
                <label
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-red-500/5 has-[:focus-visible]:bg-red-500/10",
                    value === o.id && "bg-red-500/10",
                  )}
                >
                  <input
                    type="radio"
                    name={`${searchId}-official`}
                    value={o.id}
                    checked={value === o.id}
                    onChange={() => {
                      onChange(o.id);
                      onPickOption?.(o);
                    }}
                    className="h-4 w-4 shrink-0 accent-red-600"
                  />
                  <span className="min-w-0 flex-1 truncate text-chalk">{o.name}</span>
                  <Badge>{o.countryCode}</Badge>
                  {o.level && <span className="hidden text-xs text-chalk-faint sm:inline">{o.level}</span>}
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && (
        <p id={`${searchId}-error`} className="text-xs font-medium text-card-red">
          {error}
        </p>
      )}
    </fieldset>
  );
}
