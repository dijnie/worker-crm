import type { AccountIdentity } from "@/lib/auth/request-context";
import { canPermission } from "@/lib/auth/permissions";
import Api from "@carbon/icons-react/es/Api";
import Building from "@carbon/icons-react/es/Building";
import Dashboard from "@carbon/icons-react/es/Dashboard";
import Partnership from "@carbon/icons-react/es/Partnership";
import Settings from "@carbon/icons-react/es/Settings";
import UserMultiple from "@carbon/icons-react/es/UserMultiple";
import type { CarbonIcon } from "@/components/ui/icon";

/** Key into `dictionary.shell.navigation` for this item's label. */
export type NavigationKey = "overview" | "companies" | "contacts" | "deals" | "settings" | "docs";

export interface NavigationItem {
  labelKey: NavigationKey;
  href: string;
  icon: CarbonIcon;
}

export const navigationItems: readonly NavigationItem[] = [
  { labelKey: "overview", href: "/", icon: Dashboard },
  { labelKey: "companies", href: "/companies", icon: Building },
  { labelKey: "contacts", href: "/contacts", icon: UserMultiple },
  { labelKey: "deals", href: "/deals", icon: Partnership },
  { labelKey: "settings", href: "/settings", icon: Settings },
  { labelKey: "docs", href: "/docs", icon: Api },
];

export function matchesNavigationPath(href: string, pathname: string) {
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
}

export function visibleNavigationItems(account: AccountIdentity) {
  return navigationItems.filter((item) => {
    if (item.href === "/settings") return account.role?.isSystem;
    if (item.href === "/companies") return canPermission(account, "company", "read");
    if (item.href === "/contacts") return canPermission(account, "contact", "read");
    if (item.href === "/deals") return canPermission(account, "deal", "read");
    return true;
  });
}
