"use client";
import { ApiError } from "@/lib/api";
import { useAppData, useAppQuery } from "../app-data-provider";
import { useDictionary } from "../i18n-provider";
import { errorMessage } from "@/lib/i18n/error-message";
import { useAssigneeDirectory } from "../records/use-assignee-directory";
import { Skeleton } from "@/components/ui/skeleton";
import { DetailSheetBody, DetailSheetProse, DetailSheetSection, DetailSheetStat, DetailSheetStats } from "../detail-sheet";
import { PropertyPanel, type SheetProps } from "./property-panel";
import { RecordActions } from "./record-actions";
import { RelatedRecords, ContextualCreate, contactName } from "./related-records";
export function CompanySheet({ id, onOpen, onDirtyChange }: SheetProps) {
  const { api } = useAppData();
  const dictionary = useDictionary();
  const { sheet, company: copy, common } = dictionary.recordSheet;
  const entityLower = dictionary.crm.entities.COMPANY.lower;
  const result = useAppQuery("company", { id }, signal => api.companies.get(id, { signal }));
  const directory = useAssigneeDirectory();
  const company = result.data;
  const owner = directory.data?.find(owner => owner.id === company?.ownerId);
  return <DetailSheetBody data-record-kind="company">
    {result.loading && <div role="status" aria-busy="true" aria-label={sheet.loadingAria(entityLower)} className="space-y-3 px-5 py-4">
      <Skeleton className="h-8 w-56 max-w-full" />
      <Skeleton className="h-4 w-72 max-w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
    </div>}
    {!!result.error && <div role="alert" className="space-y-2 px-5 py-4 text-destructive text-xs">
      <p>{result.error instanceof ApiError && result.error.status === 404 ? sheet.notFound(dictionary.crm.entities.COMPANY.singular) : result.error instanceof Error ? errorMessage(result.error, dictionary) : sheet.loadFailed(entityLower)}</p>
      <button type="button" className="underline" onClick={result.refresh}>{sheet.retry(entityLower)}</button>
    </div>}
    {company && <>
      <DetailSheetSection className="py-4">
        <h2 className="wrap-anywhere font-medium text-xl tracking-tight">{company.name}</h2>
        {result.refreshing && <p role="status" className="text-muted-foreground text-xs">{sheet.refreshing(entityLower)}</p>}
        <div className="flex flex-wrap items-center gap-2 pt-1"><RecordActions entity="company" id={id} archivedAt={company.archivedAt} /></div>
      </DetailSheetSection>
      <DetailSheetStats>
        <DetailSheetStat label={dictionary.crm.entities.DEAL.plural}><span className="tabular-nums">{company.deals.length}</span></DetailSheetStat>
        <DetailSheetStat label={dictionary.crm.entities.CONTACT.plural}><span className="tabular-nums">{company.contacts.length}</span></DetailSheetStat>
        <DetailSheetStat label={sheet.ownerLabel}>{owner?.name ?? <span className="text-muted-foreground">{common.unassigned}</span>}</DetailSheetStat>
      </DetailSheetStats>
      <PropertyPanel entity="company" record={company} onDirtyChange={onDirtyChange} relationLabels={{
        ...(company.primaryContact ? { primaryContactId: contactName(company.primaryContact) } : {}),
        ...(owner ? { ownerId: owner.name } : {}),
      }} />
      {!!directory.error && <DetailSheetSection><p role="alert" className="text-destructive text-xs">{sheet.directoryUnavailable} <button type="button" className="underline" onClick={directory.refresh}>{sheet.retryDirectory}</button></p></DetailSheetSection>}
      <RelatedRecords title={copy.primaryContactTitle} kind="contact" records={company.primaryContact ? [{ ...company.primaryContact, name: contactName(company.primaryContact) }] : []} onOpen={onOpen} />
      <RelatedRecords title={copy.employedContactsTitle} kind="contact" records={company.contacts.map(contact => ({ ...contact, name: contactName(contact) }))} onOpen={onOpen}>
        <ContextualCreate entity="contact" defaults={{ companyId: id, ownerId: company.ownerId ?? "" }} recordKey={`company:${id}`} onDirtyChange={onDirtyChange} />
      </RelatedRecords>
      <DetailSheetSection><DetailSheetProse>{copy.prose}</DetailSheetProse></DetailSheetSection>
      <RelatedRecords title={dictionary.crm.entities.DEAL.plural} kind="deal" records={company.deals} onOpen={onOpen}>
        <ContextualCreate entity="deal" defaults={{ companyId: id, ...(company.ownerId ? { ownerId: company.ownerId } : {}) }} recordKey={`company:${id}`} onDirtyChange={onDirtyChange} />
      </RelatedRecords>
    </>}
  </DetailSheetBody>;
}
