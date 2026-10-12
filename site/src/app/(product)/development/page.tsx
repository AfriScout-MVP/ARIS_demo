"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BadgeCheck, GraduationCap, HeartPulse, ShieldAlert, Timer, Users } from "@/components/icons/glyphs";
import { cn } from "@/lib/utils";
import { useFormatters, useLocale, useT } from "@/lib/i18n/LocaleProvider";
import { useScope } from "@/lib/scope/ScopeProvider";
import { PageHeading } from "@/components/layout/PageHeading";
import { Badge, Board, Button, Card, CardHeader, EmptyState, Meter, Segmented, Td, Th } from "@/components/ui";
import {
  countryFlag,
  courses,
  fitnessTests,
  licenceStatus,
  licences,
  refereeById,
  referees,
} from "@/lib/mock-data";

type Tab = "licences" | "fitness" | "courses";

export default function DevelopmentPage() {
  const t = useT();
  const { locale } = useLocale();
  const fmt = useFormatters();
  const { codes } = useScope();
  const [tab, setTab] = useState<Tab>("licences");

  const corps = useMemo(() => referees.filter((r) => codes.includes(r.countryCode)), [codes]);
  const corpsIds = useMemo(() => new Set(corps.map((r) => r.id)), [corps]);

  const scopedLicences = useMemo(
    () =>
      licences
        .filter((l) => corpsIds.has(l.refereeId))
        .map((l) => ({ licence: l, status: licenceStatus(l) }))
        .sort((a, b) => a.licence.expires.localeCompare(b.licence.expires)),
    [corpsIds],
  );

  const scopedFitness = useMemo(
    () => fitnessTests.filter((f) => corpsIds.has(f.refereeId)),
    [corpsIds],
  );

  const atRisk = scopedLicences.filter((l) => l.status.state !== "valid");
  const failed = scopedFitness.filter(
    (f) => f.test1.result === "failed" || f.test2.result === "failed",
  );
  const scopedCourses = courses
    .map((c) => ({ ...c, refereeIds: c.refereeIds.filter((id) => corpsIds.has(id)) }))
    .filter((c) => c.refereeIds.length > 0);

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeading titleKey="development.title" subtitleKey="subtitles.development" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Board
          primary
          icon={ShieldAlert}
          label={t("development.expiring")}
          value={atRisk.length}
          tone={atRisk.length ? "amber" : "pitch"}
          hint={t("development.expiringSub")}
        />
        <Board
          icon={Timer}
          label={t("development.failed")}
          value={failed.length}
          tone={failed.length ? "red" : "pitch"}
          hint={t("development.fitnessSub")}
        />
        <Board
          tone="gold"
          icon={GraduationCap}
          label={t("development.coursesTitle")}
          value={scopedCourses.length}
        />
        <Board tone="var" icon={Users} label={t("referees.title")} value={corps.length} />
      </div>

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: "licences", label: t("development.licences") },
          { value: "fitness", label: t("development.fitness") },
          { value: "courses", label: t("development.courses") },
        ]}
      />

      {tab === "licences" && (
        <Card padded={false}>
          <div className="px-4 py-3">
            <CardHeader icon={BadgeCheck} tint="var" title={t("development.licences")} subtitle={t("development.expiringSub")} className="mb-0" />
          </div>
          <div className="chalk-rule" />
          {scopedLicences.length === 0 ? (
            <div className="p-4">
              <EmptyState title={t("development.complianceOk")} />
            </div>
          ) : (
            <div className="scroll-x">
              <table className="w-full min-w-[640px] border-collapse">
                <thead>
                  <tr className="border-b border-line">
                    <Th>{t("common.referee")}</Th>
                    <Th>{t("development.licences")}</Th>
                    <Th>{t("development.issued")}</Th>
                    <Th>{t("development.expires")}</Th>
                    <Th>{t("common.status")}</Th>
                    <Th className="text-right">{t("development.renew")}</Th>
                  </tr>
                </thead>
                <tbody>
                  {scopedLicences.map(({ licence, status }) => {
                    const referee = refereeById.get(licence.refereeId)!;
                    return (
                      <tr key={licence.id} className="border-b border-line last:border-0 row-hover">
                        <Td>
                          <Link href={`/referees/${referee.id}`} className="text-chalk hover:underline">
                            {countryFlag(referee.countryCode)} {referee.name}
                          </Link>
                        </Td>
                        <Td>{licence.kind}</Td>
                        <Td className="tnum">{fmt.date(licence.issued)}</Td>
                        <Td className="tnum">{fmt.date(licence.expires)}</Td>
                        <Td>
                          <Badge
                            tone={status.state === "valid" ? "pitch" : status.state === "expiring" ? "amber" : "red"}
                          >
                            {status.state === "valid"
                              ? t("development.valid")
                              : status.state === "expiring"
                                ? t("development.expiresIn", { n: status.days })
                                : t("development.expired")}
                          </Badge>
                        </Td>
                        <Td className="text-right">
                          {status.state !== "valid" && (
                            <Button size="sm" variant="secondary">
                              {t("development.renew")}
                            </Button>
                          )}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === "fitness" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2" padded={false}>
            <div className="px-4 py-3">
              <CardHeader icon={HeartPulse} tint="pitch" title={t("development.fitnessTitle")} subtitle={t("development.fitnessSub")} className="mb-0" />
            </div>
            <div className="chalk-rule" />
            <div className="scroll-x">
              <table className="w-full min-w-[600px] border-collapse">
                <thead>
                  <tr className="border-b border-line">
                    <Th>{t("common.referee")}</Th>
                    <Th>{t("common.date")}</Th>
                    <Th>{t("development.test1")}</Th>
                    <Th>{t("development.test2")}</Th>
                    <Th>{t("development.retest")}</Th>
                  </tr>
                </thead>
                <tbody>
                  {scopedFitness.map((test) => {
                    const referee = refereeById.get(test.refereeId)!;
                    return (
                      <tr key={test.refereeId} className="border-b border-line last:border-0 row-hover">
                        <Td>
                          <Link href={`/referees/${referee.id}`} className="text-chalk hover:underline">
                            {countryFlag(referee.countryCode)} {referee.name}
                          </Link>
                        </Td>
                        <Td className="tnum">{fmt.date(test.date)}</Td>
                        <Td>
                          <span className={cn(test.test1.result === "passed" ? "text-pitch" : "text-card-red")}>
                            {t(test.test1.result === "passed" ? "development.passed" : "development.failed")}
                          </span>
                          <span className="ml-1.5 text-chalk-faint">{test.test1.bestSprint}s</span>
                        </Td>
                        <Td>
                          <span className={cn(test.test2.result === "passed" ? "text-pitch" : "text-card-red")}>
                            {t(test.test2.result === "passed" ? "development.passed" : "development.failed")}
                          </span>
                          <span className="ml-1.5 text-chalk-faint">{test.test2.laps}</span>
                        </Td>
                        <Td className="tnum">{test.retestDate ? fmt.date(test.retestDate) : "—"}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <CardHeader icon={ShieldAlert} tint="amber" title={t("development.complianceRisk")} />
            {failed.length === 0 && atRisk.length === 0 ? (
              <EmptyState title={t("development.complianceOk")} />
            ) : (
              <ul className="space-y-2">
                {failed.map((test) => {
                  const referee = refereeById.get(test.refereeId)!;
                  return (
                    <li
                      key={test.refereeId}
                      className="flex items-center gap-2.5 rounded-[10px] border border-card-red/25 bg-card-red/[0.06] px-3 py-2.5"
                    >
                      <Timer size={14} className="shrink-0 text-card-red" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs text-chalk">{referee.name}</p>
                        <p className="text-[11px] text-chalk-faint">
                          {t("development.retest")} {test.retestDate ? fmt.date(test.retestDate) : "—"}
                        </p>
                      </div>
                    </li>
                  );
                })}
                {atRisk.slice(0, 5).map(({ licence, status }) => {
                  const referee = refereeById.get(licence.refereeId)!;
                  return (
                    <li
                      key={licence.id}
                      className="flex items-center gap-2.5 rounded-[10px] border border-amber/25 bg-amber/[0.06] px-3 py-2.5"
                    >
                      <ShieldAlert size={14} className="shrink-0 text-amber" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs text-chalk">{referee.name}</p>
                        <p className="truncate text-[11px] text-chalk-faint">
                          {licence.kind} ·{" "}
                          {status.state === "expired"
                            ? t("development.expired")
                            : t("development.expiresIn", { n: status.days })}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      )}

      {tab === "courses" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {scopedCourses.length === 0 ? (
            <Card className="sm:col-span-2 xl:col-span-3">
              <EmptyState title={t("common.empty")} />
            </Card>
          ) : (
            scopedCourses.map((course) => (
              <Card key={course.id} interactive>
                <div className="flex items-start gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-ink-3 text-chalk-dim">
                    <GraduationCap size={15} />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium text-chalk">{course.name[locale]}</h3>
                    <p className="text-xs text-chalk-faint">
                      {course.provider} · {course.hours}
                      {t("common.hours")}
                    </p>
                  </div>
                </div>

                <Badge
                  className="mt-3"
                  tone={course.state === "completed" ? "pitch" : course.state === "enrolled" ? "amber" : "neutral"}
                >
                  {t(
                    course.state === "completed"
                      ? "development.completed"
                      : course.state === "enrolled"
                        ? "development.enrolled"
                        : "development.notStarted",
                  )}
                </Badge>

                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between text-xs text-chalk-faint">
                    <span>{t("referees.title")}</span>
                    <span className="board text-chalk">{course.refereeIds.length}</span>
                  </div>
                  <Meter
                    value={(course.refereeIds.length / Math.max(1, corps.length)) * 100}
                    tone={course.state === "completed" ? "pitch" : "chalk"}
                  />
                </div>

                <div className="mt-3 flex flex-wrap gap-1">
                  {course.refereeIds.slice(0, 6).map((id) => {
                    const referee = refereeById.get(id)!;
                    return (
                      <Link
                        key={id}
                        href={`/referees/${id}`}
                        className="rounded border border-line px-1.5 py-0.5 text-[10.5px] text-chalk-faint hover:text-chalk"
                      >
                        {referee.initials}
                      </Link>
                    );
                  })}
                  {course.refereeIds.length > 6 && (
                    <span className="px-1.5 py-0.5 text-[10.5px] text-chalk-faint">
                      +{course.refereeIds.length - 6}
                    </span>
                  )}
                </div>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
