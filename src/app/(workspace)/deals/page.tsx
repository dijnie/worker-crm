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

export default function DealsPage() {
  return (
    <PermissionGate entity="deal">
      <PageShell className="min-h-0">
        <PageShellHeader>
          <PageShellHeading>
            <PageShellTitle>Deals</PageShellTitle>
            <PageShellDescription>
              Manage your workspace records
            </PageShellDescription>
          </PageShellHeading>
          <PageShellActions>
            <CreateRecordButton entity="deal" />
          </PageShellActions>
        </PageShellHeader>
        <PageShellContent className="min-h-0">
          <RecordList entity="deal" />
        </PageShellContent>
      </PageShell>
    </PermissionGate>
  );
}
