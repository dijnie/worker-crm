"use client";
import { canPermission } from "@/lib/auth/permissions";
import type { ReactNode } from "react";
import { DetailSheetSection } from "../detail-sheet";
import { CustomFieldsPanel } from "../fields/custom-fields-panel";
import { useAppData } from "../app-data-provider";
import { useDictionary, useFormat } from "../i18n-provider";
import { RECORD_INVALIDATIONS, type RecordEntity } from "../records/form-values";
import { InlineField, type DirtyChange } from "./inline-field";
import { fieldsFor, parseProperty, safePropertyHref } from "./property-values";
import type { RecordRef } from "./record-navigation";

export interface PropertyExtensionContext { record: RecordRef; onDirtyChange: DirtyChange }
export interface SheetProps { id: string; onOpen: (record: RecordRef) => void; onDirtyChange: DirtyChange }
const metadata: Record<RecordEntity, string[]> = {
  company: ["source", "enrichmentStatus", "enrichmentError", "enrichedAt", "logoUrl", "logoDarkUrl", "iconUrl", "iconDarkUrl", "iconTone", "brandColor", "subIndustry", "countryCode", "twitterUrl", "githubUrl", "pricingUrl", "careersUrl"],
  contact: ["source", "seniority", "function", "imageUrl", "socialsCheckedAt", "enrichmentStatus", "enrichmentError", "enrichedAt"],
  deal: ["stageChangedAt", "closedAt", "closedReason", "baseAmount", "baseCurrency", "fxRate", "fxRateAt"],
};
const SYSTEM_KEYS = ["id", "createdAt", "updatedAt", "lastActivityAt", "archivedAt"] as const;
export function PropertyPanel({ entity, record, onDirtyChange, relationLabels = {}, renderCustomFields }: {
  entity: RecordEntity; record: { id: string; [key: string]: unknown }; onDirtyChange: DirtyChange;
  relationLabels?: Record<string, string>; renderCustomFields?: (context: PropertyExtensionContext) => ReactNode;
}) {
  const { api, invalidate, account } = useAppData();
  const dictionary = useDictionary();
  const format = useFormat();
  const { properties, systemFields, propertyPanel: copy, common } = dictionary.recordSheet;
  const canReadActivity = (["company", "contact", "deal", "activity"] as const).every(kind => canPermission(account, kind, "read"));
  const systemKeys = [...SYSTEM_KEYS.filter(key => key !== "lastActivityAt" || canReadActivity), ...metadata[entity]];
  return <>
    <DetailSheetSection title={copy.sectionTitle} aria-label={copy.sectionAria}>
      {fieldsFor(entity).map(field => {
        const stored = typeof record[field] === "string" ? record[field] as string : "";
        const value = field === "expectedCloseDate" ? stored.slice(0, 10) : stored;
        const href = /Url$/.test(field) || field === "website" ? safePropertyHref(stored) : undefined;
        const picker = field === "ownerId" ? "owner" : field === "companyId" ? "company" : field === "primaryContactId" ? "contact" : undefined;
        if (picker && picker !== "owner" && !canPermission(account, picker, "read")) return null;
        const currency = typeof record.currency === "string" ? record.currency : "";
        const display = picker && value
          ? relationLabels[field] ?? common.unavailableHistorical(value)
          : href
            ? <a href={href} target="_blank" rel="noopener noreferrer" className="underline">{stored}</a>
            : field === "amount" && value
              ? (currency ? format.money(value, currency) : format.decimal(value))
              : field === "expectedCloseDate" && value
                ? format.day(new Date(`${value}T00:00:00Z`))
                : undefined;
        const label = field === "companyId" ? dictionary.crm.entities.COMPANY.singular : properties[field];
        return <InlineField readOnly={!canPermission(account, entity, "update")} key={field} fieldKey={`${entity}:${record.id}:${field}`} label={label} value={value} display={display}
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
    </DetailSheetSection>
    <CustomFieldsPanel record={{ kind: entity, id: record.id }} onDirtyChange={onDirtyChange} />
    {renderCustomFields?.({ record: { kind: entity, id: record.id }, onDirtyChange })}
    <DetailSheetSection>
      <details>
        <summary className="cursor-pointer font-medium text-muted-foreground text-xs uppercase tracking-wider">{copy.systemInfo}</summary>
        <dl className="mt-3 space-y-2">
          {systemKeys.map(key => {
            const value = record[key];
            const text = value == null || value === "" ? common.notSet : typeof value === "string" ? value : JSON.stringify(value);
            const href = /Url$/.test(key) ? safePropertyHref(text) : undefined;
            return <div key={key} className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2"><dt className="truncate text-muted-foreground text-xs/5">{systemFields[key]}</dt><dd className="min-w-0 break-words whitespace-pre-wrap text-xs/5">{href ? <a href={href} target="_blank" rel="noopener noreferrer" className="underline">{text}</a> : text}</dd></div>;
          })}
        </dl>
      </details>
    </DetailSheetSection>
  </>;
}
