import {
  CalendarDays,
  ClipboardList,
  Compass,
  Files,
  Gauge,
  GitCompareArrows,
  GraduationCap,
  Insight,
  Landmark,
  LayoutDashboard,
  Map,
  Podium,
  Whistle,
  type IconType,
} from "@/components/icons/glyphs";
import type { TKey } from "@/lib/i18n/LocaleProvider";

export interface NavItem {
  href: string;
  labelKey: TKey;
  subtitleKey: TKey;
  icon: IconType;
}

export interface NavGroup {
  labelKey: TKey;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
  {
    labelKey: "nav.groupOperations",
    items: [
      { href: "/", labelKey: "nav.overview", subtitleKey: "subtitles.overview", icon: LayoutDashboard },
      { href: "/calendar", labelKey: "nav.calendar", subtitleKey: "subtitles.calendar", icon: CalendarDays },
      { href: "/arae", labelKey: "nav.arae", subtitleKey: "subtitles.arae", icon: Compass },
      { href: "/copilot", labelKey: "nav.copilot", subtitleKey: "subtitles.copilot", icon: Insight },
    ],
  },
  {
    labelKey: "nav.groupPerformance",
    items: [
      { href: "/decision-engine", labelKey: "nav.matchReview", subtitleKey: "subtitles.matchReview", icon: Gauge },
      { href: "/assessments", labelKey: "nav.assessments", subtitleKey: "subtitles.assessments", icon: ClipboardList },
      { href: "/heatmaps", labelKey: "nav.positioning", subtitleKey: "subtitles.positioning", icon: Map },
      { href: "/rankings", labelKey: "nav.rankings", subtitleKey: "subtitles.rankings", icon: Podium },
      { href: "/compare", labelKey: "nav.compare", subtitleKey: "subtitles.compare", icon: GitCompareArrows },
    ],
  },
  {
    labelKey: "nav.groupPeople",
    items: [
      { href: "/referees", labelKey: "nav.referees", subtitleKey: "subtitles.referees", icon: Whistle },
      { href: "/development", labelKey: "nav.development", subtitleKey: "subtitles.development", icon: GraduationCap },
    ],
  },
  {
    labelKey: "nav.groupOrganisation",
    items: [
      { href: "/federations", labelKey: "nav.federations", subtitleKey: "subtitles.federations", icon: Landmark },
      { href: "/reports", labelKey: "nav.reports", subtitleKey: "subtitles.reports", icon: Files },
    ],
  },
];

export const navItems: NavItem[] = navGroups.flatMap((g) => g.items);
