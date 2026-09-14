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

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;
type Deal = (typeof schema.deals)["$inferSelect"];
type Field = (typeof schema.fieldValues)["$inferSelect"];
type Definition = (typeof schema.fieldDefinitions)["$inferSelect"];
type Membership = (typeof schema.singletonMembership)["$inferSelect"];

export type DealCentsStayNullableNumbers = Assert<Equal<Deal["amount"], number | null>>;
export type BaseAmountsStayExactStrings = Assert<Equal<Deal["baseAmount"], string | null>>;
export type ExchangeRatesStayExactStrings = Assert<Equal<Deal["fxRate"], string | null>>;
export type DecimalFieldsStayExactStrings = Assert<Equal<Field["number"], string | null>>;
export type FalseAndClearedFieldsStayDistinct = Assert<Equal<Field["bool"], boolean | null>>;
export type HistoricalUserFieldsStayOpaque = Assert<Equal<Field["userId"], string | null>>;
export type HistoricalDealOwnersStayRequired = Assert<Equal<Deal["ownerId"], string>>;
export type HistoricalActorsStayRequired = Assert<Equal<(typeof schema.activities)["$inferSelect"]["createdById"], string>>;
export type ArchivedDatesStayNullable = Assert<Equal<Definition["archivedAt"], string | null>>;
export type AllFieldTypesRemainSupported = Assert<Equal<Definition["type"],
  "TEXT" | "LONG_TEXT" | "NUMBER" | "DATE" | "CHECKBOX" | "SELECT" | "URL" | "EMAIL" | "PHONE" | "USER"
>>;
export type PlacementFlagsStayBooleans = Assert<Equal<Definition["showOnSheet" | "showOnTable" | "showOnFilter"], boolean>>;
export type MemberStatusRemainsConstrained = Assert<Equal<Membership["status"], "active" | "revoked">>;
export type MemberAccessHistoryStaysNumeric = Assert<Equal<Membership["revision" | "accessVersion"], number>>;
export type SessionExpiryRemainsADate = Assert<Equal<(typeof schema.session)["$inferSelect"]["expiresAt"], Date>>;
export type AuthVerificationRemainsBoolean = Assert<Equal<(typeof schema.user)["$inferSelect"]["emailVerified"], boolean>>;
export type AssociationRoleRemainsNullable = Assert<Equal<(typeof schema.dealContacts)["$inferSelect"]["role"], string | null>>;
export type SavedViewOwnersStayRequired = Assert<Equal<(typeof schema.savedViews)["$inferSelect"]["ownerId"], string>>;
