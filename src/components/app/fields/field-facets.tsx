import type { FieldDefinition } from "@/lib/field-form-values";
import { RECORD_FACETS, type RecordEntity } from "@/lib/record-list-contracts";

export function fieldFacetDefinitions(definitions: readonly FieldDefinition[]) {
  return definitions.filter(field => !field.archivedAt && field.showOnFilter && (field.type === "SELECT" || field.type === "USER"));
}
export function supportedFieldFilter(entity: RecordEntity, key: string, definitions: readonly FieldDefinition[]) {
  return (RECORD_FACETS[entity] as readonly string[]).includes(key) || fieldFacetDefinitions(definitions).some(field => key === `field:${field.key}`);
}
export function fieldFilterLabel(key: string, definitions: readonly FieldDefinition[]) {
  const definition = definitions.find(field => key === `field:${field.key}`);
  return definition ? `${definition.label}${definition.archivedAt ? " (retired)" : ""}` : key;
}
export function fieldFilterValues(key: string, values: readonly string[], definitions: readonly FieldDefinition[], directory: readonly { id: string; name: string }[], directoryStatus?: string) {
  const definition = definitions.find(field => key === `field:${field.key}`);
  return values.map(value => {
    if (definition?.type === "SELECT") {
      const option = definition.options.find(option => option.id === value);
      return option ? `${option.label}${option.archivedAt ? " (retired)" : ""}` : `Unavailable option (${value})`;
    }
    if (definition?.type === "USER") return directoryStatus ? `${directoryStatus} (${value})` : directory.find(user => user.id === value)?.name ?? `Unavailable / historical (${value})`;
    return value;
  }).join(", ");
}
