"use client";

import { useMemo, useState } from "react";
import { ClipboardCheck, Film, MessageSquare, Pencil, Plus, Star } from "@/components/icons/glyphs";
import { Badge, Button, Card, CardHeader, Meter } from "@/components/ui";
import { ErrorState, ListSkeleton } from "@/components/admin/states";
import { FormError, TextAreaField } from "@/components/admin/fields";
import { listAssessments, listCriteria, listMyMatches, type AssessmentRow } from "@/lib/api/assessments";
import { listAssessmentComments, postAssessmentComment } from "@/lib/api/me";
import { isLate, observerDuties } from "@/lib/assessments/rules";
import { useAction, useResource } from "@/lib/admin/hooks";
import { pickLocalized } from "@/lib/i18n/localized";
import { useFormatters, useLocale, useT, type TKey } from "@/lib/i18n/LocaleProvider";
import { useToast } from "@/lib/toast/ToastProvider";
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
                      <CommentThread assessmentId={r.id} />
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

const ROLE_TONE: Record<string, "neutral" | "amber" | "var"> = { referee: "neutral", federation: "var", admin: "var" };

/** The back-and-forth on one assessment: a plain comment, or a contest the federation can answer. */
function CommentThread({ assessmentId }: { assessmentId: string }) {
  const t = useT();
  const fmt = useFormatters();
  const toast = useToast();
  const [tick, setTick] = useState(0);
  const thread = useResource(`assessment-comments|${assessmentId}|${tick}`, (signal) => listAssessmentComments(assessmentId, signal));
  const { busy, error, run, reset } = useAction();
  const [body, setBody] = useState("");
  const [contesting, setContesting] = useState(false);

  async function send(kind: "comment" | "contest") {
    const res = await run(() => postAssessmentComment(assessmentId, body.trim(), kind));
    if (res.ok) {
      toast.push("success", t("assessments.comments.posted"));
      setBody("");
      setContesting(false);
      setTick((n) => n + 1);
    }
  }

  if (thread.loading) return null;
  if (thread.error || !thread.data) {
    return (
      <div className="border-t border-line pt-3">
        <button type="button" className="text-xs text-chalk-faint underline-offset-2 hover:text-chalk hover:underline" onClick={thread.reload}>
          {t("admin.common.retry")}
        </button>
      </div>
    );
  }
  const { comments, contest } = thread.data;

  return (
    <div className="space-y-2 border-t border-line pt-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-chalk-dim">
        <MessageSquare size={14} />
        {t("assessments.comments.title")}
        {contest === "open" && <Badge tone="amber">{t("assessments.comments.contestOpen")}</Badge>}
        {contest === "answered" && <Badge tone="pitch">{t("assessments.comments.contestAnswered")}</Badge>}
      </p>
      {comments.length === 0 ? (
        <p className="text-xs text-chalk-faint">{t("assessments.comments.none")}</p>
      ) : (
        <ul className="space-y-1.5">
          {comments.map((cm) => (
            <li key={cm.id} className="rounded-lg border border-line bg-ink-2 px-2.5 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-medium text-chalk">
                  {cm.authorName ?? t(`assessments.comments.role.${cm.authorRole}` as TKey)}
                  {cm.kind === "contest" && <Badge tone={ROLE_TONE[cm.authorRole]}>{t("assessments.comments.kind.contest")}</Badge>}
                </span>
                <span className="text-[11px] text-chalk-faint">{fmt.date(cm.createdAt.slice(0, 10))}</span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-chalk-dim">{cm.body}</p>
            </li>
          ))}
        </ul>
      )}
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim().length >= 3) void send(contesting ? "contest" : "comment");
        }}
      >
        <TextAreaField
          label={t(contesting ? "assessments.comments.contestLabel" : "assessments.comments.label")}
          value={body}
          onChange={setBody}
          rows={2}
          maxLength={2000}
        />
        <FormError error={error} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            className="text-xs text-chalk-faint underline-offset-2 hover:text-chalk hover:underline"
            onClick={() => {
              reset();
              setContesting((v) => !v);
            }}
          >
            {t(contesting ? "assessments.comments.switchToComment" : "assessments.comments.switchToContest")}
          </button>
          <Button type="submit" size="sm" variant={contesting ? "danger" : "secondary"} disabled={busy || body.trim().length < 3}>
            {busy ? t("admin.common.working") : t(contesting ? "assessments.comments.sendContest" : "assessments.comments.send")}
          </Button>
        </div>
      </form>
    </div>
  );
}
