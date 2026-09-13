import { and, count, eq, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { companies, contacts, deals, user, type CompanySelect, type ContactSelect, type DealSelect } from "@/lib/db/schema";
import { CLOSED_STAGES, CLOSING_WINDOWS, RECORD_FACETS, recordFacetInput, recordListInput, type FacetOption, type ParsedRecordListQuery, type RecordEntity, type RecordFacets, type RecordSummary } from "@/lib/record-list-contracts";
import { escapeLike, type Page } from "@/lib/utils/validation";

const tables = { company: companies, contact: contacts, deal: deals };
type Rows = { company: CompanySelect; contact: ContactSelect; deal: DealSelect };
const closed = sql`(${sql.join(CLOSED_STAGES.map(value => sql`${value}`), sql`, `)})`;
const openDealCount = sql<number>`(SELECT count(*) FROM deals related_deals WHERE related_deals.company_id = companies.id AND related_deals.archived_at IS NULL AND related_deals.stage NOT IN ${closed})`;
const contactCount = sql<number>`(SELECT count(*) FROM contacts related_contacts WHERE related_contacts.company_id = companies.id AND related_contacts.archived_at IS NULL)`;

function ownerName(entity: RecordEntity) {
  return sql`(SELECT ${user.name} FROM ${user} WHERE ${user.id} = ${tables[entity].ownerId})`;
}
function companyName(entity: "contact" | "deal") {
  return sql`(SELECT ${companies.name} FROM ${companies} WHERE ${companies.id} = ${tables[entity].companyId})`;
}
function closingPredicate(value: string, now: Date): SQL {
  const instant = now.toISOString();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
  const later = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 1)).toISOString();
  const date = sql`julianday(${deals.expectedCloseDate})`;
  if (value === "none") return isNull(deals.expectedCloseDate);
  if (value === "overdue") return sql`${date} < julianday(${instant}) AND ${deals.stage} NOT IN ${closed}`;
  if (value === "this-month") return sql`${date} >= julianday(${start}) AND ${date} < julianday(${next})`;
  if (value === "next-month") return sql`${date} >= julianday(${next}) AND ${date} < julianday(${later})`;
  return sql`${date} >= julianday(${later})`;
}
function facetValue(entity: RecordEntity, facet: string): SQL {
  const table = tables[entity];
  switch (facet) {
    case "owner": return sql`coalesce(${table.ownerId}, 'unassigned')`;
    case "company": return sql`coalesce(${contacts.companyId}, 'none')`;
    case "industry": return sql`${companies.industry}`;
    case "source": return entity === "company" ? sql`${companies.source}` : sql`${contacts.source}`;
    case "enrichment": return sql`${companies.enrichmentStatus}`;
    case "title": return sql`${contacts.title}`;
    case "seniority": return sql`${contacts.seniority}`;
    case "persona": return sql`${contacts.function}`;
    case "stage": return sql`${deals.stage}`;
    case "currency": return sql`${deals.currency}`;
    default: throw new Error("Facet must have a scalar value");
  }
}
function facetLabel(entity: RecordEntity, facet: string): SQL {
  if (facet === "owner") return sql`CASE WHEN ${tables[entity].ownerId} IS NULL THEN 'Unassigned' ELSE coalesce(${ownerName(entity)}, 'Historical / unknown owner') END`;
  if (facet === "company") return sql`CASE WHEN ${contacts.companyId} IS NULL THEN 'No company' ELSE coalesce(${companyName("contact")}, 'Historical / unknown company') END`;
  return facetValue(entity, facet);
}
function facetPredicate(entity: RecordEntity, facet: string, values: string[], now: Date): SQL | undefined {
  if (!values.length) return undefined;
  values = [...new Set(values)];
  if (facet === "activity") return or(...values.map(value => sql`julianday(${tables[entity].lastActivityAt}) >= julianday(${new Date(now.getTime() - Number(value) * 86400000).toISOString()}) AND julianday(${tables[entity].lastActivityAt}) <= julianday(${now.toISOString()})`));
  if (facet === "status") return or(...values.map(value => value === "all" ? sql`1 = 1` : value === "open" ? sql`${deals.stage} NOT IN ${closed}` : sql`${deals.stage} IN ${closed}`));
  if (facet === "closing") return or(...values.map(value => closingPredicate(value, now)));
  return sql`${facetValue(entity, facet)} IN (SELECT value FROM json_each(${JSON.stringify(values)}))`;
}

/** Lists and facets use identical predicates; only the enumerated facet is omitted. */
export function recordListWhere(entity: RecordEntity, query: ParsedRecordListQuery, now: Date, omitFacet?: string) {
  const table = tables[entity];
  const pattern = query.search ? `%${escapeLike(query.search)}%` : undefined;
  let search: SQL | undefined;
  if (pattern) {
    if (entity === "company") search = sql`(${companies.name} LIKE ${pattern} ESCAPE '\\' OR ${companies.domain} LIKE ${pattern} ESCAPE '\\')`;
    else if (entity === "contact") search = sql`(${contacts.firstName} LIKE ${pattern} ESCAPE '\\' OR ${contacts.lastName} LIKE ${pattern} ESCAPE '\\' OR trim(${contacts.firstName} || ' ' || coalesce(${contacts.lastName}, '')) LIKE ${pattern} ESCAPE '\\' OR ${contacts.email} LIKE ${pattern} ESCAPE '\\')`;
    else search = sql`(${deals.name} LIKE ${pattern} ESCAPE '\\' OR ${companyName("deal")} LIKE ${pattern} ESCAPE '\\')`;
  }
  return and(
    query.archived ? isNotNull(table.archivedAt) : isNull(table.archivedAt), search,
    query.companyId && entity !== "company" ? eq(tables[entity].companyId, query.companyId) : undefined,
    query.stage ? eq(deals.stage, query.stage) : undefined,
    query.currency ? eq(deals.currency, query.currency) : undefined,
    ...Object.entries(query.filters).filter(([key]) => key !== omitFacet).map(([key, values]) => facetPredicate(entity, key, values, now)),
  )!;
}
function ordering(entity: RecordEntity, query: ParsedRecordListQuery): SQL[] {
  const table = tables[entity];
  const direction = query.dir === "asc" ? sql`ASC` : sql`DESC`;
  let value: SQL;
  let text = true;
  switch (query.sort) {
    case "name": value = entity === "contact" ? sql`trim(${contacts.firstName} || ' ' || coalesce(${contacts.lastName}, ''))` : sql`${tables[entity].name}`; break;
    case "owner": value = sql`coalesce(${ownerName(entity)}, ${table.ownerId})`; break;
    case "company": value = companyName(entity as "contact" | "deal"); break;
    case "domain": value = sql`${companies.domain}`; break;
    case "industry": value = sql`${companies.industry}`; break;
    case "title": value = sql`${contacts.title}`; break;
    case "email": value = sql`${contacts.email}`; break;
    case "stage": value = sql`${deals.stage}`; break;
    case "contacts": value = contactCount; text = false; break;
    case "deals": value = openDealCount; text = false; break;
    case "amount": return [sql`${deals.amount} IS NULL ASC`, sql`${deals.currency} COLLATE NOCASE ${direction}`, sql`${deals.amount} ${direction}`, sql`${table.id} ${direction}`];
    default:
      value = sql`julianday(${query.sort === "lastActivity" ? table.lastActivityAt : query.sort === "archivedAt" ? table.archivedAt : query.sort === "expectedCloseDate" ? deals.expectedCloseDate : table.createdAt})`;
      text = false;
  }
  return [sql`${value} IS NULL ASC`, text ? sql`${value} COLLATE NOCASE ${direction}` : sql`${value} ${direction}`, sql`${table.id} ${direction}`];
}

export async function listRecords<E extends RecordEntity>(db: Database, entity: E, input: unknown = {}): Promise<Page<Rows[E] & RecordSummary>> {
  const query = recordListInput(entity).parse(input);
  const table = tables[entity];
  const where = recordListWhere(entity, query, new Date());
  const [items, totals] = await db.batch([
    db.select().from(table).where(where).orderBy(...ordering(entity, query)).limit(query.limit).offset((query.page - 1) * query.limit),
    db.select({ total: count() }).from(table).where(where),
  ]);
  const rows = items as unknown as (Rows[E] & RecordSummary)[];
  if (query.includeSummary && rows.length) {
    const ownerIds = [...new Set(rows.flatMap(row => row.ownerId ? [row.ownerId] : []))];
    const companyIds = entity === "company" ? [] : [...new Set((rows as (ContactSelect | DealSelect)[]).flatMap(row => row.companyId ? [row.companyId] : []))];
    const [owners, relatedCompanies, companyCounts] = await Promise.all([
      ownerIds.length ? db.select({ id: user.id, name: user.name, image: user.image }).from(user).where(inArray(user.id, ownerIds)) : [],
      companyIds.length ? db.select({ id: companies.id, name: companies.name, archivedAt: companies.archivedAt }).from(companies).where(inArray(companies.id, companyIds)) : [],
      entity === "company" ? db.select({ id: companies.id, contactCount, openDealCount }).from(companies).where(inArray(companies.id, rows.map(row => row.id))) : [],
    ]);
    const ownersById = new Map(owners.map(owner => [owner.id, owner]));
    const companiesById = new Map(relatedCompanies.map(company => [company.id, company]));
    const countsById = new Map(companyCounts.map(company => [company.id, company]));
    for (const row of rows) {
      row.owner = row.ownerId ? ownersById.get(row.ownerId) ?? { id: row.ownerId, name: "Historical / unknown owner", image: null } : null;
      if (entity === "company") {
        row.contactCount = countsById.get(row.id)?.contactCount ?? 0;
        row.openDealCount = countsById.get(row.id)?.openDealCount ?? 0;
      } else {
        const id = (row as ContactSelect | DealSelect).companyId;
        row.company = id ? companiesById.get(id) ?? { id, name: "Historical / unknown company", archivedAt: null } : null;
      }
    }
  }
  return { items: rows, total: totals[0].total, page: query.page, limit: query.limit };
}

export async function recordFacets(db: Database, entity: RecordEntity, input: unknown = {}): Promise<RecordFacets> {
  const query = recordFacetInput(entity).parse(input);
  const now = new Date();
  const result: RecordFacets = { facetCounts: {}, facetPages: {} };
  const keys = query.facet ? [query.facet] : RECORD_FACETS[entity];
  await Promise.all(keys.map(async facet => {
    const where = recordListWhere(entity, query, now, facet);
    const selected = [...new Set(query.filters[facet] ?? [])];
    const fixedValues = facet === "activity" ? ["7", "30", "90"] : facet === "status" ? ["all", "open", "closed"] : facet === "closing" ? [...CLOSING_WINDOWS] : undefined;
    let options: FacetOption[];
    let total: number;
    const page = query.facet ? query.facetPage : 1;
    if (fixedValues) {
      const all = await Promise.all(fixedValues.map(async value => {
        const [row] = await db.select({ count: count() }).from(tables[entity]).where(and(where, facetPredicate(entity, facet, [value], now)));
        return { value, label: value, count: row.count };
      }));
      const available = all.filter(option => option.count > 0 && (!query.facetSearch || option.label.toLowerCase().includes(query.facetSearch.toLowerCase())));
      total = available.length;
      options = available.slice((page - 1) * query.facetLimit, page * query.facetLimit);
      options.push(...all.filter(option => selected.includes(option.value) && !options.some(item => item.value === option.value)));
    } else {
      const value = facetValue(entity, facet);
      const label = facetLabel(entity, facet);
      const search = query.facetSearch ? `%${escapeLike(query.facetSearch)}%` : undefined;
      const optionWhere = and(where, sql`${value} IS NOT NULL AND ${value} <> ''`, search ? sql`(${label} LIKE ${search} ESCAPE '\\' OR ${value} LIKE ${search} ESCAPE '\\')` : undefined);
      const [available, totals, chosen] = await Promise.all([
        db.all<FacetOption>(sql`SELECT ${value} AS value, ${label} AS label, count(*) AS count FROM ${tables[entity]} WHERE ${optionWhere} GROUP BY ${value} ORDER BY ${label} COLLATE NOCASE ASC, ${value} ASC LIMIT ${query.facetLimit} OFFSET ${(page - 1) * query.facetLimit}`),
        db.all<{ total: number }>(sql`SELECT count(DISTINCT ${value}) AS total FROM ${tables[entity]} WHERE ${optionWhere}`),
        selected.length ? db.all<FacetOption>(sql`SELECT ${value} AS value, ${label} AS label, count(*) AS count FROM ${tables[entity]} WHERE ${and(where, sql`${value} IN (SELECT value FROM json_each(${JSON.stringify(selected)}))`)} GROUP BY ${value}`) : [],
      ]);
      options = available;
      total = totals[0].total;
      // Zero-count selections retain their identity even when other facets remove their records.
      const missing = selected.filter(value => !options.some(option => option.value === value));
      const labels = new Map<string, string>();
      if (facet === "owner" && missing.length) {
        const owners = await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, missing));
        owners.forEach(owner => labels.set(owner.id, owner.name));
      } else if (facet === "company" && missing.length) {
        const records = await db.select({ id: companies.id, name: companies.name }).from(companies).where(inArray(companies.id, missing));
        records.forEach(company => labels.set(company.id, company.name));
      }
      for (const value of missing) options.push(chosen.find(option => option.value === value) ?? { value, label: labels.get(value) ?? (facet === "owner" ? value === "unassigned" ? "Unassigned" : "Historical / unknown owner" : facet === "company" ? value === "none" ? "No company" : "Historical / unknown company" : value), count: 0 });
    }
    result.facetCounts[facet] = options;
    result.facetPages[facet] = { total, page, limit: query.facetLimit };
  }));
  return result;
}
