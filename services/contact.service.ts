import { and, count, desc, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/lib/db";
import { companies, contacts, type ContactSelect } from "@/lib/db/schema";
import { serializeDeal } from "@/lib/utils/money";
import { requireRecord, ServiceError, translateDatabaseError } from "@/lib/utils/service-error";
import { escapeLike, identifier, listInput, nullableId, optionalText, requiredText, type Page } from "@/lib/utils/validation";

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

export const contactListInput = listInput.extend({ companyId: identifier.optional() });

export class ContactService {
  constructor(private readonly db: Database) {}

  async list(input: unknown = {}): Promise<Page<ContactSelect>> {
    const { page, limit, search, archived, companyId } = contactListInput.parse(input);
    const pattern = search ? `%${escapeLike(search)}%` : undefined;
    const where = and(
      archived ? isNotNull(contacts.archivedAt) : isNull(contacts.archivedAt),
      companyId === undefined ? undefined : eq(contacts.companyId, companyId),
      pattern === undefined ? undefined : or(
        sql`${contacts.firstName} LIKE ${pattern} ESCAPE '\\'`,
        sql`${contacts.lastName} LIKE ${pattern} ESCAPE '\\'`,
        sql`${contacts.email} LIKE ${pattern} ESCAPE '\\'`,
      ),
    );
    const [items, [total]] = await Promise.all([
      this.db.select().from(contacts).where(where)
        .orderBy(desc(contacts.createdAt), desc(contacts.id)).limit(limit).offset((page - 1) * limit),
      this.db.select({ value: count() }).from(contacts).where(where),
    ]);
    return { items, total: total.value, page, limit };
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
