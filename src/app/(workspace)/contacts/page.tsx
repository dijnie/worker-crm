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

export default function ContactsPage() {
  return (
    <PermissionGate entity="contact">
      <PageShell className="min-h-0">
        <PageShellHeader>
          <PageShellHeading>
            <PageShellTitle>Contacts</PageShellTitle>
            <PageShellDescription>
              Manage your workspace records
            </PageShellDescription>
          </PageShellHeading>
          <PageShellActions>
            <CreateRecordButton entity="contact" />
          </PageShellActions>
        </PageShellHeader>
        <PageShellContent className="min-h-0">
          <RecordList entity="contact" />
        </PageShellContent>
      </PageShell>
    </PermissionGate>
  );
}
