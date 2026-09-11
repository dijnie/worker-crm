import React from "react";
import Head from "next/head";
import { Header } from "@/components/Header";
import { ApiTokenMissingCard } from "@/components/admin/api-token-missing-card";

export interface LayoutProps {
  title?: string;
  apiTokenSet?: boolean;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export default function Layout({
  title = "SaaS Admin Template",
  apiTokenSet = true,
  actions,
  children,
}: LayoutProps) {
  return (
    <>
      <Head>
        <title>
          {title ? `${title} - SaaS Admin Template` : "SaaS Admin Template"}
        </title>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      </Head>
      <div className="min-h-screen flex flex-col bg-background text-foreground">
        <Header />
        <main className="flex-1 space-y-4 p-8 pt-6 max-w-7xl mx-auto w-full">
          {!apiTokenSet && (
            <div className="mb-4">
              <ApiTokenMissingCard />
            </div>
          )}
          <div className="flex items-center justify-between">
            <h2 className="text-3xl font-bold tracking-tight">{title}</h2>
            {actions}
          </div>
          {children}
        </main>
      </div>
    </>
  );
}
