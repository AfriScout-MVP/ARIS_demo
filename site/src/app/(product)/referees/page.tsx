"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Award, Gauge, Search, ShieldAlert, TrendingDown, TrendingUp, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale, useT } from "@/lib/i18n/LocaleProvider";
import { useScope } from "@/lib/scope/ScopeProvider";
import { PageHeading } from "@/components/layout/PageHeading";
import { Avatar, Badge, Board, Card, EmptyState, ScoreRing, Segmented, Td, Th } from "@/components/ui";
import {
  countryFlag,
  countryName,
  fixtures,
  referees,
  type RefereeLevel,
  type RefereeStatus,
} from "@/lib/mock-data";

const levels: Array<RefereeLevel | "all"> = ["all", "CAF Elite", "FIFA Listed", "National D1", "Regional"];

const statusTone: Record<RefereeStatus, "pitch" | "amber" | "red" | "neutral"> = {
  "elite-pool": "pitch",
  active: "neutral",
  training: "amber",
  suspended: "red",
};

const statusKey: Record<RefereeStatus, "common.elitePool" | "common.active" | "common.training" | "common.suspended"> = {
  "elite-pool": "common.elitePool",
  active: "common.active",
  training: "common.training",
  suspended: "common.suspended",
};

export default function RefereesPage() {
  const t = useT();
  const { locale } = useLocale();
  const { codes } = useScope();
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<RefereeLevel | "all">("all");
  const [sort, setSort] = useState<"arps" | "matches" | "trend">("arps");

  const nextAppointments = useMemo(() => {
    const map = new Map<string, string>();
    fixtures
      .filter((f) => !f.played)
      .sort((a, b) => a.date.localeCompare(b.date))
      .forEach((f) => {
        f.crew.forEach((slot) => {
          if (slot.officialId && !map.has(slot.officialId)) {
            map.set(slot.officialId, `${f.home} — ${f.away} · ${f.date}`);
          }
        });
      });
    return map;
  }, []);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return referees
      .filter((r) => codes.includes(r.countryCode))
      .filter((r) => level === "all" || r.level === level)
      .filter(
        (r) =>
          !q ||
          `${r.name} ${countryName(r.countryCode, locale)} ${r.city}`.toLowerCase().includes(q),
      )
      .sort((a, b) =>
        sort === "arps" ? b.arps - a.arps : sort === "matches" ? b.matches - a.matches : b.trend - a.trend,
      );
  }, [codes, level, query, sort, locale]);

  const avg = rows.length ? rows.reduce((s, r) => s + r.arps, 0) / rows.length : 0;

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeading titleKey="referees.title" subtitleKey="subtitles.referees" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Board primary tone="var" icon={Users} label={t("referees.title")} value={rows.length} />
        <Board
          tone="gold"
          icon={Gauge}
          label={t("overview.kpiArps")}
          value={avg ? avg.toFixed(1) : "—"}
        />
        <Board
          tone="pitch"
          icon={Award}
          label={t("common.elitePool")}
          value={rows.filter((r) => r.level === "CAF Elite").length}
        />
        <Board
          icon={ShieldAlert}
          label={t("common.suspended")}
          value={rows.filter((r) => r.status === "suspended").length}
          tone={rows.some((r) => r.status === "suspended") ? "red" : "chalk"}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-[210px] flex-1 items-center gap-2 rounded-lg border border-line bg-ink-1 px-3 py-2 sm:max-w-xs">
          <Search size={14} className="text-chalk-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("referees.searchPlaceholder")}
            className="w-full bg-transparent text-sm text-chalk outline-none placeholder:text-chalk-faint"
          />
        </div>

        <div className="scroll-x -mx-3 px-3 sm:mx-0 sm:px-0">
          <Segmented
            value={level}
            onChange={setLevel}
            options={levels.map((l) => ({ value: l, label: l === "all" ? t("common.all") : l }))}
          />
        </div>

        <Segmented
          className="ml-auto"
          value={sort}
          onChange={setSort}
          options={[
            { value: "arps", label: "ARPS" },
            { value: "matches", label: t("referees.matchesOfficiated") },
            { value: "trend", label: t("common.trend") },
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState title={t("common.noResults")} hint={t("common.noResultsHint")} />
        </Card>
      ) : (
        <>
          {/* Phone: one card per official. */}
          <ul className="space-y-2 lg:hidden">
            {rows.map((referee) => (
              <li key={referee.id}>
                <Link
                  href={`/referees/${referee.id}`}
                  className="flex items-center gap-3 rounded-2xl border border-line bg-ink-2 p-3 lift"
                >
                  <Avatar initials={referee.initials} size={38} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-chalk">{referee.name}</p>
                    <p className="truncate text-xs text-chalk-faint">
                      {countryFlag(referee.countryCode)} {countryName(referee.countryCode, locale)} · {referee.level}
                    </p>
                    <p className="mt-1 truncate text-[11px] text-chalk-faint">
                      {t("referees.nextAppointment")}:{" "}
                      {nextAppointments.get(referee.id) ?? t("referees.noneScheduled")}
                    </p>
                  </div>
                  <ScoreRing value={referee.arps} size={42} />
                </Link>
              </li>
            ))}
          </ul>

          {/* Desktop: the dense table an assignor actually scans. */}
          <Card padded={false} className="hidden lg:block">
            <div className="scroll-x">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-line">
                    <Th>{t("common.referee")}</Th>
                    <Th>{t("common.country")}</Th>
                    <Th>{t("common.level")}</Th>
                    <Th>{t("common.status")}</Th>
                    <Th className="text-right">ARPS</Th>
                    <Th className="text-right">{t("referees.matchesOfficiated")}</Th>
                    <Th className="text-right">{t("referees.varAccuracy")}</Th>
                    <Th className="text-right">{t("common.trend")}</Th>
                    <Th>{t("referees.nextAppointment")}</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((referee) => (
                    <tr key={referee.id} className="border-b border-line last:border-0 row-hover">
                      <Td>
                        <Link href={`/referees/${referee.id}`} className="flex items-center gap-2.5">
                          <Avatar initials={referee.initials} size={28} />
                          <span className="text-chalk hover:underline">{referee.name}</span>
                        </Link>
                      </Td>
                      <Td>
                        {countryFlag(referee.countryCode)} {countryName(referee.countryCode, locale)}
                      </Td>
                      <Td>{referee.level}</Td>
                      <Td>
                        <Badge tone={statusTone[referee.status]}>{t(statusKey[referee.status])}</Badge>
                      </Td>
                      <Td className="board text-right text-chalk">{referee.arps.toFixed(1)}</Td>
                      <Td className="tnum text-right">{referee.matches}</Td>
                      <Td className="tnum text-right">{referee.varAccuracy}%</Td>
                      <Td className="text-right">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 tnum",
                            referee.trend >= 0 ? "text-pitch" : "text-card-red",
                          )}
                        >
                          {referee.trend >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                          {Math.abs(referee.trend).toFixed(1)}
                        </span>
                      </Td>
                      <Td className="max-w-[240px] truncate text-chalk-faint">
                        {nextAppointments.get(referee.id) ?? t("referees.noneScheduled")}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      <p className="text-xs text-chalk-faint">
        {locale === "fr"
          ? `Assistants et quatrièmes arbitres sont pourvus depuis la liste nationale de chaque fédération — ouvrez une rencontre dans le calendrier pour la consulter.`
          : `Assistants and fourth officials are drawn from each federation's own national list — open a fixture in the calendar to see it.`}
      </p>
    </div>
  );
}
