import {
  Scale,
  Banknote,
  BarChart3,
  CalendarDays,
  ClipboardList,
  Compass,
  Files,
  Flag,
  Gauge,
  GitCompareArrows,
  GraduationCap,
  Handshake,
  Globe2,
  History,
  Insight,
  Landmark,
  LayoutDashboard,
  Map,
  Podium,
  ShieldAlert,
  Trophy,
  Users,
  Whistle,
  type IconType,
} from "@/components/icons/glyphs";
import type { TKey } from "@/locales";
import type { Role } from "@/lib/api/types";

export interface NavItem {
  href: string;
  labelKey: TKey;
  subtitleKey?: TKey;
  icon: IconType;
  /** Roles that see this entry; every staff role when omitted. */
  roles?: Role[];
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
      { href: "/decision-engine", labelKey: "nav.matchReview", subtitleKey: "subtitles.matchReview", icon: Gauge, roles: ["admin", "federation", "tagger"] },
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
      { href: "/discipline", labelKey: "nav.discipline", subtitleKey: "subtitles.discipline", icon: ShieldAlert },
    ],
  },
  {
    labelKey: "nav.groupOrganisation",
    items: [
      // the continental comparison of federations is for the confederation, not for one federation's seat
      { href: "/federations", labelKey: "nav.federations", subtitleKey: "subtitles.federations", icon: Landmark, roles: ["admin"] },
      { href: "/finance", labelKey: "nav.finance", subtitleKey: "subtitles.finance", icon: Banknote },
      { href: "/analytics", labelKey: "nav.analytics", subtitleKey: "subtitles.analytics", icon: BarChart3 },
      { href: "/reports", labelKey: "nav.reports", subtitleKey: "subtitles.reports", icon: Files },
    ],
  },
  {
    labelKey: "nav.groupAdmin",
    items: [
      { href: "/admin/accounts", labelKey: "nav.adminAccounts", icon: Users },
      { href: "/admin/partnerships", labelKey: "nav.adminPartnerships", icon: Handshake, roles: ["admin"] },
      { href: "/admin/federations", labelKey: "nav.adminFederations", icon: Landmark, roles: ["admin"] },
      { href: "/admin/countries", labelKey: "nav.adminCountries", icon: Globe2, roles: ["admin"] },
      { href: "/admin/competitions", labelKey: "nav.adminCompetitions", icon: Trophy },
      { href: "/admin/teams", labelKey: "nav.adminTeams", icon: Flag },
      { href: "/admin/grid", labelKey: "nav.adminGrid", icon: Scale, roles: ["admin"] },
      { href: "/admin/audit", labelKey: "nav.adminAudit", icon: History },
    ],
  },
];

const STAFF: Role[] = ["admin", "federation"];

/** Does this role see the entry? */
export const canSee = (item: NavItem, role: Role | null | undefined) =>
  Boolean(role) && (item.roles ?? STAFF).includes(role as Role);

/** The navigation as one role sees it: entries it may not use are gone, and so are groups left empty. */
export function navGroupsFor(role: Role | null | undefined): NavGroup[] {
  return navGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => canSee(item, role)) }))
    .filter((group) => group.items.length > 0);
}

/** Flat list of what one role may open — the command palette's pages. */
export const navItemsFor = (role: Role | null | undefined): NavItem[] => navGroupsFor(role).flatMap((g) => g.items);
