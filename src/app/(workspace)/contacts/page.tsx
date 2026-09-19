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
import { getWorkspaceDictionary } from "@/lib/i18n/workspace-locale";

export default async function ContactsPage() {
  const dictionary = await getWorkspaceDictionary();
  return (
    <PermissionGate entity="contact">
      <PageShell className="min-h-0">
        <PageShellHeader>
          <PageShellHeading>
            <PageShellTitle>{dictionary.crm.entities.CONTACT.plural}</PageShellTitle>
            <PageShellDescription>
              {dictionary.recordList.pageDescription}
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
