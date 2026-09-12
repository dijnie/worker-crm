import { sql, type SQL } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { activities, companies, contacts, deals } from "@/lib/db/schema";

export type ActivityTarget = {
  companyId?: string | SQL | null;
  contactId?: string | SQL | null;
  dealId?: string | SQL | null;
};

export class ActivityStampService {
  constructor(private readonly db: Database) {}

  touchStatements(target: ActivityTarget, at: string, guard: SQL = sql`1`) {
    const targets = [
      { table: companies, id: target.companyId },
      { table: contacts, id: target.contactId },
      { table: deals, id: target.dealId },
    ];
    return targets.filter(({ id }) => id != null).map(({ table, id }) =>
      this.db.update(table).set({ lastActivityAt: at, updatedAt: table.updatedAt })
        .where(sql`${table.id} = ${id} AND (${guard})
        AND (${table.lastActivityAt} IS NULL OR julianday(${table.lastActivityAt}) < julianday(${at}))`),
    );
  }

  recomputeStatements(target: ActivityTarget) {
    const targets = [
      { table: companies, id: target.companyId, column: activities.companyId },
      { table: contacts, id: target.contactId, column: activities.contactId },
      { table: deals, id: target.dealId, column: activities.dealId },
    ];
    return targets.filter(({ id }) => id != null).map(({ table, id, column }) =>
      this.db.update(table).set({ lastActivityAt: sql`(
        SELECT ${activities.createdAt} FROM ${activities}
        WHERE ${column} = ${table.id}
        ORDER BY julianday(${activities.createdAt}) DESC, ${activities.id} DESC LIMIT 1
      )`, updatedAt: table.updatedAt }).where(sql`${table.id} = ${id}`),
    );
  }

  async touch(target: ActivityTarget, at: string) {
    const [first, ...rest] = this.touchStatements(target, at);
    if (first) await this.db.batch([first, ...rest]);
  }

  async recompute(target: ActivityTarget) {
    const [first, ...rest] = this.recomputeStatements(target);
    if (first) await this.db.batch([first, ...rest]);
  }
}
