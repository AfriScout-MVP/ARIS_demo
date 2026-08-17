import {
  LayoutDashboard,
  Users,
  Video,
  Flame,
  Radar,
  Trophy,
  GraduationCap,
  FileText,
  Landmark,
  GitCompareArrows,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: string;
}

export const navItems: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/referees", label: "Referees", icon: Users },
  { href: "/decision-engine", label: "Decision Engine", icon: Video },
  { href: "/heatmaps", label: "Heat Maps", icon: Flame },
  { href: "/arae", label: "AI Assignment (ARAE)", icon: Radar, badge: "P1" },
  { href: "/rankings", label: "Rankings", icon: Trophy },
  { href: "/federations", label: "Federations", icon: Landmark },
  { href: "/compare", label: "Compare", icon: GitCompareArrows },
  { href: "/career", label: "Career Manager", icon: GraduationCap },
  { href: "/reports", label: "Reports", icon: FileText },
];
