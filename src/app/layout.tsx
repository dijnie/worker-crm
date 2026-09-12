import type { Metadata } from "next";
import "@fontsource-variable/inter/wght.css";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "SaaS Admin Template",
  description:
    "Manage a SaaS application - customers, subscriptions - using Cloudflare Workers and D1.",
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
        {children}
      </body>
    </html>
  );
}
