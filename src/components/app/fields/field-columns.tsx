import type { FieldDefinition } from "@/lib/field-form-values";
import type { RecordColumnExtension } from "../data-table/record-list";
import { FieldValueDisplay } from "./field-value-display";

export function fieldColumns(definitions: readonly FieldDefinition[], directory: readonly { id: string; name: string }[], directoryStatus?: string): RecordColumnExtension[] {
  return definitions.filter(field => !field.archivedAt && field.showOnTable).map(definition => ({
    id: `field:${definition.key}`, label: definition.label,
    render: row => <FieldValueDisplay definition={definition} value={row.fields?.[definition.key] ?? null} userLabel={directoryStatus ? `${directoryStatus} (${row.fields?.[definition.key]})` : directory.find(user => user.id === row.fields?.[definition.key])?.name} />,
  }));
}
