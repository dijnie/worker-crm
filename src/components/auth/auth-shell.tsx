import Link from "next/link";
import type { ReactNode } from "react";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-svh flex-col items-center px-4 py-8 sm:py-16">
      <Link href="/" className="mb-8 inline-flex min-h-11 items-center rounded-md px-3 text-lg font-semibold hover:text-link focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        Vinext
      </Link>
      <div className="w-full max-w-md rounded-lg border bg-card p-6 text-card-foreground sm:p-8">
        {children}
      </div>
    </main>
  );
}
