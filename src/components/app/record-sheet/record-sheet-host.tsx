"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { useRef, useState } from "react";
import { ArrowLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppData, useAppQuery } from "../app-data-provider";
import { TimelinePanel } from "../timeline/timeline-panel";
import { CompanySheet } from "./company-sheet";
import { ContactSheet } from "./contact-sheet";
import { DealSheet } from "./deal-sheet";
import type { RecordRef } from "./record-navigation";
import { useRecordStack } from "./use-record-stack";

export function RecordSheetHost() {
  const { generation, store } = useAppData();
  const navigation = useRecordStack();
  const record = navigation.stack.at(-1);
  const open = !!(record || navigation.error) && store.isCurrent(generation);
  const trigger = useRef<HTMLElement | null>(null);
  const close = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState("properties");
  const title = record ? `${record.kind[0].toUpperCase()}${record.kind.slice(1)} record` : "Invalid record link";
  const key = record ? `${record.kind}:${record.id}:${generation}` : `invalid:${generation}`;
  const props = { id: record?.id ?? "", onOpen: navigation.open, onDirtyChange: navigation.onDirtyChange };
  return <Dialog.Root open={open} onOpenChange={value => { if (!value) navigation.back(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-overlay" />
      <Dialog.Content
        ref={content}
        data-record-sheet
        className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l bg-background text-foreground shadow-popover md:max-w-6xl"
        onOpenAutoFocus={event => {
          event.preventDefault();
          if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) trigger.current = document.activeElement;
          close.current?.focus();
        }}
        onCloseAutoFocus={event => {
          event.preventDefault();
          const target = trigger.current?.isConnected ? trigger.current : document.getElementById("main-content");
          target?.focus();
        }}
        onEscapeKeyDown={event => {
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
        }}
        onPointerDownOutside={event => event.preventDefault()}
      >
        <header className="flex shrink-0 items-center gap-2 border-b p-4">
          <Button variant="ghost" className="min-h-11 min-w-11" aria-label={navigation.stack.length > 1 ? "Back to previous record" : "Close record"} onClick={navigation.back}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <div className="min-w-0 flex-1">
            <Dialog.Title className="font-semibold">{title}</Dialog.Title>
            <Dialog.Description className="text-sm text-muted-foreground">{navigation.stack.length > 1 ? `${navigation.stack.length} linked records open. ` : ""}Properties, relationships and activity history.</Dialog.Description>
          </div>
          {navigation.stack.length > 1 && <Button variant="ghost" className="min-h-11" onClick={navigation.closeAll}>Close all</Button>}
          <Button ref={close} variant="ghost" className="min-h-11 min-w-11" aria-label="Close record sheet" onClick={navigation.back}><X className="h-4 w-4" aria-hidden="true" /></Button>
        </header>
        {navigation.error ? <div role="alert" className="space-y-4 p-6"><p>{navigation.error.message}</p><Button onClick={navigation.closeAll}>Close invalid link</Button><Button variant="outline" onClick={() => window.location.reload()}>Retry</Button></div> : record && <>
          <div role="tablist" aria-label="Record content" className="flex shrink-0 border-b px-4 md:hidden">
            {["properties", "timeline"].map(value => <button key={value} type="button" role="tab" id={`record-tab-${value}`} aria-controls={`record-panel-${value}`} aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} onClick={() => setTab(value)} onKeyDown={event => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) { event.preventDefault(); const next = event.key === "Home" ? "properties" : event.key === "End" ? "timeline" : tab === "properties" ? "timeline" : "properties"; setTab(next); document.getElementById(`record-tab-${next}`)?.focus(); } }} className={`min-h-11 border-b-2 px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${tab === value ? "border-primary font-medium" : "border-transparent text-muted-foreground"}`}>{value === "properties" ? "Properties & relations" : "Timeline"}</button>)}
          </div>
          <div key={key} className="grid min-h-0 flex-1 md:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)]">
            <section id="record-panel-timeline" aria-label="Record timeline" className={`${tab === "timeline" ? "block" : "hidden"} min-h-0 min-w-0 overflow-y-auto p-4 md:block md:p-6`}><RecordTimeline record={record} /></section>
            <section id="record-panel-properties" aria-label="Record properties and relationships" className={`${tab === "properties" ? "block" : "hidden"} min-h-0 min-w-0 overflow-y-auto p-4 md:block md:border-l md:p-6`}>
              {record.kind === "company" ? <CompanySheet {...props} /> : record.kind === "contact" ? <ContactSheet {...props} /> : <DealSheet {...props} />}
            </section>
          </div>
        </>}
        <Dialog.Root open={navigation.pending && open} onOpenChange={value => { if (!value) navigation.stay(); }}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-overlay" />
            <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 space-y-4 rounded-lg border bg-popover p-6 text-popover-foreground shadow-popover" onPointerDownOutside={event => event.preventDefault()} onEscapeKeyDown={event => { if (navigation.saving) event.preventDefault(); }}>
              <Dialog.Title className="text-lg font-semibold">Unsaved changes</Dialog.Title>
              <Dialog.Description className="text-sm text-muted-foreground">Save your changes before leaving this record, discard them, or stay and keep editing.</Dialog.Description>
              {navigation.saveError && <p role="alert" className="text-sm text-destructive">{navigation.saveError}</p>}
              <div className="flex flex-wrap justify-end gap-2"><Button data-dialog-close variant="outline" onClick={navigation.stay} disabled={navigation.saving}>Stay</Button><Button variant="outline" onClick={navigation.discard} disabled={navigation.saving}>Discard</Button><Button onClick={() => void navigation.save()} disabled={navigation.saving}>{navigation.saving ? "Saving…" : "Save changes"}</Button></div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

function RecordTimeline({ record }: { record: RecordRef }) {
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
  if (detail.error) return <p className="text-sm text-muted-foreground">Load the record to view its timeline.</p>;
  return <TimelinePanel record={record} labels={labels} />;
}
