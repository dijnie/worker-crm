"use client";
import { canPermission } from "@/lib/auth/permissions";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DetailSheet, DetailSheetBody, DetailSheetHeader, DetailSheetMain, DetailSheetRail, DetailSheetSplit } from "../detail-sheet";
import { useAppData, useAppQuery } from "../app-data-provider";
import { TimelinePanel } from "../timeline/timeline-panel";
import { CompanySheet } from "./company-sheet";
import { ContactSheet } from "./contact-sheet";
import { DealSheet } from "./deal-sheet";
import type { RecordRef } from "./record-navigation";
import { useRecordStack } from "./use-record-stack";
import type { DirtyChange } from "./inline-field";

export function RecordSheetHost() {
  const { generation, store, account } = useAppData();
  const navigation = useRecordStack();
  const record = navigation.stack.at(-1);
  const open = !!(record || navigation.error) && store.isCurrent(generation);
  const trigger = useRef<HTMLElement | null>(null);
  const content = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState("properties");
  const canReadActivity = canPermission(account, "activity", "read");
  const tabs = canReadActivity ? ["properties", "timeline"] : ["properties"];
  const title = record ? `${record.kind[0].toUpperCase()}${record.kind.slice(1)} record` : "Invalid record link";
  const key = record ? `${record.kind}:${record.id}:${generation}` : `invalid:${generation}`;
  const props = { id: record?.id ?? "", onOpen: navigation.open, onDirtyChange: navigation.onDirtyChange };
  return <DetailSheet
    open={open}
    onOpenChange={value => { if (!value) navigation.back(); }}
    contentProps={{
      ref: content,
      "data-record-sheet": true,
      onOpenAutoFocus: event => {
        event.preventDefault();
        if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) trigger.current = document.activeElement;
        content.current?.focus();
      },
      onCloseAutoFocus: event => {
        event.preventDefault();
        const target = trigger.current?.isConnected ? trigger.current : document.getElementById("main-content");
        target?.focus();
      },
      onEscapeKeyDown: event => {
        if (!(event.target instanceof Element)) return;
        const layer = event.target.closest('[role="dialog"]');
        if (layer && layer !== content.current) {
          // Focus can reach a new portal before Radix registers its layer.
          // Use that dialog's existing close action so this first Escape
          // still respects its dirty/pending guard and never closes the sheet.
          event.preventDefault();
          layer.querySelector<HTMLButtonElement>("[data-dialog-close]")?.click();
        } else if (event.target.closest("[data-inline-editor]")) {
          // The document capture handler precedes the field's React handler.
          event.preventDefault();
        }
      },
      onPointerDownOutside: event => event.preventDefault(),
    }}
  >
    <DetailSheetHeader
      title={title}
      description={navigation.stack.length > 1 ? `${navigation.stack.length} linked records open. Properties, relationships and activity history.` : "Properties, relationships and activity history."}
      actions={navigation.stack.length > 1 ? <Button variant="ghost" size="sm" onClick={navigation.closeAll}>Close all</Button> : null}
      onBack={navigation.back}
      backLabel={navigation.stack.length > 1 ? "Back to previous record" : "Close record"}
      closeLabel="Close record sheet"
      onClose={navigation.back}
    />
    {navigation.error ? <div role="alert" className="flex min-h-0 flex-1 flex-col items-start gap-3 overflow-y-auto px-5 py-6 text-xs">
      <p>{navigation.error.message}</p>
      <div className="flex flex-wrap gap-2"><Button size="sm" onClick={navigation.closeAll}>Close invalid link</Button><Button size="sm" variant="outline" onClick={() => window.location.reload()}>Retry</Button></div>
    </div> : record && !canPermission(account, record.kind, "read") ? <p role="alert" className="px-5 py-6 text-xs">Your role cannot read this record.</p> : record && <>
      <div role="tablist" aria-label="Record content" className="flex shrink-0 gap-6 border-b px-5 md:hidden">
        {tabs.map(value => <button key={value} type="button" role="tab" id={`record-tab-${value}`} aria-controls={`record-panel-${value}`} aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} onClick={() => setTab(value)} onKeyDown={event => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) { event.preventDefault(); const index = tabs.indexOf(tab); const next = event.key === "Home" ? tabs[0] : event.key === "End" ? tabs[tabs.length - 1] : tabs[(index + 1) % tabs.length]; setTab(next); document.getElementById(`record-tab-${next}`)?.focus(); } }} className={cn("-mb-px h-9 border-b-2 border-transparent font-medium text-muted-foreground text-xs whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring/50", tab === value && "border-foreground text-foreground")}>{value === "properties" ? "Properties & relations" : "Timeline"}</button>)}
      </div>
      <DetailSheetBody className="p-0"><DetailSheetSplit key={key} className={cn("min-h-0 flex-1 gap-0 lg:gap-0", canReadActivity && "md:grid md:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)] lg:grid lg:items-stretch")}>
        {canReadActivity && <DetailSheetMain role="region" id="record-panel-timeline" aria-label="Record timeline" className={cn("min-h-0 p-4 md:block md:p-6", tab === "timeline" ? "block" : "hidden")}><RecordTimeline record={record} onDirtyChange={navigation.onDirtyChange} /></DetailSheetMain>}
        <DetailSheetRail role="region" id="record-panel-properties" aria-label="Record properties and relationships" className={cn("min-h-0 md:block lg:w-full", canReadActivity && "md:border-l", tab === "properties" ? "block" : "hidden")}>
          {record.kind === "company" ? <CompanySheet {...props} /> : record.kind === "contact" ? <ContactSheet {...props} /> : <DealSheet {...props} />}
        </DetailSheetRail>
      </DetailSheetSplit></DetailSheetBody>
    </>}
    <Dialog open={navigation.pending && open} onOpenChange={value => { if (!value) navigation.stay(); }}>
      <DialogContent className="gap-3 sm:max-w-md" onPointerDownOutside={event => event.preventDefault()} onEscapeKeyDown={event => { if (navigation.saving) event.preventDefault(); }}>
        <DialogTitle>Unsaved changes</DialogTitle>
        <DialogDescription>Save your changes before leaving this record, discard them, or stay and keep editing.</DialogDescription>
        {navigation.saveError && <p role="alert" className="text-destructive text-xs">{navigation.saveError}</p>}
        <div className="flex flex-wrap justify-end gap-2"><Button data-dialog-close variant="outline" onClick={navigation.stay} disabled={navigation.saving}>Stay</Button><Button variant="outline" onClick={navigation.discard} disabled={navigation.saving}>Discard</Button><Button onClick={() => void navigation.save()} disabled={navigation.saving}>{navigation.saving ? "Saving…" : "Save changes"}</Button></div>
      </DialogContent>
    </Dialog>
  </DetailSheet>;
}

function RecordTimeline({ record, onDirtyChange }: { record: RecordRef; onDirtyChange: DirtyChange }) {
  const { api } = useAppData();
  const detail = useAppQuery<Record<string, unknown>>(record.kind, { id: record.id }, signal =>
    record.kind === "company" ? api.companies.get(record.id, { signal }) : record.kind === "contact" ? api.contacts.get(record.id, { signal }) : api.deals.get(record.id, { signal }));
  const labels: Record<string, string> = {};
  const add = (kind: RecordRef["kind"], value: unknown) => {
    if (!value || typeof value !== "object" || !("id" in value) || typeof value.id !== "string") return;
    const item = value as Record<string, unknown>;
    const name = typeof item.name === "string" ? item.name : [item.firstName, item.lastName].filter(value => typeof value === "string").join(" ");
    if (name) labels[`${kind}:${item.id}`] = `${name}${item.archivedAt ? " (archived)" : ""}`;
  };
  if (detail.data) {
    add(record.kind, detail.data);
    for (const field of ["company", "primaryOf"]) add("company", detail.data[field]);
    add("contact", detail.data.primaryContact);
    for (const [field, kind] of [["contacts", "contact"], ["deals", "deal"]] as const) {
      const values = detail.data[field];
      if (Array.isArray(values)) values.forEach(value => add(kind, value));
    }
  }
  if (detail.error) return <p className="text-muted-foreground text-xs">Load the record to view its timeline.</p>;
  return <TimelinePanel canCreateActivity={detail.data?.canCreateActivity === true} record={record} labels={labels} onDirtyChange={onDirtyChange} />;
}
