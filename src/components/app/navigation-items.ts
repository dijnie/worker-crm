import Building from "@carbon/icons-react/es/Building";
import Api from "@carbon/icons-react/es/Api";
import Dashboard from "@carbon/icons-react/es/Dashboard";
import Partnership from "@carbon/icons-react/es/Partnership";
import Settings from "@carbon/icons-react/es/Settings";
import UserMultiple from "@carbon/icons-react/es/UserMultiple";

export const navigationItems = [
  { label: "Overview", href: "/", icon: Dashboard },
  { label: "Companies", href: "/companies", icon: Building },
  { label: "Contacts", href: "/contacts", icon: UserMultiple },
  { label: "Deals", href: "/deals", icon: Partnership },
  { label: "Settings", href: "/settings", icon: Settings },
  { label: "API docs", href: "/docs", icon: Api },
] as const;

export function matchesNavigationPath(href: string, pathname: string) {
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
}
