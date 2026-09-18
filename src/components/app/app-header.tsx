"use client";

import Menu from "@carbon/icons-react/es/Menu";
import { Button } from "@/components/ui/button";
import Logo from "@/components/ui/logo";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";
import { AccountMenu } from "@/components/app/account-menu";
import { useMobileNav } from "@/components/app/mobile-nav";
import type { AccountIdentity } from "@/lib/auth/request-context";

export function AppHeader({ account }: { account: AccountIdentity }) {
  const { setOpen: setMobileNavOpen, opener } = useMobileNav();

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3 [view-transition-name:app-header]">
      <div className="flex shrink-0 items-center gap-1">
        <Button
          ref={opener}
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label="Open navigation"
          onClick={() => setMobileNavOpen(true)}
        >
          <Menu />
        </Button>
        <Link
          href="/"
          aria-label="Homepage"
          className="hidden size-8 items-center justify-center text-foreground md:flex"
        >
          <Logo className="size-5" />
        </Link>
        <Separator orientation="vertical" className="mx-1 h-5 bg-transparent" />
        <span className="min-w-0 truncate font-medium text-sm">Vinext</span>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <AccountMenu account={account} />
      </div>
    </header>
  );
}

export function AppHeaderFallback() {
  return (
    <header
      className="flex h-12 shrink-0 items-center gap-2 border-b px-3 [view-transition-name:app-header]"
      aria-busy="true"
    >
      <div className="flex shrink-0 items-center gap-1">
        <span className="hidden size-8 items-center justify-center text-foreground md:flex">
          <Logo className="size-5" />
        </span>
        <Separator orientation="vertical" className="mx-1 h-5 bg-transparent" />
        <span className="min-w-0 truncate font-medium text-sm">Vinext</span>
      </div>
      <span role="status" className="sr-only">
        Loading workspace header…
      </span>
    </header>
  );
}
