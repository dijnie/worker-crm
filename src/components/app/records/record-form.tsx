"use client";
import { canPermission } from "@/lib/auth/permissions";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { DirtyEditor } from "../record-sheet/inline-field";
import { ApiError } from "@/lib/api";
import { errorMessage, issueMessage } from "@/lib/i18n/error-message";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAppData } from "../app-data-provider";
import { useDictionary } from "../i18n-provider";
import { RecordPicker } from "./record-picker";
import {
  buildCreateInput,
  COMPANY_FIELDS,
  CONTACT_FIELDS,
  DEAL_FIELDS,
  RECORD_INVALIDATIONS,
  RecordFieldError,
  recordEntityKey,
  type RecordDraft,
  type RecordEntity,
} from "./form-values";
export function RecordForm({
  entity,
  defaults = {},
  onCreated,
  onCancel,
  onPendingChange,
  onDirtyChange,
}: {
  entity: RecordEntity;
  defaults?: RecordDraft;
  onCreated: (record: { id: string }) => void;
  onCancel: () => void;
  onPendingChange?: (pending: boolean) => void;
  onDirtyChange?: (state: DirtyEditor | null) => void;
}) {
  const { api, account, invalidate, generation, store } = useAppData();
  const dictionary = useDictionary();
  const { form: copy, properties: labels } = dictionary.recordSheet;
  const permitted = canPermission(account, entity, "create") && (entity !== "deal" || canPermission(account, "company", "read"));
  const prefix = useId();
  const [draft, setDraft] = useState<RecordDraft>(() => ({
    ...(entity === "deal" ? { currency: "USD", ownerId: account.id } : {}),
    ...defaults,
  }));
  const initialDraft = useRef(draft);
  const formRef = useRef<HTMLFormElement>(null);
  const saveFlight = useRef<Promise<boolean> | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const observedGeneration = useRef(generation);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (observedGeneration.current === generation) return;
    observedGeneration.current = generation;
    setDraft(entity === "deal" ? { currency: "USD", ownerId: account.id } : {});
    setPending(false);
    setError(null);
    onPendingChange?.(false);
  }, [generation]);
  const fields =
    entity === "company"
      ? COMPANY_FIELDS
      : entity === "contact"
        ? CONTACT_FIELDS
        : DEAL_FIELDS;
  const change = (key: string, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));
  function submit(event: FormEvent) { event.preventDefault(); void save(); }
  function save(): Promise<boolean> {
    if (saveFlight.current) return saveFlight.current;
    if (!formRef.current?.reportValidity()) return Promise.resolve(false);
    saveFlight.current = performSave().finally(() => { saveFlight.current = null; });
    return saveFlight.current;
  }
  async function performSave(): Promise<boolean> {
    if (submitting.current) return false;
    submitting.current = true;
    setPending(true);
    onPendingChange?.(true);
    setError(null);
    try {
      const result =
        entity === "company"
          ? await api.companies.create(buildCreateInput("company", draft))
          : entity === "contact"
            ? await api.contacts.create(buildCreateInput("contact", draft))
            : await api.deals.create(buildCreateInput("deal", draft));
      if (mounted.current && store.isCurrent(generation)) {
        invalidate(RECORD_INVALIDATIONS);
        onCreated(result);
        return true;
      }
      return false;
    } catch (error) {
      if (mounted.current && store.isCurrent(generation))
        setError(
          error instanceof Error
            ? error
            : new Error(copy.createFailed),
        );
      return false;
    } finally {
      submitting.current = false;
      if (mounted.current && store.isCurrent(generation)) {
        setPending(false);
        onPendingChange?.(false);
      }
    }
  }
  const latestSave = useRef(save); latestSave.current = save;
  const dirty = JSON.stringify(draft) !== JSON.stringify(initialDraft.current) || pending;
  useEffect(() => {
    onDirtyChange?.(dirty ? { dirty: true, pending, save: () => latestSave.current(), discard: () => { setDraft(initialDraft.current); setError(null); } } : null);
    return () => onDirtyChange?.(null);
  }, [dirty, pending, onDirtyChange]);
  const issues = error instanceof ApiError ? (error.issues ?? []) : [];
  const unplaced = issues.filter((issue) => !(fields as readonly string[]).includes(String(issue.path[0] ?? "")));
  const issuesFor = (key: string) => issues.filter((issue) => String(issue.path[0] ?? "") === key);
  if (!permitted) return <p role="alert" className="text-xs">{copy.permissionDenied}</p>;
  return (
    <form ref={formRef} onSubmit={submit} className="space-y-5">
      <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2">
        {fields.map((key) => {
          if (key === "companyId" && !canPermission(account, "company", "read") || key === "primaryContactId" && !canPermission(account, "contact", "read")) return null;
          if (
            key === "ownerId" ||
            key === "companyId" ||
            key === "primaryContactId"
          )
            return (
              <RecordPicker
                key={key}
                kind={
                  key === "ownerId"
                    ? "owner"
                    : key === "companyId"
                      ? "company"
                      : "contact"
                }
                label={
                  key === "ownerId"
                    ? dictionary.recordSheet.sheet.ownerLabel
                    : key === "companyId"
                      ? dictionary.crm.entities.COMPANY.singular
                      : labels.primaryContactId
                }
                value={draft[key] ?? ""}
                onChange={(value) => change(key, value)}
                required={entity === "deal"}
                disabled={pending}
                selectedLabel={
                  key === "ownerId" && draft[key] === account.id
                    ? account.name
                    : undefined
                }
              />
            );
          const required =
            key === "name" || key === "firstName" || key === "currency";
          const fieldIssues = issuesFor(key);
          return (
            <Field
              key={key}
              data-invalid={fieldIssues.length > 0 || undefined}
              className={
                key === "description" ? "sm:col-span-2" : undefined
              }
            >
              <FieldLabel htmlFor={`${prefix}-${key}`}>
                {labels[key]}
                {required ? " *" : ""}
              </FieldLabel>
              {key === "description" ? (
                <Textarea
                  id={`${prefix}-${key}`}
                  value={draft[key] ?? ""}
                  onChange={(event) => change(key, event.target.value)}
                />
              ) : (
                <Input
                  id={`${prefix}-${key}`}
                  type={
                    key === "email"
                      ? "email"
                      : key === "expectedCloseDate"
                        ? "date"
                        : "text"
                  }
                  inputMode={key === "amount" ? "decimal" : undefined}
                  maxLength={
                    key === "currency"
                      ? 3
                      : key === "name" || key === "firstName"
                        ? 1000
                        : undefined
                  }
                  required={required}
                  value={draft[key] ?? ""}
                  onChange={(event) => change(key, event.target.value)}
                />
              )}
              <FieldError errors={fieldIssues.map((issue) => ({ message: issueMessage(issue, dictionary) }))} />
            </Field>
          );
        })}
      </fieldset>
      {entity === "deal" && (
        <p className="text-muted-foreground text-xs">
          {copy.dealHint(dictionary.crm.stages.DEMO_BOOKED)}
        </p>
      )}
      {entity === "company" && (
        <p className="text-muted-foreground text-xs">
          {copy.companyHint}
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="space-y-1 rounded-md border border-destructive/30 p-3 text-destructive text-xs"
        >
          <p>{error instanceof ApiError ? errorMessage(error, dictionary) : error instanceof RecordFieldError ? dictionary.recordSheet.validation[error.reason] : error.message}</p>
          {unplaced.map((issue, index) => (
            <p key={index}>
              {issue.path.join(".")}: {issueMessage(issue, dictionary)}
            </p>
          ))}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={pending}
        >
          {dictionary.common.cancel}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? dictionary.common.saving : copy.addEntity(dictionary.crm.entities[recordEntityKey(entity)].lower)}
        </Button>
      </div>
    </form>
  );
}
export function CreateRecordDialog({
  entity,
  open,
  onOpenChange,
  defaults,
}: {
  entity: RecordEntity;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaults?: RecordDraft;
}) {
  const [pending, setPending] = useState(false);
  const dictionary = useDictionary();
  const entityLower = dictionary.crm.entities[recordEntityKey(entity)].lower;
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!pending) onOpenChange(value);
      }}
    >
      <DialogContent className="max-h-[90vh] gap-4 overflow-y-auto sm:max-w-2xl">
        <DialogTitle>{dictionary.recordSheet.form.newEntity(entityLower)}</DialogTitle>
        <DialogDescription>{dictionary.recordSheet.form.createDescription(entityLower)}</DialogDescription>
        {open && (
          <RecordForm
            entity={entity}
            defaults={defaults}
            onPendingChange={setPending}
            onCreated={() => onOpenChange(false)}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
