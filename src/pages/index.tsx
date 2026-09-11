import Head from "next/head";
import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

const repoLink =
  "https://github.com/cloudflare/templates/tree/main/saas-admin-template";

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="16"
      height="16"
      stroke="currentColor"
      strokeWidth="2"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );
}

export default function HomePage() {
  return (
    <>
      <Head>
        <title>SaaS Admin Template</title>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      </Head>
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 py-20 px-8">
        <h1 className="text-5xl font-bold text-center">SaaS Admin Template</h1>
        <p className="text-xl text-muted-foreground text-center max-w-xl">
          Manage a SaaS application - customers, subscriptions - using Cloudflare
          Workers and D1.
        </p>
        <div className="flex flex-wrap gap-4 mt-4">
          <Link className={buttonVariants()} href="/admin">
            <LayoutDashboard className="h-4 w-4" /> Go to admin
          </Link>
          <a
            className={buttonVariants({ variant: "outline" })}
            href={repoLink}
            target="_blank"
            rel="noreferrer"
          >
            <GithubIcon className="h-4 w-4" /> View on GitHub
          </a>
        </div>
      </main>
    </>
  );
}
