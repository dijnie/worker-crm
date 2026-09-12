"use client";

import Close from "@carbon/icons-react/es/Close";
import * as Dialog from "@radix-ui/react-dialog";
import * as Tooltip from "@radix-ui/react-tooltip";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DialogOverlay } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { navigationItems, matchesNavigationPath } from "@/components/app/navigation-items";

interface AppSidebarProps {
  expanded: boolean;
  onToggle: () => void;
  onNavigate: () => void;
}

export function AppSidebar({ expanded, onToggle, onNavigate }: AppSidebarProps) {
  const pathname = usePathname();
  const isActive = (href: string) => matchesNavigationPath(href, pathname);
  const linkClass = (href: string) =>
    cn(
      "text-muted-foreground",
      isActive(href) &&
        "bg-muted text-foreground hover:bg-muted hover:text-foreground",
    );

  return (
    <>
      <Tooltip.Provider delayDuration={300}>
        <aside
          className={cn(
            "hidden shrink-0 flex-col overflow-hidden border-r transition-[width] duration-250 ease-[cubic-bezier(0.77,0,0.175,1)] motion-reduce:transition-none md:flex",
            expanded ? "w-[260px]" : "w-[57px]",
          )}
        >
          <nav
            id="desktop-navigation"
            aria-label="Primary"
            className={cn(
              "flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto py-3",
              expanded ? "items-stretch px-2" : "items-center",
            )}
          >
            {navigationItems.map(({ label, href, icon: Icon }) => {
              const link = (
                <Button
                  key={href}
                  asChild
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-8 shrink-0",
                    expanded ? "w-full justify-start gap-3 px-3" : "w-8",
                    linkClass(href),
                  )}
                >
                  <Link href={href} aria-current={isActive(href) ? "page" : undefined}>
                    <Icon className="size-4" aria-hidden="true" />
                    <span className={expanded ? "truncate" : "sr-only"}>{label}</span>
                  </Link>
                </Button>
              );

              return expanded ? link : (
                <Tooltip.Root key={href}>
                  <Tooltip.Trigger asChild>{link}</Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content
                      side="right"
                      sideOffset={8}
                      className="z-50 rounded-md border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-popover"
                    >
                      {label}
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
              );
            })}
          </nav>
          <div className={cn("flex h-12 shrink-0 items-center border-t", expanded ? "px-4" : "px-[11px]")}>
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-[34px] shrink-0 text-muted-foreground focus-visible:ring-inset focus-visible:ring-offset-0 [&_svg]:size-[18px]"
                  aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
                  aria-expanded={expanded}
                  aria-controls="desktop-navigation"
                  onClick={onToggle}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                    <path d="M21.25 6.72v10.56a2.97 2.97 0 0 1-2.97 2.97H5.72a2.97 2.97 0 0 1-2.97-2.97V6.72a2.97 2.97 0 0 1 2.97-2.97h12.56a2.97 2.97 0 0 1 2.97 2.97" />
                    <path d="M6.25 7.25v9.5" className={cn("transition-transform duration-250 motion-reduce:transition-none", expanded && "translate-x-px")} />
                  </svg>
                </Button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content side="right" sideOffset={8} className="z-50 rounded-md border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-popover">
                  {expanded ? "Collapse sidebar" : "Expand sidebar"}
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          </div>
        </aside>
      </Tooltip.Provider>

      <Dialog.Portal>
        <DialogOverlay className="app-navigation-overlay" />
        <Dialog.Content
          aria-describedby={undefined}
          className="app-navigation-panel fixed inset-y-0 left-0 z-50 flex w-64 max-w-full flex-col border-r bg-popover text-popover-foreground shadow-popover"
        >
          <div className="flex items-center justify-between p-4">
            <Dialog.Title className="text-sm font-medium">Navigation</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" className="size-8" aria-label="Close navigation">
                <Close className="size-4" aria-hidden="true" />
              </Button>
            </Dialog.Close>
          </div>
          <nav aria-label="Primary" className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2">
            {navigationItems.map(({ label, href, icon: Icon }) => (
              <Button
                key={href}
                asChild
                variant="ghost"
                className={cn("h-8 shrink-0 justify-start gap-3", linkClass(href))}
              >
                <Link href={href} aria-current={isActive(href) ? "page" : undefined} onClick={onNavigate}>
                  <Icon className="size-4" aria-hidden="true" />
                  <span>{label}</span>
                </Link>
              </Button>
            ))}
          </nav>
        </Dialog.Content>
      </Dialog.Portal>
    </>
  );
}
