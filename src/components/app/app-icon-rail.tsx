"use client";

import { Button } from "@/components/ui/button";
import type { CarbonIcon } from "@/components/ui/icon";
import { Icon } from "@/components/ui/icon";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils/cn";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { useMobileNav } from "@/components/app/mobile-nav";
import {
  matchesNavigationPath,
  type NavigationItem,
  visibleNavigationItems,
} from "@/components/app/navigation-items";
import type { AccountIdentity } from "@/lib/auth/request-context";

function RailLink({
  item,
  active,
}: {
  item: NavigationItem;
  active: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          asChild
          variant="ghost"
          size="icon"
          className={cn(
            "text-muted-foreground",
            active && "bg-muted text-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <Link
            href={item.href}
            prefetch
            aria-current={active ? "page" : undefined}
            transitionTypes={["nav-lateral"]}
          >
            <Icon icon={item.icon as CarbonIcon} />
            <span className="sr-only">{item.label}</span>
          </Link>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}

function MobileRailLink({
  item,
  active,
  onNavigate,
}: {
  item: NavigationItem;
  active: boolean;
  onNavigate: () => void;
}) {
  return (
    <Button
      asChild
      variant="ghost"
      className={cn(
        "justify-start gap-3 text-muted-foreground",
        active && "bg-muted text-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Link
        href={item.href}
        prefetch
        aria-current={active ? "page" : undefined}
        onClick={onNavigate}
        transitionTypes={["nav-lateral"]}
      >
        <Icon icon={item.icon as CarbonIcon} />
        <span>{item.label}</span>
      </Link>
    </Button>
  );
}

export function AppIconRailFallback() {
  return (
    <nav
      aria-label="Primary"
      aria-busy="true"
      className="hidden w-14 shrink-0 flex-col items-center gap-1 border-r py-3 md:flex [view-transition-name:app-rail]"
    >
      <span role="status" className="sr-only">
        Loading navigation…
      </span>
    </nav>
  );
}

export function AppIconRail({ account }: { account: AccountIdentity }) {
  const pathname = usePathname();
  const { open, setOpen, opener } = useMobileNav();
  const items = useMemo(() => visibleNavigationItems(account), [account]);

  return (
    <>
      <nav
        aria-label="Primary"
        className="hidden w-14 shrink-0 flex-col items-center gap-1 border-r py-3 md:flex [view-transition-name:app-rail]"
      >
        {items.map((item) => (
          <RailLink
            key={item.href}
            item={item}
            active={matchesNavigationPath(item.href, pathname)}
          />
        ))}
      </nav>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="left"
          className="w-64 gap-0 p-0"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            opener.current?.focus();
          }}
        >
          <SheetHeader>
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          <nav aria-label="Primary" className="flex flex-1 flex-col gap-1 p-2">
            {items.map((item) => (
              <MobileRailLink
                key={item.href}
                item={item}
                active={matchesNavigationPath(item.href, pathname)}
                onNavigate={() => setOpen(false)}
              />
            ))}
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}
