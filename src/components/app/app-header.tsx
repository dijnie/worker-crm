"use client";

import Menu from "@carbon/icons-react/es/Menu";
import MagicWand from "@carbon/icons-react/es/MagicWand";
import Help from "@carbon/icons-react/es/Help";
import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { navigationItems, matchesNavigationPath } from "@/components/app/navigation-items";
import { AccountMenu } from "@/components/app/account-menu";
import type { AccountIdentity } from "@/lib/auth/request-context";

export function AppHeader({ sidebarExpanded, account }: { sidebarExpanded: boolean; account: AccountIdentity }) {
  const pathname = usePathname();
  const pageTitle = navigationItems.find(({ href }) => matchesNavigationPath(href, pathname))?.label ?? "Vinext";

  return (
    <header className="flex h-[58px] shrink-0 border-b">
      <div className={cn(
        "hidden shrink-0 items-center gap-4 overflow-hidden border-r px-3 transition-[width] duration-250 ease-[cubic-bezier(0.77,0,0.175,1)] motion-reduce:transition-none md:flex",
        sidebarExpanded ? "w-[260px]" : "w-[57px]",
      )}>
        <Link
          href="/"
          aria-label="Homepage"
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <svg viewBox="0 0 512 512" fill="none" className="size-5" aria-hidden="true">
            <path
              d="m384 99.548 -16.066 -12.508L256.021 0 0 199.096v113.782L256.021 512 512 312.879V199.096zm-127.98 -49.419 79.695 61.975 -40.944 31.803 -3.661 2.837 -35.091 -27.287 -102.399 79.638 35.09 27.287 32.218 25.088 35.09 27.288L358.4 199.074l-35.047 -27.288 3.659 -2.837 40.943 -31.803 79.651 61.952 -40.943 31.852 -150.62 117.163 -79.695 -61.974 -32.218 -25.041 -38.752 -30.125 -40.922 -31.849z"
              fill="currentColor"
            />
          </svg>
        </Link>
        {sidebarExpanded && <span className="truncate text-sm font-medium">Vinext</span>}
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2 px-3 md:px-5">
        <Dialog.Trigger asChild>
          <Button variant="ghost" size="icon" className="size-8 shrink-0 md:hidden" aria-label="Open navigation">
            <Menu className="size-4" aria-hidden="true" />
          </Button>
        </Dialog.Trigger>
        <span className="min-w-0 truncate text-sm">{pageTitle}</span>
        <div className="ml-auto flex shrink-0 items-center gap-1 md:gap-2">
          <Button variant="ghost" disabled className="h-8 px-2" aria-label="Ask AI — coming soon">
            <MagicWand className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Ask AI</span>
          </Button>
          <Button variant="ghost" disabled className="h-8 px-2" aria-label="Support — coming soon">
            <Help className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Support</span>
          </Button>
          <AccountMenu account={account} />
        </div>
      </div>
    </header>
  );
}
