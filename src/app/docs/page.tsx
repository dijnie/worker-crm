import { ApiDocumentation } from "@/components/docs/api-documentation";
import { Link as TextLink } from "@/components/ui/link";
import {
  PageShell,
  PageShellContent,
  PageShellDescription,
  PageShellHeader,
  PageShellHeading,
  PageShellTitle,
} from "@/components/app/page-shell";
import NextLink from "next/link";

export default function DocsPage() {
  return (
    <PageShell>
      <PageShellHeader>
        <PageShellHeading>
          <PageShellTitle>API documentation</PageShellTitle>
          <PageShellDescription>
            Explore endpoints and send requests to this application.
          </PageShellDescription>
        </PageShellHeading>
      </PageShellHeader>

      <PageShellContent>
        <p className="max-w-3xl text-xs/relaxed text-muted-foreground">
          <TextLink asChild variant="inline">
            <NextLink href="/sign-in?returnTo=/docs">Sign in</NextLink>
          </TextLink>
          , then return here to use Try it out. Your browser sends the session cookie automatically. Signed-out requests return 401;
          role and member administration requires a system account. New accounts have no CRM access until a role is assigned.
        </p>
        <p className="max-w-3xl text-xs/relaxed text-muted-foreground">
          Changes require the configured same Origin, supplied automatically by your browser, and JSON content type for JSON bodies.
          Activity creators and stage-change actors come from your session. Authentication flows under /api/auth/* are handled separately by Better Auth.
        </p>
        <TextLink asChild variant="inline" className="self-start text-xs font-medium">
          <NextLink href="/api/openapi">OpenAPI JSON</NextLink>
        </TextLink>
        <ApiDocumentation />
      </PageShellContent>
    </PageShell>
  );
}
