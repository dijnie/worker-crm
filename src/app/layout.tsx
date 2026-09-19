import type { Metadata } from "next";
import "@fontsource-variable/inter/wght.css";
import "@/styles/globals.css";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/app/theme-provider";
import { I18nProvider } from "@/components/app/i18n-provider";
import { getWorkspaceDictionary, getWorkspaceLocale } from "@/lib/i18n/workspace-locale";

export async function generateMetadata(): Promise<Metadata> {
  const { common } = await getWorkspaceDictionary();
  return { title: common.appName, description: common.appDescription };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getWorkspaceLocale();
  return (
    <html lang={locale} suppressHydrationWarning className="h-full antialiased">
      <head>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      </head>
      <body className="flex min-h-full flex-col font-sans">
        <ThemeProvider>
          <I18nProvider locale={locale}>
            <TooltipProvider>{children}</TooltipProvider>
            <Toaster richColors />
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
