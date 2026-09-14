"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { AppDataProvider, useAppData } from "@/components/app/app-data-provider";
import { RecordSheetHost } from "@/components/app/record-sheet/record-sheet-host";
import { AppHeader } from "@/components/app/app-header";
import { AppSidebar } from "@/components/app/app-sidebar";
import { PendingAccess } from "./permission-gate";
import type { AccountIdentity } from "@/lib/auth/request-context";

export function AppShell({ children, account }: { children: ReactNode; account: AccountIdentity }) {
  return <AppDataProvider account={account}><WorkspaceShell>{children}</WorkspaceShell></AppDataProvider>;
}
function WorkspaceShell({ children }: { children: ReactNode }) {
  const { account, generation } = useAppData();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [desktopNavigationExpanded, setDesktopNavigationExpanded] = useState(true);
  const pathname = usePathname();

  useEffect(() => {
    setNavigationOpen(false);
  }, [pathname]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)");
    const closeOnHistoryNavigation = () => setNavigationOpen(false);
    const closeOnDesktop = () => {
      if (desktop.matches) setNavigationOpen(false);
    };
    desktop.addEventListener("change", closeOnDesktop);
    window.addEventListener("popstate", closeOnHistoryNavigation);
    return () => {
      desktop.removeEventListener("change", closeOnDesktop);
      window.removeEventListener("popstate", closeOnHistoryNavigation);
    };
  }, []);

  if (!account.role || (!account.role.isSystem && !account.permissions.some(permission => permission.action === "read"))) return <PendingAccess />;
  return (
    <Dialog.Root open={navigationOpen} onOpenChange={setNavigationOpen}>
      <div className="isolate flex h-svh flex-col">
        <a
          href="#main-content"
          className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:absolute focus:left-3 focus:top-2"
        >
          Skip to content
        </a>
        <AppHeader sidebarExpanded={desktopNavigationExpanded} account={account} />
        <div className="flex min-h-0 flex-1">
          <AppSidebar
            expanded={desktopNavigationExpanded}
            onToggle={() => setDesktopNavigationExpanded((expanded) => !expanded)}
            onNavigate={() => setNavigationOpen(false)}
          />
          <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 overflow-auto">
            <div key={generation}>{children}</div>
          </main>
        </div>
      </div>
    <RecordSheetHost key={generation} /></Dialog.Root>
  );
}
