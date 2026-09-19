"use client";
import { canPermission } from "@/lib/auth/permissions";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useAppData } from "../app-data-provider";
import { useDictionary } from "../i18n-provider";
import { DetailSheetSection } from "../detail-sheet";
import { RecordForm } from "../records/record-form";
import { RecordPicker } from "../records/record-picker";
import { RECORD_INVALIDATIONS, RecordFieldError, recordEntityKey, type RecordDraft, type RecordEntity } from "../records/form-values";
import { buildRecordUrl, type RecordRef } from "./record-navigation";
import { InlineField, type DirtyChange, type DirtyEditor } from "./inline-field";
import { propertyFailureMessage } from "./property-values";
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
  const { common, relatedRecords: copy } = useDictionary().recordSheet;
  if (!canPermission(account, kind, "read")) return null;
  return <DetailSheetSection aria-label={title} title={title} action={<span className="text-muted-foreground text-xs tabular-nums">{records.length}</span>}>
    {records.length ? <ul className="divide-y">
      {records.map(record => <li key={record.id} className="flex min-w-0 flex-col gap-1 py-1.5">
        <div className="flex min-w-0 items-center gap-2"><RelatedLink record={{ kind, id: record.id }} onOpen={onOpen}>{record.name}</RelatedLink>{record.archivedAt && <span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-muted-foreground text-xs">{common.archived}</span>}</div>
        {"role" in record && <p className="text-muted-foreground text-xs">{copy.roleText(record.role || common.notSet)}</p>}
      </li>)}
    </ul> : <p className="text-muted-foreground text-xs">{copy.noItems(title.toLowerCase())}</p>}
    {children}
  </DetailSheetSection>;
}

export function SheetFormDialog({ open, onOpenChange, title, description, editorKey, onDirtyChange, children }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; editorKey: string;
  onDirtyChange: DirtyChange; children: (register: (editor: DirtyEditor | null) => void, requestClose: () => void) => ReactNode;
}) {
  const { common, relatedRecords: copy } = useDictionary().recordSheet;
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
    {confirm && <div role="alert" className="space-y-3 rounded-md border p-3 text-xs"><p>{copy.confirmCloseTitle}</p><div className="flex flex-wrap gap-2">
      <Button disabled={saving || editorPending} onClick={async () => { setSaving(true); const ok = await editor.current?.save(); setSaving(false); if (ok) { setConfirm(false); onOpenChange(false); } }}>{common.saveAndClose}</Button>
      <Button disabled={saving || editorPending} variant="outline" onClick={() => { editor.current?.discard(); register(null); setConfirm(false); onOpenChange(false); }}>{common.discard}</Button>
      <Button disabled={saving || editorPending} variant="ghost" onClick={() => setConfirm(false)}>{common.stay}</Button>
    </div></div>}
  </DialogContent></Dialog>;
}
export function ContextualCreate({ entity, defaults, onDirtyChange, recordKey }: {
  entity: RecordEntity; defaults: RecordDraft; onDirtyChange: DirtyChange; recordKey: string;
}) {
  const [open, setOpen] = useState(false);
  const { account } = useAppData();
  const dictionary = useDictionary();
  const entityLower = dictionary.crm.entities[recordEntityKey(entity)].lower;
  if (!canPermission(account, entity, "create") || entity === "deal" && !canPermission(account, "company", "read")) return null;
  return <><Button size="sm" variant="outline-ghost" onClick={() => setOpen(true)}>{dictionary.recordSheet.form.addEntity(entityLower)}</Button>
    <SheetFormDialog open={open} onOpenChange={setOpen} title={dictionary.recordSheet.form.newEntity(entityLower)} description={dictionary.recordSheet.relatedRecords.createDialogDescription(entityLower)} editorKey={`${recordKey}:create-${entity}`} onDirtyChange={onDirtyChange}>
      {(register, requestClose) => <RecordForm entity={entity} defaults={defaults} onDirtyChange={register} onCreated={() => setOpen(false)} onCancel={requestClose} />}
    </SheetFormDialog>
  </>;
}

function AttachContactForm({ dealId, attachedIds, onSaved, onDirtyChange }: { dealId: string; attachedIds: readonly string[]; onSaved: () => void; onDirtyChange: (state: DirtyEditor | null) => void }) {
  const { api, invalidate, generation, store } = useAppData();
  const dictionary = useDictionary();
  const { validation, relatedRecords: copy } = dictionary.recordSheet;
  const roleId = useId();
  const [contactId, setContactId] = useState(""); const [role, setRole] = useState("");
  const [error, setError] = useState(""); const [pending, setPending] = useState(false);
  const flight = useRef<Promise<boolean> | null>(null); const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const save = (): Promise<boolean> => {
    if (flight.current) return flight.current;
    if (!contactId) { setError(validation.contactRequired); return Promise.resolve(false); }
    if (role.trim().length > 80) { setError(validation.roleTooLong); return Promise.resolve(false); }
    setPending(true); setError("");
    flight.current = (async () => {
      try { await api.deals.attachContact(dealId, { contactId, role: role.trim() || null });
        if (!mounted.current || !store.isCurrent(generation)) return false;
        invalidate(RECORD_INVALIDATIONS); onSaved(); return true;
      } catch (failure) { if (mounted.current && store.isCurrent(generation)) setError(propertyFailureMessage(failure, dictionary)); return false; }
      finally { flight.current = null; if (mounted.current && store.isCurrent(generation)) setPending(false); }
    })(); return flight.current;
  };
  const latest = useRef(save); latest.current = save;
  const dirty = !!contactId || !!role || pending;
  useEffect(() => { onDirtyChange(dirty ? { dirty, pending, save: () => latest.current(), discard: () => { setContactId(""); setRole(""); setError(""); } } : null); return () => onDirtyChange(null); }, [dirty, pending, onDirtyChange]);
  return <form className="space-y-4" onSubmit={event => { event.preventDefault(); void save(); }}>
    <RecordPicker kind="contact" label={copy.participantLabel} value={contactId} onChange={setContactId} required disabled={pending} excludeIds={attachedIds} />
    <p className="text-muted-foreground text-xs">{copy.searchHint}</p>
    <Field>
      <FieldLabel htmlFor={roleId}>{copy.roleFieldLabel}</FieldLabel>
      <Input id={roleId} aria-label={copy.roleAria} value={role} disabled={pending} maxLength={80} onChange={event => setRole(event.target.value)} />
    </Field>
    {error && <p role="alert" className="text-destructive text-xs">{error}</p>}<Button type="submit" disabled={pending}>{pending ? copy.attaching : copy.attachContact}</Button>
  </form>;
}
export function DealContacts({ dealId, contacts, onOpen, onDirtyChange }: {
  dealId: string; contacts: { id: string; firstName: string; lastName: string | null; role: string | null; archivedAt: string | null }[];
  onOpen: (record: RecordRef) => void; onDirtyChange: DirtyChange;
}) {
  const { api, invalidate, store, generation, account } = useAppData();
  const dictionary = useDictionary();
  const { common, relatedRecords: copy } = dictionary.recordSheet;
  const [attach, setAttach] = useState(false); const [detach, setDetach] = useState<string | null>(null);
  const [pending, setPending] = useState(false); const [error, setError] = useState(""); const busy = useRef(false);
  const mounted = useRef(true); useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  if (!canPermission(account, "contact", "read")) return null;
  const editable = canPermission(account, "deal", "update");
  return <DetailSheetSection aria-label={copy.contactsAria} title={dictionary.crm.entities.CONTACT.plural} action={<span className="text-muted-foreground text-xs tabular-nums">{contacts.length}</span>}>
    {contacts.length ? contacts.map(contact => <div key={contact.id} className="space-y-1 pb-2">
      <div className="flex flex-wrap items-center gap-2">
        <RelatedLink record={{ kind: "contact", id: contact.id }} onOpen={onOpen}>{contactName(contact)}</RelatedLink>
        {contact.archivedAt && <span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-muted-foreground text-xs">{common.archived}</span>}
        {editable && <Button size="sm" variant="ghost" onClick={() => { setError(""); setDetach(contact.id); }}>{copy.detachButton(contactName(contact))}</Button>}
      </div>
      <InlineField readOnly={!editable} fieldKey={`deal:${dealId}:role:${contact.id}`} label={copy.roleForLabel(contactName(contact))} value={contact.role ?? ""} onDirtyChange={onDirtyChange} onSave={async input => {
        const role = input.trim(); if (role.length > 80) throw new RecordFieldError("Role must be at most 80 characters.", "roleTooLong");
        const saved = await api.deals.updateContactRole(dealId, contact.id, { role: role || null }); invalidate(RECORD_INVALIDATIONS); return saved.role ?? "";
      }} />
    </div>) : <p className="text-muted-foreground text-xs">{copy.noContactsAttached}</p>}
    {editable && <Button size="sm" variant="outline-ghost" onClick={() => setAttach(true)}>{copy.attachExistingContact}</Button>}
    <SheetFormDialog open={attach} onOpenChange={setAttach} title={copy.attachDialogTitle} description={copy.attachDialogDescription} editorKey={`deal:${dealId}:attach`} onDirtyChange={onDirtyChange}>
      {register => <AttachContactForm dealId={dealId} attachedIds={contacts.map(contact => contact.id)} onSaved={() => setAttach(false)} onDirtyChange={register} />}
    </SheetFormDialog>
    <Dialog open={!!detach} onOpenChange={open => { if (!pending && !open) setDetach(null); }}><DialogContent className="gap-3 sm:max-w-md"><DialogTitle>{copy.detachContactTitle}</DialogTitle><DialogDescription>{copy.detachContactDescription}</DialogDescription>
      {error && <p role="alert" className="text-destructive text-xs">{error}</p>}<div className="flex justify-end gap-2"><Button data-dialog-close variant="outline" disabled={pending} onClick={() => setDetach(null)}>{dictionary.common.cancel}</Button><Button disabled={pending} onClick={async () => {
        if (!detach || busy.current) return; busy.current = true; setPending(true); setError("");
        try { await api.deals.detachContact(dealId, detach); if (store.isCurrent(generation)) { invalidate(RECORD_INVALIDATIONS); if (mounted.current) setDetach(null); } }
        catch (failure) { if (mounted.current && store.isCurrent(generation)) setError(propertyFailureMessage(failure, dictionary)); }
        finally { busy.current = false; if (mounted.current && store.isCurrent(generation)) setPending(false); }
      }}>{pending ? copy.detaching : copy.detachContact}</Button></div>
    </DialogContent></Dialog>
  </DetailSheetSection>;
}
