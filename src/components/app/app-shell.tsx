"use client";

import { Fragment, type ReactNode } from "react";
import { AppDataProvider, useAppData } from "@/components/app/app-data-provider";
import { RecordSheetHost } from "@/components/app/record-sheet/record-sheet-host";
import { AppHeader } from "@/components/app/app-header";
import { AppIconRail } from "@/components/app/app-icon-rail";
import { useDictionary } from "@/components/app/i18n-provider";
import { MobileNavProvider } from "@/components/app/mobile-nav";
import { PendingAccess } from "./permission-gate";
import type { AccountIdentity } from "@/lib/auth/request-context";

export function AppShell({ children, account }: { children: ReactNode; account: AccountIdentity }) {
  return (
    <AppDataProvider account={account}>
      <WorkspaceShell>{children}</WorkspaceShell>
    </AppDataProvider>
  );
}

function WorkspaceShell({ children }: { children: ReactNode }) {
  const { shell: copy } = useDictionary();
  const { account, generation } = useAppData();

  if (!account.role || (!account.role.isSystem && !account.permissions.some((permission) => permission.action === "read"))) {
    return <PendingAccess />;
  }

  return (
    <MobileNavProvider>
      <div className="isolate flex h-svh flex-col">
        <a
          href="#main-content"
          className="sr-only z-50 rounded-md bg-primary px-3 py-1.5 text-primary-foreground text-xs focus:not-sr-only focus:absolute focus:top-2 focus:left-3"
        >
          {copy.appShell.skipToContent}
        </a>
        <AppHeader account={account} />
        <div className="flex min-h-0 flex-1">
          <AppIconRail account={account} />
          <Fragment key={generation}>{children}</Fragment>
        </div>
        <RecordSheetHost key={generation} />
      </div>
    </MobileNavProvider>
  );
}
