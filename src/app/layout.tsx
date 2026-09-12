import type { Metadata } from "next";
import { AppShell } from "@/components/app/app-shell";
import "@fontsource-variable/inter/wght.css";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "Vinext",
  description: "A unified workspace for your team.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
