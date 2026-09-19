import type { FieldDefinition } from "@/lib/field-form-values";
import { fields, type FieldsDictionary } from "@/lib/i18n/dictionaries/fields";
import { RECORD_FACETS, type RecordEntity } from "@/lib/record-list-contracts";

/** The words these helpers need; defaults keep today's English wording. */
export interface FieldFacetCopy {
  retiredSuffix: string;
  unavailableOption: (value: string) => string;
  unavailableUser: (value: string) => string;
}
export function fieldFacetCopy(copy: FieldsDictionary): FieldFacetCopy {
  return { retiredSuffix: copy.valueDisplay.retiredSuffix, unavailableUser: copy.valueDisplay.unavailableUser, unavailableOption: copy.facet.unavailableOption };
}
const ENGLISH_FIELD_FACET_COPY = fieldFacetCopy(fields.en);

export function fieldFacetDefinitions(definitions: readonly FieldDefinition[]) {
  return definitions.filter(field => !field.archivedAt && field.showOnFilter && (field.type === "SELECT" || field.type === "USER"));
}
export function supportedFieldFilter(entity: RecordEntity, key: string, definitions: readonly FieldDefinition[]) {
  return (RECORD_FACETS[entity] as readonly string[]).includes(key) || fieldFacetDefinitions(definitions).some(field => key === `field:${field.key}`);
}
// `copy` is optional so `record-list.tsx` (owned by another area) can keep
// calling these without a dictionary; they then render the English defaults.
export function fieldFilterLabel(key: string, definitions: readonly FieldDefinition[], copy: FieldFacetCopy = ENGLISH_FIELD_FACET_COPY) {
  const definition = definitions.find(field => key === `field:${field.key}`);
  return definition ? `${definition.label}${definition.archivedAt ? copy.retiredSuffix : ""}` : key;
}
export function fieldFilterValues(key: string, values: readonly string[], definitions: readonly FieldDefinition[], directory: readonly { id: string; name: string }[], directoryStatus?: string, copy: FieldFacetCopy = ENGLISH_FIELD_FACET_COPY) {
  const definition = definitions.find(field => key === `field:${field.key}`);
  return values.map(value => {
    if (definition?.type === "SELECT") {
      const option = definition.options.find(option => option.id === value);
      return option ? `${option.label}${option.archivedAt ? copy.retiredSuffix : ""}` : copy.unavailableOption(value);
    }
    if (definition?.type === "USER") return directoryStatus ? `${directoryStatus} (${value})` : directory.find(user => user.id === value)?.name ?? copy.unavailableUser(value);
    return value;
  }).join(", ");
}
