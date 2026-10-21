"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "@/components/icons/glyphs";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/LocaleProvider";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A modal dialog: focus moves in on open and returns on close, Tab stays inside, Escape closes (unless a
 * request is running), the page behind does not scroll. Mount it only while it is open.
 */
export function Dialog({
  title,
  description,
  onClose,
  onSubmit,
  children,
  footer,
  busy = false,
  size = "md",
}: {
  title: string;
  description?: string;
  onClose: () => void;
  /** When given, body and footer are wrapped in a `<form>` so Enter submits and the footer's submit button works. */
  onSubmit?: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  busy?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const t = useT();
  const titleId = useId();
  const descId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);

  useEffect(() => {
    closeRef.current = onClose;
    busyRef.current = busy;
  });

  useEffect(() => {
    const node = panel.current;
    if (!node) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // First field of the body; the close button only when there is nothing else.
    const first = node.querySelector<HTMLElement>(
      "[data-dialog-body] :is(input, select, textarea, button, a[href]):not([disabled]):not([type='hidden'])",
    );
    (first ?? node.querySelector<HTMLElement>(FOCUSABLE) ?? node).focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        if (!busyRef.current) closeRef.current();
        return;
      }
      if (e.key !== "Tab" || !node) return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !node.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !node.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);

  if (typeof document === "undefined") return null;

  const content = (
    <>
      <div data-dialog-body className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
        {children}
      </div>
      {footer && (
        <div className="flex flex-col-reverse gap-2 border-t border-line px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:px-6">
          {footer}
        </div>
      )}
    </>
  );
  const bodyClass = "flex min-h-0 flex-1 flex-col";

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          "flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-ink-2 shadow-2xl shadow-black/30 outline-none sm:rounded-[14px]",
          size === "sm" && "sm:max-w-md",
          size === "md" && "sm:max-w-xl",
          size === "lg" && "sm:max-w-3xl",
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-6 sm:py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold text-chalk">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-0.5 text-sm leading-snug text-chalk-dim">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label={t("common.close")}
            className="-m-1.5 rounded-lg p-2 text-chalk-faint hover:text-chalk disabled:opacity-40"
          >
            <X size={16} />
          </button>
        </div>
        {onSubmit ? (
          <form
            noValidate
            className={bodyClass}
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit();
            }}
          >
            {content}
          </form>
        ) : (
          <div className={bodyClass}>{content}</div>
        )}
      </div>
    </div>,
    document.body,
  );
}
