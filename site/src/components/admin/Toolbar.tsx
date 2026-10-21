"use client";

import { useId } from "react";
import { Search } from "@/components/icons/glyphs";
import { useT } from "@/lib/i18n/LocaleProvider";
import { cn } from "@/lib/utils";
import { controlClass } from "./fields";

/** The search box that sits above every list. */
export function SearchBox({
  value,
  onChange,
  placeholder,
  label,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  label?: string;
  className?: string;
}) {
  const t = useT();
  const id = useId();
  return (
    <div className={cn("relative min-w-0 flex-1 basis-56", className)}>
      <label htmlFor={id} className="sr-only">
        {label ?? t("common.search")}
      </label>
      <Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-chalk-faint" />
      <input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className={cn(controlClass(), "ps-9")}
      />
    </div>
  );
}
