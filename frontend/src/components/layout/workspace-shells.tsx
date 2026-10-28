import { CalendarDays, SlidersHorizontal, UsersRound } from "lucide-react";
import { ApplicationShell, type ApplicationShellProps, type NavigationItem } from "./application-shell";

export const userNavigation = [
  { label: "My schedule", href: "/schedule", icon: CalendarDays },
  { label: "Who’s free?", href: "/availability", icon: UsersRound },
  { label: "Settings", href: "/settings", icon: SlidersHorizontal },
] satisfies readonly NavigationItem[];
export function UserShell(props: Omit<ApplicationShellProps, "navigation">) {
  const prefix = props.activeHref?.startsWith("/preview/") ? "/preview" : "";
  return <ApplicationShell navigation={userNavigation.map((item) => ({ ...item, href: `${prefix}${item.href}` }))} {...props} />;
}
