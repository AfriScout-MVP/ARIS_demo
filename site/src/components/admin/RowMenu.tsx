"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Ellipsis, type IconType } from "@/components/icons/glyphs";
import { cn } from "@/lib/utils";

export interface MenuItem {
  key: string;
  label: string;
  icon?: IconType;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

const ITEM_HEIGHT = 40;

/**
 * The "more" button of a table row. The list is rendered in the page body (a scrolling table would clip it),
 * opens with Enter / Space / ArrowDown, moves with the arrow keys, closes with Escape or a click elsewhere,
 * and hands focus back to the button.
 */
export function RowMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const visible = items;

  const close = useCallback((restoreFocus = true) => {
    setPos(null);
    if (restoreFocus) trigger.current?.focus();
  }, []);

  function open() {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    const height = visible.length * ITEM_HEIGHT + 16;
    const below = rect.bottom + 4 + height <= window.innerHeight;
    setPos({
      top: below ? rect.bottom + 4 : Math.max(8, rect.top - 4 - height),
      right: Math.max(8, window.innerWidth - rect.right),
    });
  }

  const isOpen = pos !== null;

  useEffect(() => {
    if (!isOpen) return;
    list.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus();

    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!list.current?.contains(target) && !trigger.current?.contains(target)) setPos(null);
    };
    const onDismiss = () => setPos(null);
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("resize", onDismiss);
    window.addEventListener("scroll", onDismiss, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("resize", onDismiss);
      window.removeEventListener("scroll", onDismiss, true);
    };
  }, [isOpen]);

  function onListKey(e: React.KeyboardEvent) {
    const nodes = Array.from(list.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []);
    const at = nodes.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      nodes[(at + 1) % nodes.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      nodes[(at - 1 + nodes.length) % nodes.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      nodes[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      nodes.at(-1)?.focus();
    } else if (e.key === "Tab") {
      close(false);
    }
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => (isOpen ? close() : open())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !isOpen) {
            e.preventDefault();
            open();
          }
        }}
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-chalk-dim hover:bg-red-500/10 hover:text-chalk sm:h-9 sm:w-9"
      >
        <Ellipsis size={18} />
      </button>
      {pos &&
        createPortal(
          <div
            ref={list}
            role="menu"
            aria-label={label}
            onKeyDown={onListKey}
            style={{ position: "fixed", top: pos.top, right: pos.right }}
            className="z-[80] min-w-48 max-w-[calc(100vw-1rem)] rounded-[10px] border border-line bg-ink-2 p-1 shadow-xl shadow-black/25"
          >
            {visible.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.key}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  disabled={item.disabled}
                  onClick={() => {
                    close();
                    item.onSelect();
                  }}
                  className={cn(
                    "flex min-h-10 w-full items-center gap-2.5 rounded-md px-3 py-2 text-start text-sm outline-none transition-colors focus:bg-red-500/10 enabled:hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40",
                    item.danger ? "text-card-red" : "text-chalk",
                  )}
                >
                  {Icon && <Icon size={15} className="shrink-0" />}
                  <span className="min-w-0 flex-1">{item.label}</span>
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
