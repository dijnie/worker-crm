import { PermissionGate } from "@/components/app/permission-gate";
import { CreateRecordButton, RecordList } from "@/components/app/data-table/record-list";
import {
  PageShell,
  PageShellActions,
  PageShellContent,
  PageShellDescription,
  PageShellHeader,
  PageShellHeading,
  PageShellTitle,
} from "@/components/app/page-shell";

export default function CompaniesPage() {
  return (
    <PermissionGate entity="company">
      <PageShell className="min-h-0">
        <PageShellHeader>
          <PageShellHeading>
            <PageShellTitle>Companies</PageShellTitle>
            <PageShellDescription>
              Manage your workspace records
            </PageShellDescription>
          </PageShellHeading>
          <PageShellActions>
            <CreateRecordButton entity="company" />
          </PageShellActions>
        </PageShellHeader>
        <PageShellContent className="min-h-0">
          <RecordList entity="company" />
        </PageShellContent>
      </PageShell>
    </PermissionGate>
  );
}
