"use client";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAppData } from "../app-data-provider";
import { RecordPicker } from "./record-picker";
import {
  buildCreateInput,
  COMPANY_FIELDS,
  CONTACT_FIELDS,
  DEAL_FIELDS,
  RECORD_INVALIDATIONS,
  type RecordDraft,
  type RecordEntity,
} from "./form-values";
const labels: Record<string, string> = {
  name: "Name",
  firstName: "First name",
  lastName: "Last name",
  domain: "Domain",
  website: "Website",
  description: "Description",
  industry: "Industry",
  city: "City",
  stateCode: "State / region",
  country: "Country",
  phone: "Phone",
  email: "Email",
  linkedinUrl: "LinkedIn URL",
  twitterUrl: "Twitter URL",
  githubUrl: "GitHub URL",
  title: "Title",
  amount: "Amount",
  currency: "Currency",
  expectedCloseDate: "Expected close date",
};
export function RecordForm({
  entity,
  defaults = {},
  onCreated,
  onCancel,
  onPendingChange,
}: {
  entity: RecordEntity;
  defaults?: RecordDraft;
  onCreated: (record: { id: string }) => void;
  onCancel: () => void;
  onPendingChange?: (pending: boolean) => void;
}) {
  const { api, account, invalidate, generation, store } = useAppData();
  const prefix = useId();
  const [draft, setDraft] = useState<RecordDraft>(() => ({
    ...(entity === "deal" ? { currency: "USD", ownerId: account.id } : {}),
    ...defaults,
  }));
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
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
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
      }
    } catch (error) {
      if (mounted.current && store.isCurrent(generation))
        setError(
          error instanceof Error
            ? error
            : new Error("Could not create the record."),
        );
    } finally {
      submitting.current = false;
      if (mounted.current && store.isCurrent(generation)) {
        setPending(false);
        onPendingChange?.(false);
      }
    }
  }
  return (
    <form onSubmit={submit} className="space-y-5">
      <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2">
        {fields.map((key) => {
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
                    ? "Owner"
                    : key === "companyId"
                      ? "Company"
                      : "Primary contact"
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
          return (
            <div
              key={key}
              className={
                key === "description" ? "space-y-2 sm:col-span-2" : "space-y-2"
              }
            >
              <label
                className="text-sm font-medium"
                htmlFor={`${prefix}-${key}`}
              >
                {labels[key]}
                {required ? " *" : ""}
              </label>
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
            </div>
          );
        })}
      </fieldset>
      {entity === "deal" && (
        <p className="text-xs text-muted-foreground">
          New deals start at Demo booked. Amounts are stored exactly in the
          selected currency.
        </p>
      )}
      {entity === "company" && (
        <p className="text-xs text-muted-foreground">
          Choosing a primary contact leaves their employer unchanged. Domains
          and email addresses are normalized when saved.
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="space-y-1 rounded-md border border-destructive/30 p-3 text-sm text-destructive"
        >
          <p>{error.message}</p>
          {error instanceof ApiError &&
            error.issues?.map((issue, index) => (
              <p key={index}>
                {issue.path.join(".")}: {issue.message}
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
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : `Add ${entity}`}
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
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!pending) onOpenChange(value);
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogTitle>New {entity}</DialogTitle>
        <DialogDescription>Add a {entity} to your workspace.</DialogDescription>
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
