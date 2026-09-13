import { listRecords, recordFacets } from "./record-list-query";
import { recordListInput } from "@/lib/record-list-contracts";
import { eq } from "drizzle-orm";
import { z } from "zod/v3";
import type { Database } from "@/lib/db";
import { companies, contacts, type ContactSelect } from "@/lib/db/schema";
import { serializeDeal } from "@/lib/utils/money";
import { requireRecord, ServiceError, translateDatabaseError } from "@/lib/utils/service-error";
import { identifier, nullableId, optionalText, requiredText } from "@/lib/utils/validation";

const emailInput = optionalText
  .pipe(z.string().email().nullable().optional())
  .transform(value => value?.toLowerCase() ?? value);

export const createContactInput = z.object({
  firstName: requiredText,
  lastName: optionalText,
  email: emailInput,
  phone: optionalText,
  title: optionalText,
  linkedinUrl: optionalText,
  twitterUrl: optionalText,
  githubUrl: optionalText,
  companyId: nullableId,
  ownerId: nullableId,
}).strict();

export const updateContactInput = createContactInput.partial().strict();
export type CreateContactInput = z.input<typeof createContactInput>;
export type UpdateContactInput = z.input<typeof updateContactInput>;

export const contactListInput = recordListInput("contact");

export class ContactService {
  constructor(private readonly db: Database) {}

  async list(input: unknown = {}) {
    return listRecords(this.db, "contact", input);
  }

  async facets(input: unknown = {}) {
    return recordFacets(this.db, "contact", input);
  }

  async getById(input: unknown) {
    const id = identifier.parse(input);
    const contact = requireRecord(await this.db.query.contacts.findFirst({
      where: eq(contacts.id, id),
      with: {
        company: true,
        primaryOf: true,
        deals: { with: { deal: true } },
        activities: { orderBy: (table, { desc }) => [desc(table.createdAt), desc(table.id)], limit: 20 },
        fieldValues: { with: { field: true, option: true } },
      },
    }), "Contact");
    const deals = contact.deals.map(({ deal, role }) => ({ ...serializeDeal(deal), role }))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id));
    return { ...contact, deals };
  }

  async create(input: unknown): Promise<ContactSelect> {
    const data = createContactInput.parse(input);
    await this.checkCompany(data.companyId);
    try {
      const [contact] = await this.db.insert(contacts).values(data).returning();
      return requireRecord(contact, "Contact");
    } catch (error) {
      translateDatabaseError(error, "Another active contact already uses that email address");
    }
  }

  async update(inputId: unknown, input: unknown): Promise<ContactSelect> {
    const id = identifier.parse(inputId);
    const data = updateContactInput.parse(input);
    const current = await this.findRecord(id);
    await this.checkCompany(data.companyId);
    if (!Object.values(data).some(value => value !== undefined)) return current;
    try {
      const [contact] = await this.db.update(contacts).set(data).where(eq(contacts.id, id)).returning();
      return requireRecord(contact, "Contact");
    } catch (error) {
      translateDatabaseError(error, "Another active contact already uses that email address");
    }
  }

  async archive(input: unknown): Promise<ContactSelect> {
    const id = identifier.parse(input);
    const current = await this.findRecord(id);
    if (current.archivedAt !== null) return current;
    const [contact] = await this.db.update(contacts).set({ archivedAt: new Date().toISOString() })
      .where(eq(contacts.id, id)).returning();
    return requireRecord(contact, "Contact");
  }

  async restore(input: unknown): Promise<ContactSelect> {
    const id = identifier.parse(input);
    const current = await this.findRecord(id);
    if (current.archivedAt === null) return current;
    try {
      const [contact] = await this.db.update(contacts).set({ archivedAt: null })
        .where(eq(contacts.id, id)).returning();
      return requireRecord(contact, "Contact");
    } catch (error) {
      translateDatabaseError(error, "Another active contact already uses that email address");
    }
  }

  private async findRecord(id: string): Promise<ContactSelect> {
    return requireRecord(await this.db.query.contacts.findFirst({ where: eq(contacts.id, id) }), "Contact");
  }

  private async checkCompany(id: string | null | undefined): Promise<void> {
    if (id == null) return;
    const company = await this.db.query.companies.findFirst({ where: eq(companies.id, id), columns: { id: true } });
    if (!company) throw new ServiceError(400, "Company does not exist");
  }
}
