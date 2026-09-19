import { and, eq } from "drizzle-orm";
import { z } from "zod/v3";
import type { Database } from "@/lib/db";
import { dealContacts, deals, contacts } from "@/lib/db/schema";
import { identifier } from "@/lib/utils/validation";
import { requireRecord, ServiceError, translateDatabaseError } from "@/lib/utils/service-error";

const role = z.string().trim().max(80).transform(value => value || null).nullable();
export const attachDealContactInput = z.object({ contactId: identifier, role: role.optional() }).strict();
export const updateDealContactRoleInput = z.object({ role }).strict();
export type AttachDealContactInput = z.input<typeof attachDealContactInput>;
export type UpdateDealContactRoleInput = z.input<typeof updateDealContactRoleInput>;

export class DealContactService {
  constructor(private readonly db: Database) {}

  private async requireDeal(id: string) {
    requireRecord(await this.db.query.deals.findFirst({ where: eq(deals.id, id), columns: { id: true } }), "Deal");
  }

  async attach(dealId: string, input: unknown) {
    dealId = identifier.parse(dealId);
    const data = attachDealContactInput.parse(input);
    await this.requireDeal(dealId);
    if (!await this.db.query.contacts.findFirst({ where: eq(contacts.id, data.contactId), columns: { id: true } })) {
      throw new ServiceError(400, "Referenced contact does not exist", "CONTACT_MISSING");
    }
    try {
      const [link] = await this.db.insert(dealContacts).values({ dealId, contactId: data.contactId, role: data.role ?? null }).returning();
      return link;
    } catch (error) { translateDatabaseError(error, "Contact is already attached to this deal", "DEAL_CONTACT_ATTACHED"); }
  }

  async updateRole(dealId: string, contactId: string, input: unknown) {
    dealId = identifier.parse(dealId);
    contactId = identifier.parse(contactId);
    const data = updateDealContactRoleInput.parse(input);
    await this.requireDeal(dealId);
    const [link] = await this.db.update(dealContacts).set(data)
      .where(and(eq(dealContacts.dealId, dealId), eq(dealContacts.contactId, contactId))).returning();
    return requireRecord(link, "Deal contact");
  }

  async detach(dealId: string, contactId: string) {
    dealId = identifier.parse(dealId);
    contactId = identifier.parse(contactId);
    await this.requireDeal(dealId);
    const [link] = await this.db.delete(dealContacts)
      .where(and(eq(dealContacts.dealId, dealId), eq(dealContacts.contactId, contactId))).returning();
    return requireRecord(link, "Deal contact");
  }
}
