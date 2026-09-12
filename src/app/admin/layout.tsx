import { Header } from "@/components/Header";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />
      <main className="flex-1 space-y-4 p-8 pt-6 max-w-7xl mx-auto w-full">
        {children}
      </main>
    </div>
  );
}
