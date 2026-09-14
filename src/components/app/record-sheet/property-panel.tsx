"use client";
import { canPermission } from "@/lib/auth/permissions";
import type { ReactNode } from "react";
import { CustomFieldsPanel } from "../fields/custom-fields-panel";
import { useAppData } from "../app-data-provider";
import { RECORD_INVALIDATIONS, type RecordEntity } from "../records/form-values";
import { InlineField, type DirtyChange } from "./inline-field";
import { fieldsFor, parseProperty, propertyLabels, safePropertyHref } from "./property-values";
import type { RecordRef } from "./record-navigation";

export interface PropertyExtensionContext { record: RecordRef; onDirtyChange: DirtyChange }
export interface SheetProps { id: string; onOpen: (record: RecordRef) => void; onDirtyChange: DirtyChange }
const metadata: Record<RecordEntity, string[]> = {
  company: ["source", "enrichmentStatus", "enrichmentError", "enrichedAt", "logoUrl", "logoDarkUrl", "iconUrl", "iconDarkUrl", "iconTone", "brandColor", "subIndustry", "countryCode", "twitterUrl", "githubUrl", "pricingUrl", "careersUrl"],
  contact: ["source", "seniority", "function", "imageUrl", "socialsCheckedAt", "enrichmentStatus", "enrichmentError", "enrichedAt"],
  deal: ["stageChangedAt", "closedAt", "closedReason", "baseAmount", "baseCurrency", "fxRate", "fxRateAt"],
};
const metadataLabel = (key: string) => key.replace(/([A-Z])/g, " $1").replace(/^./, char => char.toUpperCase());
export function PropertyPanel({ entity, record, onDirtyChange, relationLabels = {}, renderCustomFields }: {
  entity: RecordEntity; record: { id: string; [key: string]: unknown }; onDirtyChange: DirtyChange;
  relationLabels?: Record<string, string>; renderCustomFields?: (context: PropertyExtensionContext) => ReactNode;
}) {
  const { api, invalidate, account } = useAppData();
  return <section aria-label="Record properties" className="min-w-0">
    <h3 className="font-semibold">Properties</h3>
    {fieldsFor(entity).map(field => {
      const stored = typeof record[field] === "string" ? record[field] as string : "";
      const value = field === "expectedCloseDate" ? stored.slice(0, 10) : stored;
      const href = /Url$/.test(field) || field === "website" ? safePropertyHref(stored) : undefined;
      const picker = field === "ownerId" ? "owner" : field === "companyId" ? "company" : field === "primaryContactId" ? "contact" : undefined;
      if (picker && picker !== "owner" && !canPermission(account, picker, "read")) return null;
      const display = picker && value ? relationLabels[field] ?? `Unavailable / historical (${value})` : href ? <a href={href} target="_blank" rel="noopener noreferrer" className="underline">{stored}</a> : undefined;
      return <InlineField readOnly={!canPermission(account, entity, "update")} key={field} fieldKey={`${entity}:${record.id}:${field}`} label={propertyLabels[field]} value={value} display={display}
        onDirtyChange={onDirtyChange} multiline={field === "description"} type={field === "expectedCloseDate" ? "date" : field === "email" ? "email" : "text"}
        picker={picker} required={entity === "deal" && !!picker} selectedLabel={relationLabels[field]} onSave={async input => {
          const parsed = parseProperty(entity, field, input);
          const patch = { [field]: parsed };
          const saved = entity === "company" ? await api.companies.update(record.id, patch) : entity === "contact" ? await api.contacts.update(record.id, patch) : await api.deals.update(record.id, patch);
          invalidate(RECORD_INVALIDATIONS);
          const result = (saved as Record<string, unknown>)[field];
          return typeof result === "string" ? field === "expectedCloseDate" ? result.slice(0, 10) : result : "";
        }} />;
    })}
    <CustomFieldsPanel record={{ kind: entity, id: record.id }} onDirtyChange={onDirtyChange} />
    {renderCustomFields?.({ record: { kind: entity, id: record.id }, onDirtyChange })}
    <details className="mt-5"><summary className="cursor-pointer text-sm font-medium">System information</summary><dl className="mt-3 space-y-3">
      {["id", "createdAt", "updatedAt", ...((["company", "contact", "deal", "activity"] as const).every(kind => canPermission(account, kind, "read")) ? ["lastActivityAt"] : []), "archivedAt", ...metadata[entity]].map(key => {
        const value = record[key];
        const text = value == null || value === "" ? "Not set" : typeof value === "string" ? value : JSON.stringify(value);
        const href = /Url$/.test(key) ? safePropertyHref(text) : undefined;
        return <div key={key}><dt className="text-xs text-muted-foreground">{metadataLabel(key)}</dt><dd className="break-words whitespace-pre-wrap text-sm">{href ? <a href={href} target="_blank" rel="noopener noreferrer" className="underline">{text}</a> : text}</dd></div>;
      })}
    </dl></details>
  </section>;
}
