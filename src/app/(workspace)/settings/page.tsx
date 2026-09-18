import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FieldDefinitionList } from "@/components/app/fields/field-definition-list";
import { PermissionGate } from "@/components/app/permission-gate";
import {
  PageShell,
  PageShellContent,
  PageShellDescription,
  PageShellHeader,
  PageShellHeading,
  PageShellTitle,
} from "@/components/app/page-shell";
import Link from "next/link";

export default function SettingsPage() {
  return (
    <PermissionGate system>
      <PageShell>
        <PageShellHeader>
          <PageShellHeading>
            <PageShellTitle>Settings</PageShellTitle>
            <PageShellDescription>
              Workspace access and the custom properties records carry.
            </PageShellDescription>
          </PageShellHeading>
        </PageShellHeader>

        <PageShellContent>
          <Card role="region" aria-label="Roles and members">
            <CardHeader>
              <CardTitle>Roles and members</CardTitle>
              <CardDescription>
                Create roles, configure permissions, and assign workspace access.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-row flex-wrap items-center gap-2">
              <Button asChild variant="outline">
                <Link href="/settings/roles">Manage roles</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/settings/members">Manage members</Link>
              </Button>
            </CardContent>
          </Card>
          <FieldDefinitionList />
        </PageShellContent>
      </PageShell>
    </PermissionGate>
  );
}
