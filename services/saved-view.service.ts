import { validateCustomFieldFilters } from "./field-list-query";
import { and, eq, or, sql } from "drizzle-orm";
import { z } from "zod/v3";
import type { Database } from "@/lib/db";
import { savedViews } from "@/lib/db/schema";
import { FIELD_ENTITIES } from "@/lib/db/schema/constants";
import { recordListInput } from "@/lib/record-list-contracts";
import { identifier } from "@/lib/utils/validation";
import { requireRecord, translateDatabaseError } from "@/lib/utils/service-error";
import { canReadQuery, requireQueryRead } from "@/lib/server/read-access";

export const savedViewFiltersInput = z.object({
  q: z.string().trim().max(1000).optional(), sort: z.string().max(100).optional(),
  dir: z.enum(["asc", "desc"]).optional(), archived: z.boolean().optional(),
  filters: z.record(z.string().refine(key => key !== "__proto__", "Unsupported facet"), z.array(z.string().min(1).max(1000)).max(50)).optional(),
}).strict().refine(value => JSON.stringify(value).length <= 32768, "Saved configuration is too large");
export const savedViewListInput = z.object({ entity: z.enum(FIELD_ENTITIES) }).strict();
export const createSavedViewInput = savedViewListInput.extend({
  name: z.string().trim().min(1).max(100), shared: z.boolean().default(false), filters: savedViewFiltersInput,
}).strict();
export const updateSavedViewInput = createSavedViewInput.pick({ name: true, shared: true, filters: true }).partial().strict();
export type SavedViewFilters = z.input<typeof savedViewFiltersInput>;
export type CreateSavedViewInput = z.input<typeof createSavedViewInput>;
export type UpdateSavedViewInput = z.input<typeof updateSavedViewInput>;
export type SavedView = Omit<typeof savedViews.$inferSelect, "filters"> & { filters: SavedViewFilters; mine: boolean };
async function validateFilters(db: Database, entity: typeof FIELD_ENTITIES[number], filters: SavedViewFilters) {
  const query = recordListInput(entity.toLowerCase() as "company" | "contact" | "deal").parse({
    search: filters.q, sort: filters.sort, dir: filters.dir, archived: filters.archived, filters: filters.filters,
  });
  requireQueryRead(db, query);
  await validateCustomFieldFilters(db, entity.toLowerCase() as "company" | "contact" | "deal", query.filters);
  return filters;
}
export class SavedViewService {
  constructor(private readonly db: Database) {}
  async list(actorId: string, input: unknown): Promise<SavedView[]> {
    const { entity } = savedViewListInput.parse(input);
    const rows = await this.db.select().from(savedViews).where(and(eq(savedViews.entity, entity),
      or(eq(savedViews.ownerId, identifier.parse(actorId)), eq(savedViews.shared, true))))
      .orderBy(sql`${savedViews.name} collate nocase asc`, savedViews.id);
    return rows.filter(row => canReadQuery(this.db, row.filters as SavedViewFilters))
      .map(row => ({ ...row, filters: row.filters as SavedViewFilters, mine: row.ownerId === actorId }));
  }
  async create(actorId: string, input: unknown): Promise<SavedView> {
    const data = createSavedViewInput.parse(input);
    await validateFilters(this.db, data.entity, data.filters);
    try {
      const [row] = await this.db.insert(savedViews).values({ ...data, ownerId: identifier.parse(actorId) }).returning();
      return { ...row, filters: row.filters as SavedViewFilters, mine: true };
    } catch (error) { translateDatabaseError(error, "A view with this name already exists", "SAVED_VIEW_NAME_TAKEN"); }
  }
  async update(actorId: string, id: string, input: unknown): Promise<SavedView> {
    const data = updateSavedViewInput.parse(input);
    const where = and(eq(savedViews.id, identifier.parse(id)), eq(savedViews.ownerId, identifier.parse(actorId)));
    const [existing] = await this.db.select().from(savedViews).where(where);
    requireRecord(existing, "Saved view");
    requireQueryRead(this.db, data.filters ?? existing.filters as SavedViewFilters);
    if (data.filters) await validateFilters(this.db, existing.entity, data.filters);
    try {
      const [row] = await this.db.update(savedViews).set({ ...data, updatedAt: new Date().toISOString() }).where(where).returning();
      requireRecord(row, "Saved view");
      return { ...row, filters: row.filters as SavedViewFilters, mine: true };
    } catch (error) { translateDatabaseError(error, "A view with this name already exists", "SAVED_VIEW_NAME_TAKEN"); }
  }
  async delete(actorId: string, id: string): Promise<void> {
    const [row] = await this.db.delete(savedViews).where(and(eq(savedViews.id, identifier.parse(id)),
      eq(savedViews.ownerId, identifier.parse(actorId)))).returning({ id: savedViews.id });
    requireRecord(row, "Saved view");
  }
}
