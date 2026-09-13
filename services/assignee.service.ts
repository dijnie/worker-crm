import { and, count, eq, sql, asc } from "drizzle-orm";
import { z } from "zod/v3";
import type { Database } from "@/lib/db";
import { user, singletonMembership } from "@/lib/db/schema";
import { listInput, escapeLike, type Page } from "@/lib/utils/validation";

export const assigneeListInput = listInput.pick({ page: true, limit: true, search: true }).strict();
export type AssigneeListInput = z.input<typeof assigneeListInput>;
export interface Assignee { id: string; name: string; image: string | null }
export class AssigneeService {
  constructor(private readonly db: Database) {}
  async list(input: unknown = {}): Promise<Page<Assignee>> {
    const { page, limit, search } = assigneeListInput.parse(input);
    const where = and(eq(user.emailVerified, true), eq(singletonMembership.status, "active"),
      search ? sql`${user.name} like ${`%${escapeLike(search)}%`} escape '\\'` : undefined);
    const [items, [total]] = await this.db.batch([
      this.db.select({ id: user.id, name: user.name, image: user.image }).from(user)
        .innerJoin(singletonMembership, eq(user.id, singletonMembership.userId)).where(where)
        .orderBy(sql`${user.name} collate nocase asc`, asc(user.id)).limit(limit).offset((page - 1) * limit),
      this.db.select({ value: count() }).from(user).innerJoin(singletonMembership, eq(user.id, singletonMembership.userId)).where(where),
    ]);
    return { items, total: total.value, page, limit };
  }
}
