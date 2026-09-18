"use client";
import { canPermission } from "@/lib/auth/permissions";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useAppData } from "../app-data-provider";
import { DetailSheetSection } from "../detail-sheet";
import { RecordForm } from "../records/record-form";
import { RecordPicker } from "../records/record-picker";
import { RECORD_INVALIDATIONS, type RecordDraft, type RecordEntity } from "../records/form-values";
import { buildRecordUrl, type RecordRef } from "./record-navigation";
import { InlineField, type DirtyChange, type DirtyEditor } from "./inline-field";
import { propertyError } from "./property-values";
function RelatedLink({ record, onOpen, children }: { record: RecordRef; onOpen: (record: RecordRef) => void; children: ReactNode }) {
  const fallback = `/${record.kind === "company" ? "companies" : record.kind === "contact" ? "contacts" : "deals"}?${new URLSearchParams({ record: `${record.kind}:${record.id}` })}`;
  let href = fallback;
  try { href = buildRecordUrl(typeof window === "undefined" ? fallback : window.location.href, record); } catch { /* An overfull stack still exposes a usable direct record link. */ }
  return <a href={href} className="min-w-0 truncate text-left text-xs underline-offset-2 hover:underline" onClick={event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); onOpen(record);
  }}>{children}</a>;
}
export const contactName = (contact: { firstName: string; lastName: string | null }) => [contact.firstName, contact.lastName].filter(Boolean).join(" ");
export function RelatedRecords({ title, kind, records, onOpen, children }: {
  title: string; kind: RecordEntity; records: { id: string; name: string; archivedAt?: string | null; role?: string | null }[];
  onOpen: (record: RecordRef) => void; children?: ReactNode;
}) {
  const { account } = useAppData();
  if (!canPermission(account, kind, "read")) return null;
  return <DetailSheetSection aria-label={title} title={title} action={<span className="text-muted-foreground text-xs tabular-nums">{records.length}</span>}>
    {records.length ? <ul className="divide-y">
      {records.map(record => <li key={record.id} className="flex min-w-0 flex-col gap-1 py-1.5">
        <div className="flex min-w-0 items-center gap-2"><RelatedLink record={{ kind, id: record.id }} onOpen={onOpen}>{record.name}</RelatedLink>{record.archivedAt && <span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-muted-foreground text-xs">Archived</span>}</div>
        {"role" in record && <p className="text-muted-foreground text-xs">Role: {record.role || "Not set"}</p>}
      </li>)}
    </ul> : <p className="text-muted-foreground text-xs">No {title.toLowerCase()}.</p>}
    {children}
  </DetailSheetSection>;
}

export function SheetFormDialog({ open, onOpenChange, title, description, editorKey, onDirtyChange, children }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; editorKey: string;
  onDirtyChange: DirtyChange; children: (register: (editor: DirtyEditor | null) => void, requestClose: () => void) => ReactNode;
}) {
  const editor = useRef<DirtyEditor | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editorPending, setEditorPending] = useState(false);
  const register = useCallback((state: DirtyEditor | null) => { editor.current = state; setEditorPending(state?.pending ?? false); onDirtyChange(editorKey, state); }, [editorKey, onDirtyChange]);
  useEffect(() => { if (!open) { setConfirm(false); register(null); } }, [open, register]);
  useEffect(() => () => onDirtyChange(editorKey, null), [editorKey, onDirtyChange]);
  const requestClose = () => { if (saving || editor.current?.pending) return; if (editor.current?.dirty) setConfirm(true); else onOpenChange(false); };
  return <Dialog open={open} onOpenChange={next => {
    if (saving || editor.current?.pending) return;
    if (!next && editor.current?.dirty) setConfirm(true); else onOpenChange(next);
  }}><DialogContent className="max-h-[90dvh] gap-4 overflow-y-auto sm:max-w-lg"><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription>
    {open && children(register, requestClose)}
    {confirm && <div role="alert" className="space-y-3 rounded-md border p-3 text-xs"><p>Save your changes before closing?</p><div className="flex flex-wrap gap-2">
      <Button disabled={saving || editorPending} onClick={async () => { setSaving(true); const ok = await editor.current?.save(); setSaving(false); if (ok) { setConfirm(false); onOpenChange(false); } }}>Save and close</Button>
      <Button disabled={saving || editorPending} variant="outline" onClick={() => { editor.current?.discard(); register(null); setConfirm(false); onOpenChange(false); }}>Discard</Button>
      <Button disabled={saving || editorPending} variant="ghost" onClick={() => setConfirm(false)}>Stay</Button>
    </div></div>}
  </DialogContent></Dialog>;
}
export function ContextualCreate({ entity, defaults, onDirtyChange, recordKey }: {
  entity: RecordEntity; defaults: RecordDraft; onDirtyChange: DirtyChange; recordKey: string;
}) {
  const [open, setOpen] = useState(false);
  const { account } = useAppData();
  if (!canPermission(account, entity, "create") || entity === "deal" && !canPermission(account, "company", "read")) return null;
  return <><Button size="sm" variant="outline-ghost" onClick={() => setOpen(true)}>Add {entity}</Button>
    <SheetFormDialog open={open} onOpenChange={setOpen} title={`New ${entity}`} description={`Add a ${entity} with this company's defaults.`} editorKey={`${recordKey}:create-${entity}`} onDirtyChange={onDirtyChange}>
      {(register, requestClose) => <RecordForm entity={entity} defaults={defaults} onDirtyChange={register} onCreated={() => setOpen(false)} onCancel={requestClose} />}
    </SheetFormDialog>
  </>;
}

function AttachContactForm({ dealId, attachedIds, onSaved, onDirtyChange }: { dealId: string; attachedIds: readonly string[]; onSaved: () => void; onDirtyChange: (state: DirtyEditor | null) => void }) {
  const { api, invalidate, generation, store } = useAppData();
  const roleId = useId();
  const [contactId, setContactId] = useState(""); const [role, setRole] = useState("");
  const [error, setError] = useState(""); const [pending, setPending] = useState(false);
  const flight = useRef<Promise<boolean> | null>(null); const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const save = (): Promise<boolean> => {
    if (flight.current) return flight.current;
    if (!contactId) { setError("Choose a contact."); return Promise.resolve(false); }
    if (role.trim().length > 80) { setError("Role must be at most 80 characters."); return Promise.resolve(false); }
    setPending(true); setError("");
    flight.current = (async () => {
      try { await api.deals.attachContact(dealId, { contactId, role: role.trim() || null });
        if (!mounted.current || !store.isCurrent(generation)) return false;
        invalidate(RECORD_INVALIDATIONS); onSaved(); return true;
      } catch (failure) { if (mounted.current && store.isCurrent(generation)) setError(propertyError(failure)); return false; }
      finally { flight.current = null; if (mounted.current && store.isCurrent(generation)) setPending(false); }
    })(); return flight.current;
  };
  const latest = useRef(save); latest.current = save;
  const dirty = !!contactId || !!role || pending;
  useEffect(() => { onDirtyChange(dirty ? { dirty, pending, save: () => latest.current(), discard: () => { setContactId(""); setRole(""); setError(""); } } : null); return () => onDirtyChange(null); }, [dirty, pending, onDirtyChange]);
  return <form className="space-y-4" onSubmit={event => { event.preventDefault(); void save(); }}>
    <RecordPicker kind="contact" label="Participant" value={contactId} onChange={setContactId} required disabled={pending} excludeIds={attachedIds} />
    <p className="text-muted-foreground text-xs">Search all active contacts, including people at other companies.</p>
    <Field>
      <FieldLabel htmlFor={roleId}>Role (optional)</FieldLabel>
      <Input id={roleId} aria-label="Participant role" value={role} disabled={pending} maxLength={80} onChange={event => setRole(event.target.value)} />
    </Field>
    {error && <p role="alert" className="text-destructive text-xs">{error}</p>}<Button type="submit" disabled={pending}>{pending ? "Attaching…" : "Attach contact"}</Button>
  </form>;
}
export function DealContacts({ dealId, contacts, onOpen, onDirtyChange }: {
  dealId: string; contacts: { id: string; firstName: string; lastName: string | null; role: string | null; archivedAt: string | null }[];
  onOpen: (record: RecordRef) => void; onDirtyChange: DirtyChange;
}) {
  const { api, invalidate, store, generation, account } = useAppData();
  const [attach, setAttach] = useState(false); const [detach, setDetach] = useState<string | null>(null);
  const [pending, setPending] = useState(false); const [error, setError] = useState(""); const busy = useRef(false);
  const mounted = useRef(true); useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  if (!canPermission(account, "contact", "read")) return null;
  const editable = canPermission(account, "deal", "update");
  return <DetailSheetSection aria-label="Deal contacts" title="Contacts" action={<span className="text-muted-foreground text-xs tabular-nums">{contacts.length}</span>}>
    {contacts.length ? contacts.map(contact => <div key={contact.id} className="space-y-1 pb-2">
      <div className="flex flex-wrap items-center gap-2">
        <RelatedLink record={{ kind: "contact", id: contact.id }} onOpen={onOpen}>{contactName(contact)}</RelatedLink>
        {contact.archivedAt && <span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-muted-foreground text-xs">Archived</span>}
        {editable && <Button size="sm" variant="ghost" onClick={() => { setError(""); setDetach(contact.id); }}>Detach {contactName(contact)}</Button>}
      </div>
      <InlineField readOnly={!editable} fieldKey={`deal:${dealId}:role:${contact.id}`} label={`Role for ${contactName(contact)}`} value={contact.role ?? ""} onDirtyChange={onDirtyChange} onSave={async input => {
        const role = input.trim(); if (role.length > 80) throw new Error("Role must be at most 80 characters.");
        const saved = await api.deals.updateContactRole(dealId, contact.id, { role: role || null }); invalidate(RECORD_INVALIDATIONS); return saved.role ?? "";
      }} />
    </div>) : <p className="text-muted-foreground text-xs">No contacts attached.</p>}
    {editable && <Button size="sm" variant="outline-ghost" onClick={() => setAttach(true)}>Attach existing contact</Button>}
    <SheetFormDialog open={attach} onOpenChange={setAttach} title="Attach contact" description="Add a participant independently of their employer." editorKey={`deal:${dealId}:attach`} onDirtyChange={onDirtyChange}>
      {register => <AttachContactForm dealId={dealId} attachedIds={contacts.map(contact => contact.id)} onSaved={() => setAttach(false)} onDirtyChange={register} />}
    </SheetFormDialog>
    <Dialog open={!!detach} onOpenChange={open => { if (!pending && !open) setDetach(null); }}><DialogContent className="gap-3 sm:max-w-md"><DialogTitle>Detach contact?</DialogTitle><DialogDescription>This removes their participation in this deal. Their employer and other records stay unchanged.</DialogDescription>
      {error && <p role="alert" className="text-destructive text-xs">{error}</p>}<div className="flex justify-end gap-2"><Button data-dialog-close variant="outline" disabled={pending} onClick={() => setDetach(null)}>Cancel</Button><Button disabled={pending} onClick={async () => {
        if (!detach || busy.current) return; busy.current = true; setPending(true); setError("");
        try { await api.deals.detachContact(dealId, detach); if (store.isCurrent(generation)) { invalidate(RECORD_INVALIDATIONS); if (mounted.current) setDetach(null); } }
        catch (failure) { if (mounted.current && store.isCurrent(generation)) setError(propertyError(failure)); }
        finally { busy.current = false; if (mounted.current && store.isCurrent(generation)) setPending(false); }
      }}>{pending ? "Detaching…" : "Detach contact"}</Button></div>
    </DialogContent></Dialog>
  </DetailSheetSection>;
}
