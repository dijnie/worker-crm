import { ApiDocumentation } from "@/components/docs/api-documentation";

export default function DocsPage() {
  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">API documentation</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Explore endpoints and send requests to this application. Use Authorize to enter a Bearer token for protected operations.
        </p>
        <a
          href="/api/openapi"
          className="inline-flex min-h-11 items-center rounded-md text-sm font-medium text-link underline-offset-4 hover:text-link-hover hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          OpenAPI JSON
        </a>
      </header>
      <ApiDocumentation />
    </main>
  );
}
