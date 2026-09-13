import { and, asc, eq, getTableColumns, isNull, sql } from "drizzle-orm";
import { z } from "zod/v3";
import type { Database } from "@/lib/db";
import { companies, contacts, deals, fieldDefinitions, fieldOptions, fieldValues } from "@/lib/db/schema";
import { FIELD_ENTITIES, FIELD_TYPES, type FieldEntity, type FieldType } from "@/lib/db/schema/constants";
import { ServiceError, requireRecord, translateDatabaseError } from "@/lib/utils/service-error";
import { dateTime, decimalString, identifier, requiredText } from "@/lib/utils/validation";
import { reorderFieldsInput } from "@/lib/server/field-api-inputs";

const position = z.number().int().min(0).max(2147483646);
const optionInput = z.object({ label: requiredText, position: position.optional() }).strict();
export const createOptionInput = optionInput;
export const updateOptionInput = optionInput.partial().extend({ archived: z.boolean().optional() }).strict();
const replacementOption = optionInput.extend({ id: identifier.optional() });
const fieldProperties = z.object({
  label: requiredText,
  type: z.enum(FIELD_TYPES),
  agentFilled: z.boolean().optional(),
  agentBrief: z.string().trim().max(100000).nullable().optional(),
  required: z.boolean().optional(),
  showOnSheet: z.boolean().optional(),
  showOnTable: z.boolean().optional(),
  showOnFilter: z.boolean().optional(),
  position: position.optional(),
}).strict();
export const createFieldInput = fieldProperties.extend({
  entity: z.enum(FIELD_ENTITIES),
  key: z.string().trim().regex(/^[a-z][a-z0-9_]*$/).max(200).optional(),
  options: z.array(optionInput).max(100).optional(),
}).strict();
export const updateFieldInput = fieldProperties.partial().extend({ options: z.array(replacementOption).max(100).optional() }).strict();
export type CreateFieldInput = z.infer<typeof createFieldInput>;
export type UpdateFieldInput = z.infer<typeof updateFieldInput>;
export type CreateOptionInput = z.infer<typeof createOptionInput>;
export type UpdateOptionInput = z.infer<typeof updateOptionInput>;

type Definition = typeof fieldDefinitions.$inferSelect;
type Option = typeof fieldOptions.$inferSelect;
const targets = { COMPANY: companies, CONTACT: contacts, DEAL: deals } as const;
const targetColumns = { COMPANY: fieldValues.companyId, CONTACT: fieldValues.contactId, DEAL: fieldValues.dealId } as const;
const valueColumns = { TEXT: "text", LONG_TEXT: "text", NUMBER: "number", DATE: "date", CHECKBOX: "bool", SELECT: "optionId", URL: "text", EMAIL: "text", PHONE: "text", USER: "userId" } as const;

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new ServiceError(400, result.error.issues.map(issue => issue.message).join("; "));
  return result.data;
}

export class FieldService {
  constructor(private readonly db: Database) {}

  async listDefinitions(entity: FieldEntity, includeArchived = false) {
    entity = parse(z.enum(FIELD_ENTITIES), entity);
    parse(z.boolean(), includeArchived);
    const rows = await this.db.select().from(fieldDefinitions).where(and(eq(fieldDefinitions.entity, entity), includeArchived ? undefined : isNull(fieldDefinitions.archivedAt))).orderBy(asc(fieldDefinitions.position), asc(fieldDefinitions.id));
    if (!rows.length) return [];
    const options = await this.db.select(getTableColumns(fieldOptions)).from(fieldOptions).innerJoin(fieldDefinitions, eq(fieldOptions.fieldId, fieldDefinitions.id)).where(and(eq(fieldDefinitions.entity, entity), includeArchived ? undefined : isNull(fieldDefinitions.archivedAt), isNull(fieldOptions.archivedAt))).orderBy(asc(fieldOptions.position), asc(fieldOptions.id));
    return rows.map(row => ({ ...row, options: row.type === "SELECT" ? options.filter(option => option.fieldId === row.id) : [] }));
  }

  async getDefinition(id: string) {
    id = parse(identifier, id);
    const [record] = await this.db.select().from(fieldDefinitions).where(eq(fieldDefinitions.id, id));
    const definition = requireRecord(record, "Field");
    const options = definition.type === "SELECT" ? await this.optionsFor(id, false) : [];
    return { ...definition, options };
  }

  async reorder(input: unknown) {
    const { entity, ids } = parse(reorderFieldsInput, input);
    if (new Set(ids).size !== ids.length) throw new ServiceError(400, "A field may appear only once");
    // JSON keeps even large permutations below D1's bound-parameter limit.
    const encodedIds = JSON.stringify(ids);
    const requested = await this.db.select({ entity: fieldDefinitions.entity }).from(fieldDefinitions)
      .where(sql`${fieldDefinitions.id} in (select value from json_each(${encodedIds}))`);
    if (requested.some(field => field.entity !== entity)) throw new ServiceError(400, "A field does not belong to this entity");
    const active = and(eq(fieldDefinitions.entity, entity), isNull(fieldDefinitions.archivedAt));
    // Membership is checked again inside the atomic write. Neither create nor
    // archive can interleave between this guard and position assignment.
    const completeSet = sql`(select count(*) from field_definitions where entity = ${entity} and archived_at is null) = ${ids.length}
      and not exists (select 1 from json_each(${encodedIds}) requested
        where not exists (select 1 from field_definitions where id = requested.value and entity = ${entity} and archived_at is null))`;
    const [updated, counts] = await this.db.batch([
      this.db.update(fieldDefinitions).set({
        position: sql`(select cast(key as integer) from json_each(${encodedIds}) where value = ${fieldDefinitions.id})`,
        updatedAt: new Date().toISOString(),
      }).where(and(active, completeSet)).returning({ id: fieldDefinitions.id }),
      this.db.select({ count: sql<number>`count(*)` }).from(fieldDefinitions).where(active),
    ]);
    // The count read shares the transaction, including the empty permutation.
    if (updated.length !== ids.length || counts[0].count !== ids.length) throw new ServiceError(409, "Active fields changed; reload before reordering");
    return this.listDefinitions(entity);
  }

  async createDefinition(input: unknown) {
    const { options = [], key: suppliedKey, ...data } = parse(createFieldInput, input);
    const derivedKey = data.label.trim().toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^([0-9])/, "f_$1").slice(0, 60);
    const reservedKeys = new Set(["id", "createdat", "updatedat", "fields", "owner", "ownerid", "new"]);
    const key = suppliedKey ?? (reservedKeys.has(derivedKey) ? `${derivedKey}_field` : derivedKey);
    if (!key || !/^[a-z][a-z0-9_]*$/.test(key) || key.length > 200) throw new ServiceError(400, "The label does not produce a usable field key");
    if (data.type === "SELECT" && !options.length) throw new ServiceError(400, "A select field needs at least one option");
    if (data.type !== "SELECT" && options.length) throw new ServiceError(400, "Only select fields accept options");
    const id = crypto.randomUUID();
    const insert = this.db.insert(fieldDefinitions).values({ ...data, id, key, position: data.position ?? sql`(select coalesce(max(position), -1) + 1 from field_definitions where entity = ${data.entity})` });
    try {
      if (options.length) {
        const rows = options.map((option, index) => ({ ...option, fieldId: id, position: option.position ?? index }));
        const inserts = [];
        // Keep each statement below D1's bound-parameter limit.
        for (let offset = 0; offset < rows.length; offset += 15) {
          inserts.push(this.db.insert(fieldOptions).values(rows.slice(offset, offset + 15)));
        }
        await this.db.batch([insert, ...inserts]);
      } else await insert;
    } catch (error) {
      translateDatabaseError(error, "A field with that key already exists for this entity");
    }
    return this.getDefinition(id);
  }

  async updateDefinition(id: string, input: unknown) {
    id = parse(identifier, id);
    const { options, ...data } = parse(updateFieldInput, input);
    const existing = await this.getDefinition(id);
    const type = data.type ?? existing.type;
    if (options && type !== "SELECT") throw new ServiceError(400, "Only select fields accept options");
    if (type === "SELECT" && !(options ?? existing.options).length) throw new ServiceError(400, "A select field needs at least one option");
    if (options) {
      const ids = options.flatMap(option => option.id ? [option.id] : []);
      if (new Set(ids).size !== ids.length) throw new ServiceError(400, "An option may appear only once");
      const owned = await this.optionsFor(id, true);
      if (ids.some(optionId => !owned.some(option => option.id === optionId))) throw new ServiceError(400, "An option does not belong to this field");
    }
    const changedType = type !== existing.type;
    const guard = and(eq(fieldDefinitions.id, id), eq(fieldDefinitions.type, existing.type), changedType ? sql`not exists (select 1 from field_values where field_id = ${id})` : undefined);
    const updatedAt = new Date().toISOString();
    const update = this.db.update(fieldDefinitions).set({ ...data, updatedAt }).where(guard).returning();
    if (!options) {
      const [updated] = await update;
      if (!updated) throw new ServiceError(409, "Field type changed concurrently or already holds values");
    } else {
      // The definition changes last. This precondition remains stable throughout
      // the atomic batch, so a stale type cannot mutate options before failing.
      const applied = sql`exists (select 1 from field_definitions where id = ${id} and type = ${existing.type} ${changedType ? sql`and not exists (select 1 from field_values where field_id = ${id})` : sql``})`;
      const archive = this.db.update(fieldOptions).set({ archivedAt: updatedAt }).where(and(eq(fieldOptions.fieldId, id), isNull(fieldOptions.archivedAt), applied));
      const writes = options.map((option, index) => option.id
        ? this.db.update(fieldOptions).set({ label: option.label, position: option.position ?? index, archivedAt: null }).where(and(eq(fieldOptions.fieldId, id), eq(fieldOptions.id, option.id), applied))
        : this.db.insert(fieldOptions).select(this.db.select({ id: sql<string>`${crypto.randomUUID()}`.as("id"), fieldId: sql<string>`${id}`.as("field_id"), label: sql<string>`${option.label}`.as("label"), position: sql<number>`${option.position ?? index}`.as("position"), archivedAt: sql<string | null>`null`.as("archived_at") }).from(fieldDefinitions).where(and(eq(fieldDefinitions.id, id), applied))));
      const results = await this.db.batch([archive, ...writes, update]);
      const updated = results[results.length - 1] as Definition[];
      if (!updated.length) throw new ServiceError(409, "Field type changed concurrently or already holds values");
    }
    return this.getDefinition(id);
  }

  async archiveDefinition(id: string) { return this.setArchived(id, true); }
  async restoreDefinition(id: string) { return this.setArchived(id, false); }

  private async setArchived(id: string, archived: boolean) {
    id = parse(identifier, id);
    const [row] = await this.db.update(fieldDefinitions).set({ archivedAt: archived ? new Date().toISOString() : null }).where(eq(fieldDefinitions.id, id)).returning();
    requireRecord(row, "Field");
    return this.getDefinition(id);
  }

  async listOptions(fieldId: string, includeArchived = false) {
    fieldId = parse(identifier, fieldId);
    parse(z.boolean(), includeArchived);
    const definition = await this.getDefinition(fieldId);
    return definition.type === "SELECT" ? this.optionsFor(fieldId, includeArchived) : [];
  }

  private optionsFor(fieldId: string, includeArchived: boolean): Promise<Option[]> {
    return this.db.select().from(fieldOptions).where(and(eq(fieldOptions.fieldId, fieldId), includeArchived ? undefined : isNull(fieldOptions.archivedAt))).orderBy(asc(fieldOptions.position), asc(fieldOptions.id));
  }

  async createOption(fieldId: string, input: unknown) {
    const data = parse(createOptionInput, input);
    const definition = await this.activeSelect(fieldId);
    const id = crypto.randomUUID();
    const rows = await this.db.insert(fieldOptions).select(this.db.select({ id: sql<string>`${id}`.as("id"), fieldId: sql<string>`${definition.id}`.as("field_id"), label: sql<string>`${data.label}`.as("label"), position: data.position === undefined ? sql<number>`(select coalesce(max(position), -1) + 1 from field_options where field_id = ${definition.id})`.as("position") : sql<number>`${data.position}`.as("position"), archivedAt: sql<string | null>`null`.as("archived_at") }).from(fieldDefinitions).where(and(eq(fieldDefinitions.id, definition.id), eq(fieldDefinitions.type, "SELECT"), isNull(fieldDefinitions.archivedAt)))).returning();
    if (!rows.length) throw new ServiceError(409, "Field changed while creating the option");
    return rows[0];
  }

  async updateOption(fieldId: string, optionId: string, input: unknown) {
    const data = parse(updateOptionInput, input);
    optionId = parse(identifier, optionId);
    const definition = await this.activeSelect(fieldId);
    const [option] = await this.db.select().from(fieldOptions).where(and(eq(fieldOptions.fieldId, definition.id), eq(fieldOptions.id, optionId)));
    requireRecord(option, "Field option");
    const { archived, ...changes } = data;
    if (archived !== undefined) Object.assign(changes, { archivedAt: archived ? new Date().toISOString() : null });
    if (!Object.keys(changes).length) return option;
    const [updated] = await this.db.update(fieldOptions).set(changes).where(and(eq(fieldOptions.id, optionId), eq(fieldOptions.fieldId, definition.id), sql`exists (select 1 from field_definitions where id = ${definition.id} and type = 'SELECT' and archived_at is null)`)).returning();
    if (!updated) throw new ServiceError(409, "Field changed while updating the option");
    return updated;
  }

  private async activeSelect(id: string) {
    const definition = await this.getDefinition(id);
    if (definition.archivedAt || definition.type !== "SELECT") throw new ServiceError(400, "Options require an active select field");
    return definition;
  }

  private async target(entityType: FieldEntity, entityId: string) {
    const entity = parse(z.enum(FIELD_ENTITIES), entityType);
    const id = parse(identifier, entityId);
    const table = targets[entity];
    const [row] = await this.db.select({ id: table.id }).from(table).where(eq(table.id, id));
    requireRecord(row, "Target record");
    return { entity, id, column: targetColumns[entity] };
  }

  async getValues(entityType: FieldEntity, entityId: string) {
    const target = await this.target(entityType, entityId);
    const definitions = await this.listDefinitions(target.entity);
    const values = await this.db.select().from(fieldValues).where(eq(target.column, target.id));
    const selectedOptions = await this.db.select(getTableColumns(fieldOptions)).from(fieldOptions).innerJoin(fieldValues, eq(fieldValues.optionId, fieldOptions.id)).where(eq(target.column, target.id));
    return definitions.map(definition => {
      const row = values.find(value => value.fieldId === definition.id);
      const value = row?.[valueColumns[definition.type]] ?? null;
      const retired = selectedOptions.find(option => option.fieldId === definition.id && option.id === value && option.archivedAt);
      return { ...definition, options: retired ? [...definition.options, retired].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)) : definition.options, value };
    });
  }

  async upsertValue(fieldId: string, entityType: FieldEntity, entityId: string, input: unknown, expectedType?: FieldType) {
    expectedType = parse(z.enum(FIELD_TYPES).optional(), expectedType);
    const definition = await this.getDefinition(fieldId);
    if (expectedType !== undefined && definition.type !== expectedType) throw new ServiceError(409, "Field type changed; reload the field before saving");
    const target = await this.target(entityType, entityId);
    if (definition.archivedAt || definition.entity !== target.entity) throw new ServiceError(400, "The active field must match the target entity");
    const value = this.parseValue(definition, input);
    const definitionGuard = sql`exists (select 1 from field_definitions where id = ${definition.id} and entity = ${target.entity} and type = ${definition.type} ${expectedType === undefined ? sql`` : sql`and type = ${expectedType}`} and archived_at is null ${value === null ? sql`and required = 0` : sql``})`;
    if (value === null) {
      const [, valid] = await this.db.batch([this.db.delete(fieldValues).where(and(eq(fieldValues.fieldId, definition.id), eq(target.column, target.id), definitionGuard)), this.db.select({ id: fieldDefinitions.id }).from(fieldDefinitions).where(and(eq(fieldDefinitions.id, definition.id), definitionGuard))]);
      if (!valid.length) throw new ServiceError(409, "Field changed while clearing the value");
      return { fieldId: definition.id, entityType: target.entity, entityId: target.id, value: null };
    }
    if (definition.type === "SELECT" && !definition.options.some(option => option.id === value)) throw new ServiceError(400, "Select an active option belonging to this field");
    const columns = { text: null, number: null, date: null, bool: null, optionId: null, userId: null } as Record<string, string | boolean | null>;
    columns[valueColumns[definition.type]] = value;
    const targetName = sql.identifier(target.column.name);
    const optionGuard = definition.type === "SELECT" ? sql`and exists (select 1 from field_options where id = ${value} and field_id = ${definition.id} and archived_at is null)` : sql``;
    const rows = await this.db.all<{ id: string }>(sql`insert into field_values (id, field_id, ${targetName}, text, number, date, bool, option_id, user_id, updated_at)
      select ${crypto.randomUUID()}, ${definition.id}, ${target.id}, ${columns.text}, ${columns.number}, ${columns.date}, ${columns.bool === null ? null : columns.bool ? 1 : 0}, ${columns.optionId}, ${columns.userId}, ${new Date().toISOString()}
      where ${definitionGuard} ${optionGuard} and exists (select 1 from ${targets[target.entity]} where ${targets[target.entity].id} = ${target.id})
      on conflict (field_id, ${targetName}) do update set company_id = excluded.company_id, contact_id = excluded.contact_id, deal_id = excluded.deal_id, text = excluded.text, number = excluded.number, date = excluded.date, bool = excluded.bool, option_id = excluded.option_id, user_id = excluded.user_id, updated_at = excluded.updated_at
      returning id`);
    if (!rows.length) throw new ServiceError(409, "Field or option changed while storing the value");
    return { fieldId: definition.id, entityType: target.entity, entityId: target.id, value };
  }

  private parseValue(definition: Definition, input: unknown): string | boolean | null {
    if (input === null || (typeof input === "string" && !input.trim())) {
      if (definition.required) throw new ServiceError(400, "A required field cannot be cleared");
      return null;
    }
    const schemas: Record<FieldType, z.ZodType<string | boolean>> = {
      TEXT: z.string().trim().max(100000), LONG_TEXT: z.string().trim().max(100000), NUMBER: decimalString,
      DATE: dateTime, CHECKBOX: z.boolean(), SELECT: identifier, USER: identifier,
      URL: z.string().url().max(100000).refine(value => /^https?:\/\//i.test(value), "Expected an HTTP or HTTPS URL"), EMAIL: z.string().email().max(1000), PHONE: z.string().trim().min(1).max(1000),
    };
    return parse(schemas[definition.type], input);
  }
}
