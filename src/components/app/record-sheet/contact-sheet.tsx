"use client";
import { ApiError } from "@/lib/api";
import { useAppData, useAppQuery } from "../app-data-provider";
import { useAssigneeDirectory } from "../records/use-assignee-directory";
import { Skeleton } from "@/components/ui/skeleton";
import { DetailSheetBody, DetailSheetProse, DetailSheetSection, DetailSheetStat, DetailSheetStats } from "../detail-sheet";
import { PropertyPanel, type SheetProps } from "./property-panel";
import { RecordActions } from "./record-actions";
import { RelatedRecords, contactName } from "./related-records";
export function ContactSheet({ id, onOpen, onDirtyChange }: SheetProps) {
  const { api } = useAppData();
  const result = useAppQuery("contact", { id }, signal => api.contacts.get(id, { signal }));
  const directory = useAssigneeDirectory();
  const contact = result.data;
  const owner = directory.data?.find(owner => owner.id === contact?.ownerId);
  const primaryOf: unknown = contact?.primaryOf;
  const primaryCompany = primaryOf && typeof primaryOf === "object" && "id" in primaryOf && typeof primaryOf.id === "string" && "name" in primaryOf && typeof primaryOf.name === "string" ? { id: primaryOf.id, name: primaryOf.name, archivedAt: "archivedAt" in primaryOf && typeof primaryOf.archivedAt === "string" ? primaryOf.archivedAt : null } : null;
  return <DetailSheetBody data-record-kind="contact">
    {result.loading && <div role="status" aria-busy="true" aria-label="Loading contact" className="space-y-3 px-5 py-4">
      <Skeleton className="h-8 w-56 max-w-full" />
      <Skeleton className="h-4 w-72 max-w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
    </div>}
    {!!result.error && <div role="alert" className="space-y-2 px-5 py-4 text-destructive text-xs">
      <p>{result.error instanceof ApiError && result.error.status === 404 ? "Contact not found." : result.error instanceof Error ? result.error.message : "Could not load contact."}</p>
      <button type="button" className="underline" onClick={result.refresh}>Retry contact</button>
    </div>}
    {contact && <>
      <DetailSheetSection className="py-4">
        <h2 className="wrap-anywhere font-medium text-xl tracking-tight">{contactName(contact)}</h2>
        {result.refreshing && <p role="status" className="text-muted-foreground text-xs">Refreshing contact…</p>}
        <div className="flex flex-wrap items-center gap-2 pt-1"><RecordActions entity="contact" id={id} archivedAt={contact.archivedAt} /></div>
      </DetailSheetSection>
      <DetailSheetStats>
        <DetailSheetStat label="Employer">{contact.company?.name ?? <span className="text-muted-foreground">None</span>}</DetailSheetStat>
        <DetailSheetStat label="Deals"><span className="tabular-nums">{contact.deals.length}</span></DetailSheetStat>
        <DetailSheetStat label="Owner">{owner?.name ?? <span className="text-muted-foreground">Unassigned</span>}</DetailSheetStat>
      </DetailSheetStats>
      <PropertyPanel entity="contact" record={contact} onDirtyChange={onDirtyChange} relationLabels={{
        ...(contact.company ? { companyId: contact.company.name } : {}),
        ...(owner ? { ownerId: owner.name } : {}),
      }} />
      {!!directory.error && <DetailSheetSection><p role="alert" className="text-destructive text-xs">Owner directory unavailable. <button type="button" className="underline" onClick={directory.refresh}>Retry directory</button></p></DetailSheetSection>}
      <RelatedRecords title="Employer" kind="company" records={contact.company ? [contact.company] : []} onOpen={onOpen} />
      <RelatedRecords title="Primary contact of" kind="company" records={primaryCompany ? [primaryCompany] : []} onOpen={onOpen} />
      <DetailSheetSection><DetailSheetProse>Changing employer preserves primary-contact relationships and deal participation.</DetailSheetProse></DetailSheetSection>
      <RelatedRecords title="Associated deals" kind="deal" records={contact.deals} onOpen={onOpen} />
    </>}
  </DetailSheetBody>;
}
