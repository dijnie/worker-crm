import { Header } from "@/components/Header";
import { ApiTokenMissingCard } from "@/components/admin/api-token-missing-card";
import { getApiToken } from "@/lib/db";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const apiToken = getApiToken();
  const apiTokenSet = Boolean(apiToken && apiToken.trim().length > 0);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />
      <main className="flex-1 space-y-4 p-8 pt-6 max-w-7xl mx-auto w-full">
        {!apiTokenSet && (
          <div className="mb-4">
            <ApiTokenMissingCard />
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
