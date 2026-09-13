import { ApiDocumentation } from "@/components/docs/api-documentation";

export default function DocsPage() {
  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">API documentation</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Explore endpoints and send requests to this application. <a href="/sign-in?returnTo=/docs" className="text-link underline underline-offset-4">Sign in</a>,
          then return here to use Try it out. Your browser sends the session cookie automatically. Signed-out requests return 401;
          member administration requires an owner account.
        </p>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Changes require the configured same Origin, supplied automatically by your browser, and JSON content type for JSON bodies.
          Activity creators and stage-change actors come from your session. Authentication flows under /api/auth/* are handled separately by Better Auth.
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
