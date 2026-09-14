"use client";
import { ApiError } from "@/lib/api";
import { useAppData, useAppQuery } from "../app-data-provider";
import { useAssigneeDirectory } from "../records/use-assignee-directory";
import { Skeleton } from "@/components/ui/skeleton";
import { PropertyPanel, type SheetProps } from "./property-panel";
import { RecordActions } from "./record-actions";
import { RelatedRecords, contactName } from "./related-records";
export function ContactSheet({ id, onOpen, onDirtyChange }: SheetProps) {
  const { api } = useAppData();
  const result = useAppQuery("contact", { id }, signal => api.contacts.get(id, { signal }));
  const directory = useAssigneeDirectory();
  const contact = result.data;
  const primaryOf: unknown = contact?.primaryOf;
  const primaryCompany = primaryOf && typeof primaryOf === "object" && "id" in primaryOf && typeof primaryOf.id === "string" && "name" in primaryOf && typeof primaryOf.name === "string" ? { id: primaryOf.id, name: primaryOf.name, archivedAt: "archivedAt" in primaryOf && typeof primaryOf.archivedAt === "string" ? primaryOf.archivedAt : null } : null;
  return <div className="space-y-6" data-record-kind="contact">
    {result.loading && <div role="status" aria-busy="true" aria-label="Loading contact" className="space-y-4">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
      </div>
    </div>}
    {!!result.error && <div role="alert"><p>{result.error instanceof ApiError && result.error.status === 404 ? "Contact not found." : result.error instanceof Error ? result.error.message : "Could not load contact."}</p><button className="underline" onClick={result.refresh}>Retry contact</button></div>}
    {contact && <>
      <div><h2 className="break-words text-xl font-semibold">{contactName(contact)}</h2>{result.refreshing && <p role="status" className="text-xs text-muted-foreground">Refreshing contact…</p>}</div>
      <RecordActions entity="contact" id={id} archivedAt={contact.archivedAt} />
      <PropertyPanel entity="contact" record={contact} onDirtyChange={onDirtyChange} relationLabels={{
        ...(contact.company ? { companyId: contact.company.name } : {}),
        ...(directory.data?.find(owner => owner.id === contact.ownerId) ? { ownerId: directory.data.find(owner => owner.id === contact.ownerId)!.name } : {}),
      }} />
      {!!directory.error && <p role="alert" className="text-xs">Owner directory unavailable. <button className="underline" onClick={directory.refresh}>Retry directory</button></p>}
      <RelatedRecords title="Employer" kind="company" records={contact.company ? [contact.company] : []} onOpen={onOpen} />
      <RelatedRecords title="Primary contact of" kind="company" records={primaryCompany ? [primaryCompany] : []} onOpen={onOpen} />
      <p className="text-xs text-muted-foreground">Changing employer preserves primary-contact relationships and deal participation.</p>
      <RelatedRecords title="Associated deals" kind="deal" records={contact.deals} onOpen={onOpen} />
    </>}
  </div>;
}
