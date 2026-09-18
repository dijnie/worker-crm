import type { DataTableColumn } from "@/components/ui/data-table";
import type { FieldDefinition } from "@/lib/field-form-values";
import type { RecordListRow } from "../data-table/record-list";
import { FieldValueDisplay } from "./field-value-display";

export function fieldColumns(
  definitions: readonly FieldDefinition[],
  directory: readonly { id: string; name: string }[],
  directoryStatus?: string,
): DataTableColumn<RecordListRow>[] {
  return definitions
    .filter((field) => !field.archivedAt && field.showOnTable)
    .map((definition) => ({
      id: `field:${definition.key}`,
      header: definition.label,
      cell: (row: RecordListRow) => (
        <FieldValueDisplay
          definition={definition}
          value={row.fields?.[definition.key] ?? null}
          userLabel={
            directoryStatus
              ? `${directoryStatus} (${row.fields?.[definition.key]})`
              : directory.find(
                  (user) => user.id === row.fields?.[definition.key],
                )?.name
          }
        />
      ),
    }));
}
