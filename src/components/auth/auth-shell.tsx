import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import Logo from "@/components/ui/logo";
import Link from "next/link";
import type { ReactNode } from "react";

export function AuthShell({ homepageLabel, children }: { homepageLabel: string; children: ReactNode }) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted px-4 py-10">
      <Link
        href="/"
        aria-label={homepageLabel}
        className="flex text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <Logo className="size-6 shrink-0" />
      </Link>
      <Card className="w-full max-w-sm">
        <CardContent className="gap-6 p-6">{children}</CardContent>
      </Card>
    </main>
  );
}

export function AuthFormFallback({ loadingLabel }: { loadingLabel: string }) {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-48 max-w-full" />
        <Skeleton className="h-4 w-full" />
      </div>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
      <span className="sr-only">{loadingLabel}</span>
    </div>
  );
}
