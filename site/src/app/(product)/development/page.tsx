"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { GraduationCap, HeartPulse, Pencil, Plus, ShieldAlert, Timer, Users } from "@/components/icons/glyphs";
import { cn } from "@/lib/utils";
import { useFormatters, useT } from "@/lib/i18n/LocaleProvider";
import { useScope } from "@/lib/scope/ScopeProvider";
import { useDataset } from "@/lib/dataset/DatasetProvider";
import { PageHeading } from "@/components/layout/PageHeading";
import { Board, Button, Card, CardHeader, EmptyState, Segmented, Td, Th } from "@/components/ui";
import { CountryFlag } from "@/components/ui/CountryFlag";
import { CoursesPanel, FitnessDialog, LicencesPanel } from "@/components/development/TrainingPanels";
import { courses, fitnessTests, licenceStatus, licences, refereeById, refereeHref, referees, type FitnessTest } from "@/lib/store";

type Tab = "licences" | "fitness" | "courses";
const TABS: readonly Tab[] = ["licences", "fitness", "courses"];

// The tab lives in the address (`?tab=fitness`), so dashboards and notifications can link straight to it.
export default function DevelopmentPage() {
  return (
    <Suspense fallback={null}>
      <Development />
    </Suspense>
  );
}

function Development() {
  const t = useT();
  const fmt = useFormatters();
  const { codes } = useScope();
  const router = useRouter();
  const pathname = usePathname();
  const asked = useSearchParams().get("tab");
  const tab: Tab = TABS.includes(asked as Tab) ? (asked as Tab) : "licences";
  const setTab = (next: Tab) => router.replace(next === "licences" ? pathname : `${pathname}?tab=${next}`, { scroll: false });
  const { refresh } = useDataset();
  const [recording, setRecording] = useState<FitnessTest | "new" | null>(null);

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

      {tab === "licences" && <LicencesPanel />}

      {tab === "fitness" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2" padded={false}>
            <div className="px-4 py-3">
              <CardHeader
                icon={HeartPulse}
                tint="pitch"
                title={t("development.fitnessTitle")}
                subtitle={t("development.fitnessSub")}
                className="mb-0"
                action={
                  <Button variant="primary" size="sm" onClick={() => setRecording("new")}>
                    <Plus size={14} />
                    {t("development.recordTest")}
                  </Button>
                }
              />
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
                    <Th>
                      <span className="sr-only">{t("admin.common.actions")}</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {scopedFitness.map((test) => {
                    const referee = refereeById.get(test.refereeId)!;
                    return (
                      <tr key={test.refereeId} className="border-b border-line last:border-0 row-hover">
                        <Td>
                          <Link href={refereeHref(referee.id)} className="text-chalk hover:underline">
                            <CountryFlag code={referee.countryCode} /> {referee.name}
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
                        <Td className="text-right">
                          <Button size="sm" variant="ghost" aria-label={t("development.updateTestFor", { name: referee.name })} onClick={() => setRecording(test)}>
                            <Pencil size={14} />
                          </Button>
                        </Td>
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

      {tab === "courses" && <CoursesPanel />}

      {recording && (
        <FitnessDialog
          test={recording === "new" ? undefined : recording}
          onClose={() => setRecording(null)}
          onDone={() => {
            setRecording(null);
            void refresh();
          }}
        />
      )}
    </div>
  );
}
