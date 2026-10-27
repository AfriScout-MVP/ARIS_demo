"use client";

import { useMemo, useState } from "react";
import { ClipboardCheck, Film, Pencil, Plus, Star } from "@/components/icons/glyphs";
import { Badge, Button, Card, CardHeader, Meter } from "@/components/ui";
import { ErrorState, ListSkeleton } from "@/components/admin/states";
import { listAssessments, listCriteria, listMyMatches, type AssessmentRow } from "@/lib/api/assessments";
import { isLate, observerDuties } from "@/lib/assessments/rules";
import { useResource } from "@/lib/admin/hooks";
import { pickLocalized } from "@/lib/i18n/localized";
import { useFormatters, useLocale, useT } from "@/lib/i18n/LocaleProvider";
import { ReportDialog } from "./ReportDialog";

type Editing = { kind: "new"; matchId: string; title: string } | { kind: "draft"; report: AssessmentRow; title: string };

/**
 * The referee's side of observation: the matches they were appointed to observe (write, carry on, file),
 * and the reports about their own matches once the federation has released them.
 */
export function MyAssessments({ officialId }: { officialId: string }) {
  const t = useT();
  const { locale } = useLocale();
  const fmt = useFormatters();
  const data = useResource(`my-assessments|${officialId}`, async (signal) => {
    const [criteria, matches, reports] = await Promise.all([listCriteria(signal), listMyMatches(signal), listAssessments({}, signal)]);
    return { criteria, matches, reports };
  });
  const [editing, setEditing] = useState<Editing | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const duties = useMemo(() => (data.data ? observerDuties(data.data.matches, data.data.reports, officialId) : []), [data.data, officialId]);
  const aboutMe = useMemo(() => (data.data?.reports ?? []).filter((r) => r.refereeId === officialId), [data.data, officialId]);
  const matchOf = (id: string) => data.data?.matches.find((m) => m.id === id);

  if (data.loading) return <ListSkeleton rows={3} />;
  if (data.error || !data.data) return <ErrorState onRetry={data.reload} />;
  if (duties.length === 0 && aboutMe.length === 0) return null;
  const grid = data.data.criteria;
  const now = new Date();

  return (
    <>
      {duties.length > 0 && (
        <Card>
          <CardHeader icon={ClipboardCheck} tint="var" title={t("assessments.mine.duties")} subtitle={t("assessments.mine.dutiesHint")} />
          <ul className="space-y-2">
            {duties.map(({ match, report }) => {
              const title = `${match.home} — ${match.away} · ${fmt.date(match.date)}`;
              const late = !report && isLate(match.date, now);
              return (
                <li key={match.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-line bg-ink-1 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-chalk">
                      {match.home} <span className="board text-chalk-dim">{match.score}</span> {match.away}
                    </p>
                    <p className="text-[11px] text-chalk-faint">{fmt.date(match.date)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {!report ? (
                      <>
                        <Badge tone={late ? "red" : "amber"}>{t(late ? "assessments.mine.late" : "assessments.mine.toWrite")}</Badge>
                        <Button size="sm" variant="primary" onClick={() => setEditing({ kind: "new", matchId: match.id, title })} disabled={grid.length === 0}>
                          <Plus size={13} />
                          {t("assessments.mine.write")}
                        </Button>
                      </>
                    ) : report.state === "filed" ? (
                      <>
                        <Badge tone="pitch">{t("assessments.filed")}</Badge>
                        <span className="board text-sm text-chalk">{report.overall.toFixed(1)}</span>
                      </>
                    ) : (
                      <>
                        <Badge tone="amber">{t("assessments.draft")}</Badge>
                        <Button size="sm" variant="secondary" onClick={() => setEditing({ kind: "draft", report, title })}>
                          <Pencil size={13} />
                          {t("assessments.form.continueDraft")}
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {aboutMe.length > 0 && (
        <Card>
          <CardHeader icon={Star} tint="gold" title={t("assessments.mine.received")} subtitle={t("assessments.mine.receivedHint")} />
          <ul className="space-y-2">
            {aboutMe.map((r) => {
              const m = matchOf(r.matchId);
              const expanded = open === r.id;
              return (
                <li key={r.id} className="rounded-[10px] border border-line bg-ink-1">
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => setOpen(expanded ? null : r.id)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-chalk">{m ? `${m.home} — ${m.away}` : r.matchId}</span>
                      <span className="block text-[11px] text-chalk-faint">{m ? fmt.date(m.date) : ""}</span>
                    </span>
                    <span className="board text-base text-chalk">{r.overall.toFixed(1)}</span>
                  </button>
                  {expanded && (
                    <div className="space-y-3 border-t border-line px-3 py-3">
                      <div className="grid gap-2 sm:grid-cols-2">
                        {grid.map((c) => {
                          const v = r.marks[c.key];
                          return (
                            <div key={c.key}>
                              <div className="mb-1 flex items-center justify-between text-xs">
                                <span className="text-chalk-dim">{pickLocalized(c.label, locale)}</span>
                                <span className="board text-chalk">{typeof v === "number" ? v.toFixed(1) : "—"}</span>
                              </div>
                              <Meter value={typeof v === "number" ? v * 10 : 0} tone={typeof v === "number" && v >= 8 ? "pitch" : "amber"} />
                            </div>
                          );
                        })}
                      </div>
                      {pickLocalized(r.notes, locale) && <p className="text-sm leading-relaxed text-chalk-dim">{pickLocalized(r.notes, locale)}</p>}
                      {r.clips.length > 0 && (
                        <ul className="space-y-1">
                          {r.clips.map((clip, i) => (
                            <li key={i} className="flex items-center gap-2 text-xs text-chalk-dim">
                              <Film size={12} className="text-var" />
                              <span className="board w-8 text-chalk-faint">{clip.minute}&apos;</span>
                              {pickLocalized(clip.label, locale)}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {editing && (
        <ReportDialog
          mode={editing.kind === "new" ? { kind: "new", matchId: editing.matchId } : { kind: "draft", report: editing.report }}
          grid={grid}
          title={editing.title}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            data.reload();
          }}
        />
      )}
    </>
  );
}
