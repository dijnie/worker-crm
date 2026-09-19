import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FieldDefinitionList } from "@/components/app/fields/field-definition-list";
import { ReportingCurrencyForm } from "@/components/app/settings/reporting-currency-form";
import { WorkspaceLanguageForm } from "@/components/app/settings/workspace-language-form";
import { PermissionGate } from "@/components/app/permission-gate";
import {
  PageShell,
  PageShellContent,
  PageShellDescription,
  PageShellHeader,
  PageShellHeading,
  PageShellTitle,
} from "@/components/app/page-shell";
import { getWorkspaceDictionary } from "@/lib/i18n/workspace-locale";
import Link from "next/link";

export default async function SettingsPage() {
  const { settings: copy } = await getWorkspaceDictionary();
  return (
    <PermissionGate system>
      <PageShell>
        <PageShellHeader>
          <PageShellHeading>
            <PageShellTitle>{copy.title}</PageShellTitle>
            <PageShellDescription>{copy.description}</PageShellDescription>
          </PageShellHeading>
        </PageShellHeader>

        <PageShellContent>
          <ReportingCurrencyForm />
          <WorkspaceLanguageForm />
          <Card role="region" aria-label={copy.access.regionLabel}>
            <CardHeader>
              <CardTitle>{copy.access.title}</CardTitle>
              <CardDescription>{copy.access.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex-row flex-wrap items-center gap-2">
              <Button asChild variant="outline">
                <Link href="/settings/roles">{copy.access.manageRoles}</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/settings/members">{copy.access.manageMembers}</Link>
              </Button>
            </CardContent>
          </Card>
          <FieldDefinitionList />
        </PageShellContent>
      </PageShell>
    </PermissionGate>
  );
}
