import { and, eq, isNull, sql, type SQL } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { companies, contacts, deals, fieldDefinitions, fieldOptions, fieldValues, singletonMembership, user, type FieldDefinitionSelect } from "@/lib/db/schema";
import { isCustomFieldFacet, type FacetOption, type RecordEntity, type RecordFields, type RecordFieldValue } from "@/lib/record-list-contracts";
import { ServiceError } from "@/lib/utils/service-error";
import { escapeLike } from "@/lib/utils/validation";

const tables = { company: companies, contact: contacts, deal: deals };
const targetColumns = { company: fieldValues.companyId, contact: fieldValues.contactId, deal: fieldValues.dealId };
const fieldEntity = (entity: RecordEntity) => entity.toUpperCase() as "COMPANY" | "CONTACT" | "DEAL";

/** Validate current definition metadata, including empty selections, before running a list or saving a view. */
export async function validateCustomFieldFilters(db: Database, entity: RecordEntity, filters: Record<string, string[]> = {}, facet?: string, includeAll = false) {
  const keys = [...new Set([...Object.keys(filters), ...(facet ? [facet] : [])].filter(isCustomFieldFacet))];
  if (!keys.length && !includeAll) return [];
  const definitions = await db.select().from(fieldDefinitions).where(and(
    eq(fieldDefinitions.entity, fieldEntity(entity)), isNull(fieldDefinitions.archivedAt),
    eq(fieldDefinitions.showOnFilter, true), sql`${fieldDefinitions.type} IN ('SELECT', 'USER')`,
  )).orderBy(fieldDefinitions.position, fieldDefinitions.id);
  for (const key of keys) {
    if (!definitions.some(definition => `field:${definition.key}` === key)) {
      throw new ServiceError(400, `Custom filter ${key} is unavailable. Repair or remove this filter.`);
    }
  }
  // Retired options remain valid filter identities; foreign or nonexistent options do not.
  const selections = definitions.flatMap(definition => definition.type === "SELECT"
    ? (filters[`field:${definition.key}`] ?? []).map(id => ({ fieldId: definition.id, id })) : []);
  if (selections.length) {
    const invalid = await db.all<{ id: string }>(sql`SELECT json_extract(selection.value, '$.id') AS id
      FROM json_each(${JSON.stringify(selections)}) selection WHERE NOT EXISTS (
        SELECT 1 FROM ${fieldOptions} WHERE ${fieldOptions.id} = json_extract(selection.value, '$.id')
        AND ${fieldOptions.fieldId} = json_extract(selection.value, '$.fieldId')) LIMIT 1`);
    if (invalid.length) throw new ServiceError(400, "A custom filter option is unavailable. Repair or remove this filter.");
  }
  return definitions;
}

/** One JSON binding covers every custom selection, independently of filter/option count. */
export function customFieldPredicate(entity: RecordEntity, filters: Record<string, string[]>, omitFacet?: string): SQL | undefined {
  const selected = Object.fromEntries(Object.entries(filters).filter(([key, values]) => isCustomFieldFacet(key) && key !== omitFacet && values.length));
  if (!Object.keys(selected).length) return undefined;
  return sql`NOT EXISTS (SELECT 1 FROM json_each(${JSON.stringify(selected)}) selected_filter WHERE NOT EXISTS (
    SELECT 1 FROM ${fieldValues} INNER JOIN ${fieldDefinitions} ON ${fieldDefinitions.id} = ${fieldValues.fieldId}
    WHERE ${targetColumns[entity]} = ${tables[entity].id} AND 'field:' || ${fieldDefinitions.key} = selected_filter.key
    AND ${fieldDefinitions.entity} = ${fieldEntity(entity)} AND ${fieldDefinitions.archivedAt} IS NULL
    AND ${fieldDefinitions.showOnFilter} = 1 AND ${fieldDefinitions.type} IN ('SELECT', 'USER')
    AND CASE ${fieldDefinitions.type} WHEN 'SELECT' THEN ${fieldValues.optionId} ELSE ${fieldValues.userId} END
      IN (SELECT value FROM json_each(selected_filter.value))))`;
}

export async function projectRecordFields<R extends { id: string }>(db: Database, entity: RecordEntity, rows: R[]): Promise<(R & RecordFields)[]> {
  if (!rows.length) return rows;
  const definitions = await db.select().from(fieldDefinitions).where(and(eq(fieldDefinitions.entity, fieldEntity(entity)),
    isNull(fieldDefinitions.archivedAt), eq(fieldDefinitions.showOnTable, true))).orderBy(fieldDefinitions.position, fieldDefinitions.id);
  const projected = rows.map(row => ({ ...row, fields: Object.fromEntries(definitions.map(field => [field.key, null])) as Record<string, RecordFieldValue> }));
  if (!definitions.length) return projected;
  const values = await db.select().from(fieldValues).where(and(
    sql`${targetColumns[entity]} IN (SELECT value FROM json_each(${JSON.stringify(rows.map(row => row.id))}))`,
    sql`${fieldValues.fieldId} IN (SELECT value FROM json_each(${JSON.stringify(definitions.map(field => field.id))}))`,
  ));
  const records = new Map(projected.map(row => [row.id, row]));
  const fields = new Map(definitions.map(field => [field.id, field]));
  for (const value of values) {
    const definition = fields.get(value.fieldId)!;
    const id = value[entity === "company" ? "companyId" : entity === "contact" ? "contactId" : "dealId"];
    const record = id ? records.get(id) : undefined;
    if (record) record.fields[definition.key] = definition.type === "NUMBER" ? value.number : definition.type === "DATE" ? value.date
      : definition.type === "CHECKBOX" ? value.bool : definition.type === "SELECT" ? value.optionId : definition.type === "USER" ? value.userId : value.text;
  }
  return projected;
}

export async function customFieldFacet(db: Database, entity: RecordEntity, definition: FieldDefinitionSelect, where: SQL,
  selected: string[], search: string | undefined, page: number, limit: number) {
  const column = definition.type === "SELECT" ? fieldValues.optionId : fieldValues.userId;
  const value = sql`(SELECT ${column} FROM ${fieldValues} WHERE ${fieldValues.fieldId} = ${definition.id} AND ${targetColumns[entity]} = ${tables[entity].id})`;
  const labelFor = (id: SQL) => definition.type === "SELECT"
    ? sql`coalesce((SELECT ${fieldOptions.label} || CASE WHEN ${fieldOptions.archivedAt} IS NULL THEN '' ELSE ' (retired)' END FROM ${fieldOptions} WHERE ${fieldOptions.id} = ${id} AND ${fieldOptions.fieldId} = ${definition.id}), 'Unavailable option')`
    : sql`coalesce((SELECT ${user.name} FROM ${user} INNER JOIN ${singletonMembership} ON ${singletonMembership.userId} = ${user.id} WHERE ${user.id} = ${id} AND ${user.emailVerified} = 1 AND ${singletonMembership.status} = 'active'), 'Unavailable / former user')`;
  const label = labelFor(value);
  const pattern = search ? `%${escapeLike(search)}%` : undefined;
  const optionWhere = and(where, sql`${value} IS NOT NULL`, pattern ? sql`(${label} LIKE ${pattern} ESCAPE '\\' OR ${value} LIKE ${pattern} ESCAPE '\\')` : undefined);
  const [options, totals, chosen, retained] = await Promise.all([
    db.all<FacetOption>(sql`SELECT ${value} AS value, ${label} AS label, count(*) AS count FROM ${tables[entity]} WHERE ${optionWhere} GROUP BY ${value} ORDER BY ${label} COLLATE NOCASE ASC, ${value} ASC LIMIT ${limit} OFFSET ${(page - 1) * limit}`),
    db.all<{ total: number }>(sql`SELECT count(DISTINCT ${value}) AS total FROM ${tables[entity]} WHERE ${optionWhere}`),
    selected.length ? db.all<FacetOption>(sql`SELECT ${value} AS value, ${label} AS label, count(*) AS count FROM ${tables[entity]} WHERE ${and(where, sql`${value} IN (SELECT value FROM json_each(${JSON.stringify(selected)}))`)} GROUP BY ${value}`) : [],
    selected.length ? db.all<{ value: string; label: string }>(sql`SELECT selection.value AS value, ${labelFor(sql`selection.value`)} AS label FROM json_each(${JSON.stringify(selected)}) selection`) : [],
  ]);
  for (const item of retained) if (!options.some(option => option.value === item.value)) options.push(chosen.find(option => option.value === item.value) ?? { ...item, count: 0 });
  return { options, pagination: { total: totals[0].total, page, limit } };
}
