/**
 * ARIS glyphs — the product's own icon family.
 *
 * Drawn on a 24 grid with one rule set so they read as a family: 1.7 stroke,
 * square caps and mitered joins (the angles of pitch markings, not the blobs of
 * a UI kit), corners chamfered rather than rounded, a single filled dot as the
 * only accent. Referee-specific subjects (whistle, flag, pitch, podium) are
 * drawn from the game rather than from a generic metaphor.
 *
 * Names follow the common icon vocabulary so call sites stay readable; the
 * `Insight` glyph stands in wherever an AI feature used to wear a sparkle.
 */

import type { ComponentType, ReactNode, SVGProps } from "react";

export interface GlyphProps extends Omit<SVGProps<SVGSVGElement>, "ref"> {
  size?: number | string;
}

export type IconType = ComponentType<GlyphProps>;

function glyph(name: string, body: ReactNode): IconType {
  const Glyph = ({ size = 24, strokeWidth = 1.7, ...rest }: GlyphProps) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden={rest["aria-label"] ? undefined : true}
      {...rest}
    >
      {body}
    </svg>
  );
  Glyph.displayName = name;
  return Glyph;
}

/** A filled accent dot — the family's one recurring detail. */
const Dot = ({ cx, cy, r = 1.1 }: { cx: number; cy: number; r?: number }) => (
  <circle cx={cx} cy={cy} r={r} fill="currentColor" stroke="none" />
);

/* ---------------------------------------------------------------- navigation */

export const LayoutDashboard = glyph(
  "LayoutDashboard",
  <path d="M3 3h8v11H3zM14 3h7v6h-7zM14 12h7v9h-7zM3 17h8v4H3z" />,
);
export const LayoutGrid = glyph("LayoutGrid", <path d="M3 3h8v8H3zM14 3h7v5h-7zM14 11h7v10h-7zM3 14h8v7H3z" />);
export const CalendarDays = glyph(
  "CalendarDays",
  <>
    <path d="M4 5h16v15H4zM4 10h16M8 3v4M16 3v4" />
    <Dot cx={8.5} cy={14} />
    <Dot cx={12} cy={14} />
    <Dot cx={15.5} cy={14} />
  </>,
);
export const CalendarCheck = glyph(
  "CalendarCheck",
  <path d="M4 5h16v15H4zM4 10h16M8 3v4M16 3v4M9 15l2.2 2.2L15.5 13" />,
);
export const CalendarOff = glyph("CalendarOff", <path d="M4 5h16v15H4zM4 10h16M8 3v4M16 3v4M6 21 19 8" />);
export const Compass = glyph(
  "Compass",
  <>
    <circle cx={12} cy={12} r={9} />
    <path d="M15.8 8.2 13.6 13.6 8.2 15.8 10.4 10.4z" />
  </>,
);
/** ARIS intelligence — the brand's pitch diagonal inside a lens. Replaces the sparkle. */
export const Insight = glyph(
  "Insight",
  <>
    <circle cx={12} cy={12} r={9} />
    <path d="M7.5 16.5 16.5 7.5" />
    <Dot cx={7.5} cy={16.5} r={1.4} />
    <Dot cx={16.5} cy={7.5} r={1.4} />
  </>,
);
export const Sparkles = Insight;
export const Gauge = glyph(
  "Gauge",
  <>
    <path d="M4.2 18.5a9 9 0 1 1 15.6 0M12 13.5 16 8.5" />
    <Dot cx={12} cy={13.5} r={1.4} />
  </>,
);
export const ClipboardList = glyph(
  "ClipboardList",
  <path d="M8 3h8v4H8zM8 5H5v16h14V5h-3M9 12h6M9 16.5h4" />,
);
export const ClipboardCheck = glyph(
  "ClipboardCheck",
  <path d="M8 3h8v4H8zM8 5H5v16h14V5h-3M9 14l2.2 2.2L15.5 12" />,
);
/** Positioning — the pitch seen from above. */
export const Map = glyph(
  "Map",
  <>
    <path d="M3 5h18v14H3zM12 5v14M3 9.5h3.5v5H3M21 9.5h-3.5v5H21" />
    <circle cx={12} cy={12} r={2.5} />
  </>,
);
export const Trophy = glyph(
  "Trophy",
  <path d="M7 4h10v5.5a5 5 0 0 1-10 0zM7 6H3.5v2A3.5 3.5 0 0 0 7 11.5M17 6h3.5v2a3.5 3.5 0 0 1-3.5 3.5M12 14.5V18M8 21h8M9.5 18h5" />,
);
export const Podium = glyph("Podium", <path d="M2.5 21h19M2.5 21v-7H9v7M9 21V8h6v13M15 21v-9.5h6.5V21" />);
export const GitCompareArrows = glyph(
  "GitCompareArrows",
  <>
    <circle cx={8} cy={12} r={5} />
    <circle cx={16} cy={12} r={5} />
  </>,
);
export const Users = glyph(
  "Users",
  <>
    <circle cx={9} cy={8} r={3.5} />
    <path d="M2.5 20.5v-1.5a4.5 4.5 0 0 1 4.5-4.5h4a4.5 4.5 0 0 1 4.5 4.5v1.5M16 4.7a3.5 3.5 0 0 1 0 6.6M18.5 14.7a4.5 4.5 0 0 1 3 4.3v1.5" />
  </>,
);
export const User = glyph(
  "User",
  <>
    <circle cx={12} cy={8} r={4} />
    <path d="M4.5 21v-1.5A4.5 4.5 0 0 1 9 15h6a4.5 4.5 0 0 1 4.5 4.5V21" />
  </>,
);
export const UserPlus = glyph(
  "UserPlus",
  <>
    <circle cx={9} cy={8} r={3.8} />
    <path d="M2.5 20.5V19A4.5 4.5 0 0 1 7 14.5h4A4.5 4.5 0 0 1 15.5 19v1.5M19 8v6M16 11h6" />
  </>,
);
/** The referee. */
export const Whistle = glyph(
  "Whistle",
  <>
    <circle cx={15.5} cy={14.5} r={5.5} />
    <path d="M10.2 11.2H2.5V8h11.2M16 9V4h4.5" />
    <Dot cx={15.5} cy={14.5} r={1.3} />
  </>,
);
export const Flag = glyph("Flag", <path d="M5 21V3M5 4h13.5l-3 4.5 3 4.5H5" />);
export const Globe2 = glyph(
  "Globe2",
  <>
    <circle cx={12} cy={12} r={9} />
    <path d="M3 12h18M12 3c-3.2 3-3.2 15 0 18M12 3c3.2 3 3.2 15 0 18" />
  </>,
);
export const Landmark = glyph(
  "Landmark",
  <path d="M2.5 9.5 12 4l9.5 5.5zM5 11.5v7M9.7 11.5v7M14.3 11.5v7M19 11.5v7M3 21h18" />,
);
export const Files = glyph("Files", <path d="M8 3h9l4 4v13H8zM17 3v4h4M4 7v14h11" />);
export const FileText = glyph("FileText", <path d="M5 3h9l5 5v13H5zM14 3v5h5M8.5 13h7M8.5 17h5" />);

/* ---------------------------------------------------------------- trends, data */

export const TrendingUp = glyph("TrendingUp", <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />);
export const TrendingDown = glyph("TrendingDown", <path d="M3 7l6 6 4-4 8 8M15 17h6v-6" />);
export const BarChart3 = glyph("BarChart3", <path d="M3 21h18M6.5 21v-8M12 21V5M17.5 21v-11" />);
export const Activity = glyph("Activity", <path d="M2.5 12h4l3-8 5 16 3-8h4" />);
export const Radar = glyph(
  "Radar",
  <>
    <circle cx={12} cy={12} r={9} />
    <circle cx={12} cy={12} r={4.5} />
    <path d="M12 12 18.4 5.6" />
    <Dot cx={12} cy={12} r={1.2} />
  </>,
);
export const Target = glyph(
  "Target",
  <>
    <circle cx={12} cy={12} r={9} />
    <circle cx={12} cy={12} r={4.5} />
    <Dot cx={12} cy={12} r={1.3} />
  </>,
);
export const Layers = glyph("Layers", <path d="M12 3 3 8l9 5 9-5zM3 12.5l9 5 9-5M3 16.5l9 5 9-5" />);
export const Route = glyph(
  "Route",
  <>
    <circle cx={6} cy={18} r={2.4} />
    <circle cx={18} cy={6} r={2.4} />
    <path d="M8.4 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.6" />
  </>,
);
export const Ruler = glyph("Ruler", <path d="M3 16 16 3l5 5L8 21zM7 12l2.5 2.5M10 9l2.5 2.5M13 6l2.5 2.5" />);
export const Scale = glyph("Scale", <path d="M12 4v16M7 20.5h10M4 7h16M4 7 1.5 13.5h5zM20 7l-2.5 6.5h5z" />);

/* ---------------------------------------------------------------- status, alerts */

export const Check = glyph("Check", <path d="M4 12.5 9 17.5 20 6.5" />);
export const CheckCircle2 = glyph(
  "CheckCircle2",
  <>
    <circle cx={12} cy={12} r={9} />
    <path d="M8 12.3l2.8 2.8L16 9.5" />
  </>,
);
/** A chamfered seal rather than the usual scalloped badge. */
export const BadgeCheck = glyph("BadgeCheck", <path d="M8.5 3h7L21 8.5v7L15.5 21h-7L3 15.5v-7zM8.5 12.3l2.5 2.5 4.5-4.8" />);
export const Shield = glyph("Shield", <path d="M12 3l8 3v6c0 4.7-3.2 7.8-8 9.5C7.2 19.8 4 16.7 4 12V6z" />);
export const ShieldCheck = glyph("ShieldCheck", <path d="M12 3l8 3v6c0 4.7-3.2 7.8-8 9.5C7.2 19.8 4 16.7 4 12V6zM8.5 12l2.5 2.5 4.5-5" />);
export const ShieldAlert = glyph(
  "ShieldAlert",
  <>
    <path d="M12 3l8 3v6c0 4.7-3.2 7.8-8 9.5C7.2 19.8 4 16.7 4 12V6zM12 8v4.5" />
    <Dot cx={12} cy={15.7} />
  </>,
);
export const AlertTriangle = glyph(
  "AlertTriangle",
  <>
    <path d="M12 3.5 22 20H2zM12 10v4.5" />
    <Dot cx={12} cy={17.2} />
  </>,
);
export const Star = glyph("Star", <path d="M12 3l2.7 5.8 6.3.8-4.6 4.3 1.2 6.3L12 17.2 6.4 20.2l1.2-6.3L3 9.6l6.3-.8z" />);
export const Medal = glyph(
  "Medal",
  <>
    <circle cx={12} cy={15} r={5.5} />
    <path d="M8 3h3.2L12.6 9.6M16 3h-3.2" />
  </>,
);
export const Award = glyph(
  "Award",
  <>
    <circle cx={12} cy={9} r={6} />
    <path d="M8.6 14 7 21.5l5-2.8 5 2.8-1.6-7.5" />
  </>,
);
export const Flame = glyph(
  "Flame",
  <path d="M12 2.5c.8 4 6 6.2 6 12a6 6 0 0 1-12 0c0-2.8 1.3-4.5 3-6 .4 2 1 3 2 3 0-3 .2-6 1-9z" />,
);
export const Zap = glyph("Zap", <path d="M13.5 2.5 4.5 13.5H11l-1 8 9-11H12.5z" />);
export const HeartPulse = glyph(
  "HeartPulse",
  <path d="M12 20.5C6 16.2 3 12.8 3 9a4.5 4.5 0 0 1 9-1.2A4.5 4.5 0 0 1 21 9c0 3.8-3 7.2-9 11.5zM6 12h3l1.5-2.5 2.5 5 1.5-2.5h3" />,
);

/* ---------------------------------------------------------------- time, place, travel */

export const Clock = glyph(
  "Clock",
  <>
    <circle cx={12} cy={12} r={9} />
    <path d="M12 7v5l3.5 2" />
  </>,
);
export const Timer = glyph(
  "Timer",
  <>
    <circle cx={12} cy={13.5} r={7.5} />
    <path d="M12 13.5V9.5M9.5 2.5h5M18.5 6l1.5-1.5" />
  </>,
);
export const AlarmClock = glyph(
  "AlarmClock",
  <>
    <circle cx={12} cy={13} r={7.5} />
    <path d="M12 9v4.5l2.5 1.5M3.5 6 7 3M20.5 6 17 3" />
  </>,
);
export const History = glyph("History", <path d="M4 12a8 8 0 1 0 2.5-5.8M4 4v4.5h4.5M12 8v4.5l3 2" />);
export const MapPin = glyph(
  "MapPin",
  <>
    <path d="M12 21.5s7-6.3 7-12a7 7 0 0 0-14 0c0 5.7 7 12 7 12z" />
    <circle cx={12} cy={9.5} r={2.4} />
  </>,
);
export const Plane = glyph(
  "Plane",
  <path d="M12 2.5c1 0 1.7 1 1.7 2.2v5L21 14v2l-7.3-2.2-.4 4.2 2.2 1.6V21L12 20l-3.5 1v-1.4l2.2-1.6-.4-4.2L3 16v-2l7.3-4.3v-5C10.3 3.500 11 2.500 12 2.500z" />,
);
export const BedDouble = glyph(
  "BedDouble",
  <>
    <path d="M3 5v15M21 20v-6a3 3 0 0 0-3-3h-7v5M3 16h18" />
    <circle cx={7} cy={12} r={1.8} />
  </>,
);
export const Banknote = glyph(
  "Banknote",
  <>
    <path d="M2.5 6.5h19v11h-19z" />
    <circle cx={12} cy={12} r={2.6} />
    <Dot cx={6} cy={12} />
    <Dot cx={18} cy={12} />
  </>,
);
export const Radio = glyph(
  "Radio",
  <>
    <circle cx={12} cy={12} r={1.8} fill="currentColor" />
    <path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.200M19.100 4.900a10 10 0 0 1 0 14.200" />
  </>,
);
export const Video = glyph("Video", <path d="M3 6h13v12H3zM16 10.500l5-3v9l-5-3" />);
export const Film = glyph("Film", <path d="M3 4h18v16H3zM7 4v16M17 4v16M3 8.500h4M3 12h4M3 15.500h4M17 8.500h4M17 12h4M17 15.500h4" />);
export const GraduationCap = glyph("GraduationCap", <path d="M2 9.500 12 5l10 4.500-10 4.500zM6 12v4.500c2.200 2.200 9.800 2.200 12 0V12M22 9.500V15" />);
export const IdCard = glyph(
  "IdCard",
  <>
    <path d="M7 5h14v14H3V9zM14 10h4M14 14h4" />
    <circle cx={8.500} cy={11.500} r={1.800} />
    <path d="M5.500 16.500c.8-1.800 4.200-1.800 5 0" />
  </>,
);
export const ListChecks = glyph("ListChecks", <path d="M3.500 6.500 5.300 8.300 8.500 5M3.500 15.500l1.800 1.800L8.500 14M12 7h9M12 16h9" />);
export const Quote = glyph("Quote", <path d="M4 12v6h6v-6H7a3 3 0 0 1 3-4M14 12v6h6v-6h-3a3 3 0 0 1 3-4" />);

/* ---------------------------------------------------------------- actions, chrome */

export const Search = glyph(
  "Search",
  <>
    <circle cx={10.500} cy={10.500} r={6.500} />
    <path d="M15.500 15.500 21 21" />
  </>,
);
export const Menu = glyph("Menu", <path d="M3 7h18M3 12h11M3 17h18" />);
export const X = glyph("X", <path d="M5 5l14 14M19 5 5 19" />);
export const Plus = glyph("Plus", <path d="M12 4.500v15M4.500 12h15" />);
export const Minus = glyph("Minus", <path d="M5 12h14" />);
export const ChevronDown = glyph("ChevronDown", <path d="M6 9l6 6 6-6" />);
export const ChevronRight = glyph("ChevronRight", <path d="M9 6l6 6-6 6" />);
export const ChevronLeft = glyph("ChevronLeft", <path d="M15 6l-6 6 6 6" />);
export const ArrowLeft = glyph("ArrowLeft", <path d="M20 12H4M10 6l-6 6 6 6" />);
export const ArrowUpRight = glyph("ArrowUpRight", <path d="M6 18 18 6M9 6h9v9" />);
export const ArrowLeftRight = glyph("ArrowLeftRight", <path d="M4 8h16M16 4l4 4-4 4M20 16H4M8 12l-4 4 4 4" />);
export const CornerDownLeft = glyph("CornerDownLeft", <path d="M20 5v8H5M9 9l-4 4 4 4" />);
export const RefreshCcw = glyph("RefreshCcw", <path d="M4 12a8 8 0 0 1 13.500-5.800M20 4v4.500h-4.500M20 12a8 8 0 0 1-13.500 5.800M4 20v-4.500h4.500" />);
export const Download = glyph("Download", <path d="M12 3v12M7 10.500l5 5 5-5M4 20.500h16" />);
export const Send = glyph("Send", <path d="M21 3 3 10.500l7 3 3 7zM10 13.500 21 3" />);
export const Link2 = glyph("Link2", <path d="M10 7H7a5 5 0 0 0 0 10h3M14 7h3a5 5 0 0 1 0 10h-3M8.500 12h7" />);
export const Trash2 = glyph("Trash2", <path d="M4 6.500h16M9 6.500v-3h6v3M6 6.500l1 14h10l1-14M10 10.500v6M14 10.500v6" />);
export const Wand2 = glyph("Wand2", <path d="M4 20l1-4L16 5l3 3L8 19zM14 7l3 3" />);
export const Bell = glyph("Bell", <path d="M6 17v-6a6 6 0 0 1 12 0v6l1.500 2h-15zM10 21.500h4" />);
export const LockKeyhole = glyph(
  "LockKeyhole",
  <>
    <path d="M5 11h14v10H5zM8 11V7.500a4 4 0 0 1 8 0V11" />
    <Dot cx={12} cy={16} r={1.3} />
  </>,
);
export const LogOut = glyph("LogOut", <path d="M10 4H4v16h6M15 8l4 4-4 4M19 12H9" />);
export const PanelLeftOpen = glyph("PanelLeftOpen", <path d="M3 4h18v16H3zM9 4v16M13.500 9.500 16 12l-2.500 2.500" />);
export const Sun = glyph(
  "Sun",
  <>
    <circle cx={12} cy={12} r={3.800} />
    <path d="M12 2.500V5M12 19v2.500M2.500 12H5M19 12h2.500M5.300 5.300l1.800 1.800M16.900 16.900l1.800 1.800M5.300 18.700l1.800-1.800M16.900 7.100l1.800-1.800" />
  </>,
);
export const Moon = glyph("Moon", <path d="M20 14.500A8.500 8.500 0 1 1 9.500 4a6.500 6.500 0 0 0 10.500 10.500z" />);
