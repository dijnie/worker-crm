import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../src/lib/db/schema";

async function loadContact(db: DrizzleD1Database<typeof schema>) {
  return db.query.contacts.findFirst({ with: { company: true, primaryOf: true } });
}

type ContactWithCompanies = NonNullable<Awaited<ReturnType<typeof loadContact>>>;
type Assert<T extends true> = T;

export type PrimaryCompanyIsNullable = Assert<
  null extends ContactWithCompanies["primaryOf"] ? true : false
>;
export type EmployerIsNullable = Assert<
  null extends ContactWithCompanies["company"] ? true : false
>;

export type SessionVersionIsRequiredNumber = Assert<
  (typeof schema.session)["$inferSelect"]["accessVersion"] extends number ? true : false
>;

export type MembershipRoleIsConstrained = Assert<
  (typeof schema.singletonMembership)["$inferSelect"]["role"] extends "owner" | "member" ? true : false
>;
