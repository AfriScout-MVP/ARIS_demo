"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, Globe2 } from "@/components/icons/glyphs";
import { cn } from "@/lib/utils";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { useDataset } from "@/lib/dataset/DatasetProvider";
import { localeCodes, localeLabels, locales, type Locale } from "@/locales";

/**
 * Language switcher: a compact trigger showing the current short code, and a
 * listbox with the four languages written in their own tongue. Built to the
 * ARIA "select-only combobox" pattern: the trigger keeps focus semantics, the
 * list takes focus while open and tracks the highlighted option through
 * `aria-activedescendant`.
 */
export function LocaleToggle() {
  const { locale, setLocale, t } = useLocale();
  const { user, saveLocale } = useDataset();
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const baseId = useId();
  const optionId = (code: Locale) => `${baseId}-${code}`;

  function show() {
    // The sidebar footer sits at the bottom of the screen: open upwards when there is no room below.
    const rect = triggerRef.current?.getBoundingClientRect();
    setOpenUp(rect ? window.innerHeight - rect.bottom < 220 : false);
    setActive(Math.max(0, locales.indexOf(locale)));
    setOpen(true);
  }

  function hide(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  function choose(code: Locale) {
    setLocale(code);
    // signed in: remember it on the account too
    if (user && user.locale !== code) saveLocale(code);
    hide(true);
  }

  // Move focus into the list on open so arrow keys and Escape work immediately.
  useEffect(() => {
    if (open) listRef.current?.focus();
  }, [open]);

  // Close on a pointer press anywhere outside the switcher.
  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  function onTriggerKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      show();
    }
  }

  function onListKeyDown(e: KeyboardEvent<HTMLUListElement>) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive((i) => (i + 1) % locales.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive((i) => (i - 1 + locales.length) % locales.length);
        break;
      case "Home":
        e.preventDefault();
        setActive(0);
        break;
      case "End":
        e.preventDefault();
        setActive(locales.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        choose(locales[active]);
        break;
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        hide(true);
        break;
      case "Tab":
        hide(false);
        break;
    }
  }

  const label = `${t("common.language")}: ${localeLabels[locale]}`;

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? hide(false) : show())}
        onKeyDown={onTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${baseId}-list` : undefined}
        aria-label={label}
        title={label}
        className="flex h-10 items-center gap-1.5 rounded-lg border border-field bg-ink-3 px-2.5 text-chalk-dim transition-colors hover:bg-ink-4 hover:text-chalk"
      >
        <Globe2 className="h-4 w-4" aria-hidden="true" />
        <span className="text-xs font-semibold tracking-wide">{localeCodes[locale]}</span>
        <ChevronDown
          className={cn("h-3 w-3 transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      {open && (
        <ul
          ref={listRef}
          id={`${baseId}-list`}
          role="listbox"
          tabIndex={-1}
          aria-label={t("common.language")}
          aria-activedescendant={optionId(locales[active])}
          onKeyDown={onListKeyDown}
          className={cn(
            "absolute right-0 z-50 w-44 overflow-hidden rounded-[14px] border border-line bg-ink-2 p-1 shadow-xl shadow-black/20 outline-none",
            openUp ? "bottom-full mb-2" : "top-full mt-2",
          )}
        >
          {locales.map((code, i) => {
            const selected = code === locale;
            return (
              <li
                key={code}
                id={optionId(code)}
                role="option"
                aria-selected={selected}
                lang={code}
                onClick={() => choose(code)}
                onMouseMove={() => setActive(i)}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-[10px] px-3 py-2 text-sm transition-colors",
                  i === active ? "bg-red-500/10 text-chalk" : "text-chalk-dim",
                  selected && "font-semibold text-chalk",
                )}
              >
                <span className="w-6 text-[11px] font-semibold tracking-wide text-chalk-faint">
                  {localeCodes[code]}
                </span>
                <span className="flex-1 truncate">{localeLabels[code]}</span>
                {selected && <Check className="h-4 w-4 text-red-600 dark:text-red-400" aria-hidden="true" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
