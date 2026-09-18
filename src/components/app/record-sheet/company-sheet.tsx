"use client";
import { ApiError } from "@/lib/api";
import { useAppData, useAppQuery } from "../app-data-provider";
import { useAssigneeDirectory } from "../records/use-assignee-directory";
import { Skeleton } from "@/components/ui/skeleton";
import { DetailSheetBody, DetailSheetProse, DetailSheetSection, DetailSheetStat, DetailSheetStats } from "../detail-sheet";
import { PropertyPanel, type SheetProps } from "./property-panel";
import { RecordActions } from "./record-actions";
import { RelatedRecords, ContextualCreate, contactName } from "./related-records";
export function CompanySheet({ id, onOpen, onDirtyChange }: SheetProps) {
  const { api } = useAppData();
  const result = useAppQuery("company", { id }, signal => api.companies.get(id, { signal }));
  const directory = useAssigneeDirectory();
  const company = result.data;
  const owner = directory.data?.find(owner => owner.id === company?.ownerId);
  return <DetailSheetBody data-record-kind="company">
    {result.loading && <div role="status" aria-busy="true" aria-label="Loading company" className="space-y-3 px-5 py-4">
      <Skeleton className="h-8 w-56 max-w-full" />
      <Skeleton className="h-4 w-72 max-w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
    </div>}
    {!!result.error && <div role="alert" className="space-y-2 px-5 py-4 text-destructive text-xs">
      <p>{result.error instanceof ApiError && result.error.status === 404 ? "Company not found." : result.error instanceof Error ? result.error.message : "Could not load company."}</p>
      <button type="button" className="underline" onClick={result.refresh}>Retry company</button>
    </div>}
    {company && <>
      <DetailSheetSection className="py-4">
        <h2 className="wrap-anywhere font-medium text-xl tracking-tight">{company.name}</h2>
        {result.refreshing && <p role="status" className="text-muted-foreground text-xs">Refreshing company…</p>}
        <div className="flex flex-wrap items-center gap-2 pt-1"><RecordActions entity="company" id={id} archivedAt={company.archivedAt} /></div>
      </DetailSheetSection>
      <DetailSheetStats>
        <DetailSheetStat label="Deals"><span className="tabular-nums">{company.deals.length}</span></DetailSheetStat>
        <DetailSheetStat label="Contacts"><span className="tabular-nums">{company.contacts.length}</span></DetailSheetStat>
        <DetailSheetStat label="Owner">{owner?.name ?? <span className="text-muted-foreground">Unassigned</span>}</DetailSheetStat>
      </DetailSheetStats>
      <PropertyPanel entity="company" record={company} onDirtyChange={onDirtyChange} relationLabels={{
        ...(company.primaryContact ? { primaryContactId: contactName(company.primaryContact) } : {}),
        ...(owner ? { ownerId: owner.name } : {}),
      }} />
      {!!directory.error && <DetailSheetSection><p role="alert" className="text-destructive text-xs">Owner directory unavailable. <button type="button" className="underline" onClick={directory.refresh}>Retry directory</button></p></DetailSheetSection>}
      <RelatedRecords title="Primary contact" kind="contact" records={company.primaryContact ? [{ ...company.primaryContact, name: contactName(company.primaryContact) }] : []} onOpen={onOpen} />
      <RelatedRecords title="Employed contacts" kind="contact" records={company.contacts.map(contact => ({ ...contact, name: contactName(contact) }))} onOpen={onOpen}>
        <ContextualCreate entity="contact" defaults={{ companyId: id, ownerId: company.ownerId ?? "" }} recordKey={`company:${id}`} onDirtyChange={onDirtyChange} />
      </RelatedRecords>
      <DetailSheetSection><DetailSheetProse>Primary contact and employer are independent.</DetailSheetProse></DetailSheetSection>
      <RelatedRecords title="Deals" kind="deal" records={company.deals} onOpen={onOpen}>
        <ContextualCreate entity="deal" defaults={{ companyId: id, ...(company.ownerId ? { ownerId: company.ownerId } : {}) }} recordKey={`company:${id}`} onDirtyChange={onDirtyChange} />
      </RelatedRecords>
    </>}
  </DetailSheetBody>;
}
