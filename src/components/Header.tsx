"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const links = [
  { href: "/admin", label: "Admin" },
];

export function Header({ currentPath }: { currentPath?: string }) {
  const pathname = usePathname();
  const activePath = currentPath ?? pathname;

  return (
    <header className="border-b bg-background">
      <nav className="flex items-center space-x-4 lg:space-x-6 mx-6 h-16">
        <Link href="/" className="text-sm font-bold leading-none text-foreground">
          SaaS Admin Template
        </Link>
        {links.map((link) => (
          <Link
            key={link.href}
            className={cn(
              "text-sm font-medium leading-none transition-colors",
              activePath === link.href
                ? "text-foreground font-semibold"
                : "text-muted-foreground hover:text-foreground",
            )}
            href={link.href}
            aria-current={activePath === link.href ? "page" : undefined}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
