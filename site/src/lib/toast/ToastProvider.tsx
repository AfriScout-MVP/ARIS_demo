"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, X } from "@/components/icons/glyphs";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/LocaleProvider";

type ToastTone = "error" | "success";
interface Toast {
  id: number;
  tone: ToastTone;
  text: string;
}

interface ToastValue {
  push: (tone: ToastTone, text: string) => void;
}

const ToastContext = createContext<ToastValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const t = useT();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((prev) => prev.filter((x) => x.id !== id)), []);

  const push = useCallback<ToastValue["push"]>(
    (tone, text) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev.slice(-3), { id, tone, text }]);
      window.setTimeout(() => dismiss(id), tone === "error" ? 7000 : 3500);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.tone === "error" ? "alert" : "status"}
            className={cn(
              "pointer-events-auto flex w-full max-w-md items-start gap-2.5 rounded-[10px] border bg-ink-2 px-3.5 py-3 text-sm text-chalk shadow-xl shadow-black/20",
              toast.tone === "error" ? "border-red-500/40" : "border-emerald-500/40",
            )}
          >
            {toast.tone === "error" ? (
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
            ) : (
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            )}
            <span className="min-w-0 flex-1 leading-snug">{toast.text}</span>
            <button
              onClick={() => dismiss(toast.id)}
              aria-label={t("common.close")}
              className="-m-1.5 rounded-lg p-1.5 text-chalk-faint hover:text-chalk"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
