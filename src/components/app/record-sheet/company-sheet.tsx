"use client";
import { ApiError } from "@/lib/api";
import { useAppData, useAppQuery } from "../app-data-provider";
import { useAssigneeDirectory } from "../records/use-assignee-directory";
import { Skeleton } from "@/components/ui/skeleton";
import { PropertyPanel, type SheetProps } from "./property-panel";
import { RecordActions } from "./record-actions";
import { RelatedRecords, ContextualCreate, contactName } from "./related-records";
export function CompanySheet({ id, onOpen, onDirtyChange }: SheetProps) {
  const { api } = useAppData();
  const result = useAppQuery("company", { id }, signal => api.companies.get(id, { signal }));
  const directory = useAssigneeDirectory();
  const company = result.data;
  return <div className="space-y-6" data-record-kind="company">
    {result.loading && <div role="status" aria-busy="true" aria-label="Loading company" className="space-y-4">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
      </div>
    </div>}
    {!!result.error && <div role="alert"><p>{result.error instanceof ApiError && result.error.status === 404 ? "Company not found." : result.error instanceof Error ? result.error.message : "Could not load company."}</p><button className="underline" onClick={result.refresh}>Retry company</button></div>}
    {company && <>
      <div><h2 className="break-words text-xl font-semibold">{company.name}</h2>{result.refreshing && <p role="status" className="text-xs text-muted-foreground">Refreshing company…</p>}</div>
      <RecordActions entity="company" id={id} archivedAt={company.archivedAt} />
      <PropertyPanel entity="company" record={company} onDirtyChange={onDirtyChange} relationLabels={{
        ...(company.primaryContact ? { primaryContactId: contactName(company.primaryContact) } : {}),
        ...(directory.data?.find(owner => owner.id === company.ownerId) ? { ownerId: directory.data.find(owner => owner.id === company.ownerId)!.name } : {}),
      }} />
      {!!directory.error && <p role="alert" className="text-xs">Owner directory unavailable. <button className="underline" onClick={directory.refresh}>Retry directory</button></p>}
      <RelatedRecords title="Primary contact" kind="contact" records={company.primaryContact ? [{ ...company.primaryContact, name: contactName(company.primaryContact) }] : []} onOpen={onOpen} />
      <p className="text-xs text-muted-foreground">Primary contact and employer are independent.</p>
      <RelatedRecords title="Employed contacts" kind="contact" records={company.contacts.map(contact => ({ ...contact, name: contactName(contact) }))} onOpen={onOpen}>
        <ContextualCreate entity="contact" defaults={{ companyId: id, ownerId: company.ownerId ?? "" }} recordKey={`company:${id}`} onDirtyChange={onDirtyChange} />
      </RelatedRecords>
      <RelatedRecords title="Deals" kind="deal" records={company.deals} onOpen={onOpen}>
        <ContextualCreate entity="deal" defaults={{ companyId: id, ...(company.ownerId ? { ownerId: company.ownerId } : {}) }} recordKey={`company:${id}`} onDirtyChange={onDirtyChange} />
      </RelatedRecords>
    </>}
  </div>;
}
