"use client";
import type { FieldEntity } from "@/lib/db/schema/constants";
import type { RecordEntity } from "@/lib/record-list-contracts";
import { useAppData, useAppQuery } from "../app-data-provider";

/** Load display metadata by definition, never by record or table row. */
export function useFieldDefinitions(entity: RecordEntity) {
  const { api } = useAppData();
  return useAppQuery("fields", { entity, placement: true }, async signal => {
    const definitions = await api.fields.list(entity.toUpperCase() as FieldEntity, true, { signal });
    return Promise.all(definitions.map(async definition => definition.type === "SELECT" && !definition.archivedAt && (definition.showOnTable || definition.showOnFilter)
      ? { ...definition, options: await api.fields.options(definition.id, true, { signal }) }
      : definition));
  });
}
