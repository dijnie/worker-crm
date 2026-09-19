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

export default async function DealsPage() {
  const dictionary = await getWorkspaceDictionary();
  return (
    <PermissionGate entity="deal">
      <PageShell className="min-h-0">
        <PageShellHeader>
          <PageShellHeading>
            <PageShellTitle>{dictionary.crm.entities.DEAL.plural}</PageShellTitle>
            <PageShellDescription>
              {dictionary.recordList.pageDescription}
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
