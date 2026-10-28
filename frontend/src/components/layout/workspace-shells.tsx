import { Activity, CalendarDays, ChartNoAxesCombined, Flag, LayoutDashboard, ScrollText, ShieldCheck, SlidersHorizontal, UsersRound } from "lucide-react";
import { ApplicationShell, type ApplicationShellProps, type NavigationItem } from "./application-shell";

// Navigation is intentionally disabled until the corresponding Phase 2B routes exist.
const userNavigation = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, disabled: true },
  { label: "My schedule", href: "/schedule", icon: CalendarDays, disabled: true },
  { label: "Who’s free?", href: "/availability", icon: UsersRound, disabled: true },
  { label: "Settings", href: "/settings", icon: SlidersHorizontal, disabled: true },
] satisfies readonly NavigationItem[];
const adminNavigation = [
  { label: "Overview", href: "/admin", icon: LayoutDashboard, disabled: true },
  { label: "User management", href: "/admin/users", icon: UsersRound, disabled: true },
  { label: "Role management", href: "/admin/roles", icon: ShieldCheck, disabled: true },
  { label: "System health", href: "/admin/health", icon: Activity, disabled: true },
  { label: "Audit logs", href: "/admin/audit", icon: ScrollText, disabled: true },
  { label: "Feature flags", href: "/admin/features", icon: Flag, disabled: true },
  { label: "Reports & analytics", href: "/admin/reports", icon: ChartNoAxesCombined, disabled: true },
] satisfies readonly NavigationItem[];
type WorkspaceShellProps = Omit<ApplicationShellProps, "workspace" | "navigation"> & { navigation?: readonly NavigationItem[] };
export function UserShell({ navigation = userNavigation, ...props }: WorkspaceShellProps) {
  return <ApplicationShell workspace="user" navigation={navigation} {...props} />;
}
export function AdminShell({ navigation = adminNavigation, ...props }: WorkspaceShellProps) {
  return <ApplicationShell workspace="admin" navigation={navigation} {...props} />;
}
