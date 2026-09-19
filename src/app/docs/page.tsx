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
import { getWorkspaceDictionary } from "@/lib/i18n/workspace-locale";
import NextLink from "next/link";

export default async function DocsPage() {
  const { shell: copy } = await getWorkspaceDictionary();
  return (
    <PageShell>
      <PageShellHeader>
        <PageShellHeading>
          <PageShellTitle>{copy.docsPage.title}</PageShellTitle>
          <PageShellDescription>
            {copy.docsPage.description}
          </PageShellDescription>
        </PageShellHeading>
      </PageShellHeader>

      <PageShellContent>
        <p className="max-w-3xl text-xs/relaxed text-muted-foreground">
          <TextLink asChild variant="inline">
            <NextLink href="/sign-in?returnTo=/docs">{copy.docsPage.signIn}</NextLink>
          </TextLink>
          {copy.docsPage.signInFollowup}
        </p>
        <p className="max-w-3xl text-xs/relaxed text-muted-foreground">
          {copy.docsPage.secondParagraph}
        </p>
        <TextLink asChild variant="inline" className="self-start text-xs font-medium">
          <NextLink href="/api/openapi">{copy.docsPage.openApiLink}</NextLink>
        </TextLink>
        <ApiDocumentation />
      </PageShellContent>
    </PageShell>
  );
}
