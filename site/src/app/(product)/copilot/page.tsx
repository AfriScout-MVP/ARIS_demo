"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, CornerDownLeft, Sparkles, Trash2 } from "@/components/icons/glyphs";
import { cn } from "@/lib/utils";
import { useLocale, useT } from "@/lib/i18n/LocaleProvider";
import { useScope } from "@/lib/scope/ScopeProvider";
import { PageHeading } from "@/components/layout/PageHeading";
import { Button, Card, EmptyState } from "@/components/ui";
import { ask, suggestions, type Answer } from "@/lib/copilot";

interface Turn {
  id: number;
  question: string;
  answer: Answer | null;
}

export default function CopilotPage() {
  const t = useT();
  const { locale } = useLocale();
  const { codes } = useScope();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, busy]);

  function submit(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    setDraft("");
    setBusy(true);
    // A short beat so the answer reads as a response, not an instant lookup.
    window.setTimeout(() => {
      setTurns((prev) => [...prev, { id: prev.length, question: text, answer: ask(text, locale, codes) }]);
      setBusy(false);
    }, 380);
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeading titleKey="copilot.title" subtitleKey="subtitles.copilot" />

      <Card className="flex min-h-[62vh] flex-col" padded={false}>
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-var/30 bg-var/10 text-var">
              <Sparkles size={14} />
            </span>
            <div>
              <p className="font-display text-sm font-semibold text-chalk">{t("copilot.title")}</p>
              <p className="text-[11px] text-chalk-faint">{t("copilot.disclaimer")}</p>
            </div>
          </div>
          {turns.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setTurns([])}>
              <Trash2 size={13} />
              <span className="hidden sm:inline">{t("copilot.clear")}</span>
            </Button>
          )}
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {turns.length === 0 && !busy && (
            <div className="space-y-4">
              <EmptyState title={t("copilot.intro")} hint={t("copilot.introSub")} />
              <div>
                <p className="mb-2 text-xs font-medium text-chalk-faint">
                  {t("copilot.suggestions")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {suggestions(locale).map((s) => (
                    <button
                      key={s}
                      onClick={() => submit(s)}
                      className="rounded-lg border border-line bg-ink-1 px-3 py-1.5 text-left text-xs max-sm:min-h-10 text-chalk-dim transition-colors hover:border-line-strong hover:text-chalk"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {turns.map((turn) => (
            <div key={turn.id} className="space-y-3 rise">
              <div className="flex justify-end">
                <p className="max-w-[90%] rounded-[10px] rounded-br-sm bg-red-600 px-3 py-2 text-sm text-white">
                  {turn.question}
                </p>
              </div>

              <div className="flex gap-2.5">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-var/30 bg-var/10 text-var">
                  <Sparkles size={12} />
                </span>
                <div className="min-w-0 flex-1">
                  {turn.answer ? (
                    <>
                      <p className="text-sm leading-relaxed text-chalk">{turn.answer.headline}</p>
                      {turn.answer.detail && (
                        <p className="mt-1.5 text-xs leading-relaxed text-chalk-dim">{turn.answer.detail}</p>
                      )}

                      {turn.answer.rows.length > 0 && (
                        <>
                          <p className="mb-1.5 mt-3 text-xs font-medium text-chalk-faint">
                            {t("copilot.sources")}
                          </p>
                          <ul className="overflow-hidden rounded-[10px] border border-line">
                            {turn.answer.rows.map((row, i) => (
                              <li key={`${row.label}-${i}`}>
                                {row.href ? (
                                  <Link
                                    href={row.href}
                                    className="flex items-center justify-between gap-3 border-b border-line px-3 py-2 last:border-0 row-hover"
                                  >
                                    <span className="min-w-0 truncate text-xs text-chalk">{row.label}</span>
                                    <span className="shrink-0 text-xs text-chalk-faint">{row.meta}</span>
                                  </Link>
                                ) : (
                                  <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-2 last:border-0">
                                    <span className="min-w-0 truncate text-xs text-chalk">{row.label}</span>
                                    <span className="shrink-0 text-xs text-chalk-faint">{row.meta}</span>
                                  </div>
                                )}
                              </li>
                            ))}
                          </ul>
                        </>
                      )}

                      <Link
                        href={turn.answer.sourceHref}
                        className="mt-2.5 inline-flex items-center gap-1 text-xs text-var hover:underline max-sm:-my-3 max-sm:py-3"
                      >
                        {turn.answer.sourceLabel}
                        <ArrowUpRight size={12} />
                      </Link>
                    </>
                  ) : (
                    <p className="text-sm leading-relaxed text-chalk-dim">{t("copilot.cannotAnswer")}</p>
                  )}
                </div>
              </div>
            </div>
          ))}

          {busy && (
            <div className="flex items-center gap-2.5 text-xs text-chalk-faint">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg border border-var/30 bg-var/10 text-var">
                <Sparkles size={12} />
              </span>
              <span className="live-dot">{t("copilot.thinking")}</span>
            </div>
          )}

          <div ref={endRef} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(draft);
          }}
          className="flex items-center gap-2 border-t border-line px-3 py-3"
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("copilot.placeholder")}
            className="min-w-0 flex-1 rounded-lg border border-line bg-ink-1 px-3 py-2 text-sm text-chalk outline-none placeholder:text-chalk-faint focus:border-line-strong"
          />
          <Button type="submit" variant="primary" disabled={!draft.trim() || busy} className={cn("shrink-0")}>
            <CornerDownLeft size={13} />
            <span className="hidden sm:inline">{t("copilot.send")}</span>
          </Button>
        </form>
      </Card>
    </div>
  );
}
