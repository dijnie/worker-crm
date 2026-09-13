import { listRecords, recordFacets } from "./record-list-query";
import { recordListInput } from "@/lib/record-list-contracts";
import { eq } from "drizzle-orm";
import { z } from "zod/v3";
import type { Database } from "@/lib/db";
import { companies, contacts, type CompanySelect } from "@/lib/db/schema";
import { serializeDeal } from "@/lib/utils/money";
import { requireRecord, ServiceError, translateDatabaseError } from "@/lib/utils/service-error";
import { identifier, nullableId, optionalText, requiredText } from "@/lib/utils/validation";

const domainInput = z.string().trim().max(2048).transform((value, context) => {
  if (!value) return null;
  const normalized = value.toLowerCase();
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(normalized) ? normalized : `https://${normalized}`);
    const domain = url.hostname.replace(/^www\./, "");
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) return domain;
  } catch {
    // Invalid URLs receive the same validation message as invalid hostnames.
  }
  context.addIssue({ code: z.ZodIssueCode.custom, message: "Expected a valid company domain" });
  return z.NEVER;
}).nullable().optional();

const emailInput = optionalText
  .pipe(z.string().email().nullable().optional())
  .transform(value => value?.toLowerCase() ?? value);

export const createCompanyInput = z.object({
  name: requiredText,
  domain: domainInput,
  website: optionalText,
  description: optionalText,
  industry: optionalText,
  city: optionalText,
  stateCode: optionalText,
  country: optionalText,
  phone: optionalText,
  email: emailInput,
  linkedinUrl: optionalText,
  ownerId: nullableId,
  primaryContactId: nullableId,
}).strict();

export const updateCompanyInput = createCompanyInput.partial().strict();
export type CreateCompanyInput = z.input<typeof createCompanyInput>;
export type UpdateCompanyInput = z.input<typeof updateCompanyInput>;

export const companyListInput = recordListInput("company");

export class CompanyService {
  constructor(private readonly db: Database) {}

  async list(input: unknown = {}) {
    return listRecords(this.db, "company", input);
  }

  async facets(input: unknown = {}) {
    return recordFacets(this.db, "company", input);
  }

  async getById(input: unknown) {
    const id = identifier.parse(input);
    const company = requireRecord(await this.db.query.companies.findFirst({
      where: eq(companies.id, id),
      with: {
        primaryContact: true,
        contacts: { orderBy: (table, { desc }) => [desc(table.createdAt), desc(table.id)] },
        deals: { orderBy: (table, { desc }) => [desc(table.createdAt), desc(table.id)] },
        activities: { orderBy: (table, { desc }) => [desc(table.createdAt), desc(table.id)], limit: 20 },
        fieldValues: { with: { field: true, option: true } },
      },
    }), "Company");
    return { ...company, deals: company.deals.map(serializeDeal) };
  }

  async create(input: unknown): Promise<CompanySelect> {
    const data = createCompanyInput.parse(input);
    await this.checkPrimaryContact(data.primaryContactId);
    try {
      const [company] = await this.db.insert(companies).values({
        ...data,
        website: data.website === undefined ? (data.domain ? `https://${data.domain}` : null) : data.website,
      }).returning();
      return requireRecord(company, "Company");
    } catch (error) {
      translateDatabaseError(error, "Another company already uses that domain or primary contact");
    }
  }

  async update(inputId: unknown, input: unknown): Promise<CompanySelect> {
    const id = identifier.parse(inputId);
    const data = updateCompanyInput.parse(input);
    const current = await this.findRecord(id);
    await this.checkPrimaryContact(data.primaryContactId);
    if (!Object.values(data).some(value => value !== undefined)) return current;
    const domainChanged = data.domain !== undefined && data.domain !== current.domain;
    try {
      const [company] = await this.db.update(companies).set({
        ...data,
        ...(domainChanged ? {
          enrichmentStatus: "PENDING" as const,
          enrichmentError: null,
          iconUrl: null,
          iconDarkUrl: null,
          iconTone: null,
        } : {}),
      }).where(eq(companies.id, id)).returning();
      return requireRecord(company, "Company");
    } catch (error) {
      translateDatabaseError(error, "Another company already uses that domain or primary contact");
    }
  }

  async archive(input: unknown): Promise<CompanySelect> {
    const id = identifier.parse(input);
    const current = await this.findRecord(id);
    if (current.archivedAt !== null) return current;
    const [company] = await this.db.update(companies).set({ archivedAt: new Date().toISOString() })
      .where(eq(companies.id, id)).returning();
    return requireRecord(company, "Company");
  }

  async restore(input: unknown): Promise<CompanySelect> {
    const id = identifier.parse(input);
    const current = await this.findRecord(id);
    if (current.archivedAt === null) return current;
    try {
      const [company] = await this.db.update(companies).set({ archivedAt: null })
        .where(eq(companies.id, id)).returning();
      return requireRecord(company, "Company");
    } catch (error) {
      translateDatabaseError(error, "Another active company already uses that domain");
    }
  }

  private async findRecord(id: string): Promise<CompanySelect> {
    return requireRecord(await this.db.query.companies.findFirst({ where: eq(companies.id, id) }), "Company");
  }

  private async checkPrimaryContact(id: string | null | undefined): Promise<void> {
    if (id == null) return;
    const contact = await this.db.query.contacts.findFirst({ where: eq(contacts.id, id), columns: { id: true } });
    if (!contact) throw new ServiceError(400, "Primary contact does not exist");
  }
}
