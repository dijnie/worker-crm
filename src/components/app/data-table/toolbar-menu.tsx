"use client";

import { useEffect, useRef, type ReactNode } from "react";
import ChevronDown from "@carbon/icons-react/es/ChevronDown";
import { cn } from "@/lib/utils/cn";

/** Native top-layer panels stay clear of the shell's scrolling containers. */
export function ToolbarMenu({
  label,
  icon,
  children,
  active = false,
  wide = false,
}: {
  label: ReactNode;
  icon: ReactNode;
  children: ReactNode;
  active?: boolean;
  wide?: boolean;
}) {
  const root = useRef<HTMLDetailsElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLElement>(null);

  const close = (restoreFocus = false) => {
    if (!root.current?.open) return;
    panel.current?.hidePopover();
    root.current.open = false;
    if (restoreFocus) trigger.current?.focus();
  };

  useEffect(() => {
    const outside = (event: Event) => {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        close();
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && root.current?.open) {
        event.preventDefault();
        close(true);
      }
    };
    const scroll = (event: Event) => {
      if (
        event.target instanceof Node &&
        !panel.current?.contains(event.target)
      )
        close();
    };
    const resize = () => close();
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    document.addEventListener("keydown", keydown);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
      document.removeEventListener("keydown", keydown);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <details
      ref={root}
      className="group/toolbar shrink-0"
      onToggle={(event) => {
        if (event.target !== event.currentTarget || !panel.current) return;
        if (!event.currentTarget.open) {
          panel.current.hidePopover();
          return;
        }
        const rect = trigger.current!.getBoundingClientRect();
        const width = Math.min(wide ? 448 : 288, window.innerWidth - 32);
        panel.current.style.width = `${width}px`;
        panel.current.style.left = `${Math.max(16, Math.min(rect.left, window.innerWidth - width - 16))}px`;
        const below = window.innerHeight - rect.bottom - 24;
        const above = rect.top - 24;
        const opensAbove = below < 240 && above > below;
        panel.current.style.top = opensAbove ? "auto" : `${rect.bottom + 8}px`;
        panel.current.style.bottom = opensAbove
          ? `${window.innerHeight - rect.top + 8}px`
          : "auto";
        panel.current.style.maxHeight = `${Math.max(0, opensAbove ? above : below)}px`;
        panel.current.showPopover();
      }}
    >
      <summary
        ref={trigger}
        className={cn(
          "flex min-h-11 cursor-pointer list-none items-center justify-center gap-2 rounded-md border border-input bg-control px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent active:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:min-h-9 [&::-webkit-details-marker]:hidden [&_svg]:size-4 [&_svg]:shrink-0 group-open/toolbar:bg-accent",
          active && "border-primary/40 bg-primary/5 text-link",
        )}
      >
        {icon}
        <span className="max-w-40 truncate">{label}</span>
        <ChevronDown
          aria-hidden="true"
          className="text-muted-foreground group-open/toolbar:rotate-180"
        />
      </summary>
      <div
        ref={panel}
        popover="manual"
        className="fixed inset-auto m-0 overflow-y-auto overscroll-contain rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-popover"
      >
        {children}
      </div>
    </details>
  );
}
