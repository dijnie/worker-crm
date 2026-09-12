import { One, relations } from "drizzle-orm/relations";
import { activities } from "./activity.schema";
import { companies } from "./company.schema";
import { contacts } from "./contact.schema";
import { dealContacts } from "./deal-contact.schema";
import { deals } from "./deal.schema";
import { fieldDefinitions } from "./field-definition.schema";
import { fieldOptions } from "./field-option.schema";
import { fieldValues } from "./field-value.schema";

export * from "./constants";
export * from "./company.schema";
export * from "./contact.schema";
export * from "./deal.schema";
export * from "./deal-contact.schema";
export * from "./activity.schema";
export * from "./field-definition.schema";
export * from "./field-option.schema";
export * from "./field-value.schema";
export * from "./saved-view.schema";

export const companiesRelations = relations(companies, ({ one, many }) => ({
  primaryContact: one(contacts, {
    fields: [companies.primaryContactId],
    references: [contacts.id],
    relationName: "PrimaryContact",
  }),
  contacts: many(contacts, { relationName: "CompanyContacts" }),
  deals: many(deals),
  activities: many(activities),
  fieldValues: many(fieldValues),
}));

export const contactsRelations = relations(contacts, ({ one, many }) => ({
  company: one(companies, {
    fields: [contacts.companyId],
    references: [companies.id],
    relationName: "CompanyContacts",
  }),
  primaryOf: new One(
    contacts,
    companies,
    {
      fields: [contacts.id],
      references: [companies.primaryContactId],
      relationName: "PrimaryContact",
    },
    false,
  ),
  deals: many(dealContacts),
  activities: many(activities),
  fieldValues: many(fieldValues),
}));

export const dealsRelations = relations(deals, ({ one, many }) => ({
  company: one(companies, {
    fields: [deals.companyId],
    references: [companies.id],
  }),
  contacts: many(dealContacts),
  activities: many(activities),
  fieldValues: many(fieldValues),
}));

export const dealContactsRelations = relations(dealContacts, ({ one }) => ({
  deal: one(deals, {
    fields: [dealContacts.dealId],
    references: [deals.id],
  }),
  contact: one(contacts, {
    fields: [dealContacts.contactId],
    references: [contacts.id],
  }),
}));

export const activitiesRelations = relations(activities, ({ one }) => ({
  company: one(companies, {
    fields: [activities.companyId],
    references: [companies.id],
  }),
  contact: one(contacts, {
    fields: [activities.contactId],
    references: [contacts.id],
  }),
  deal: one(deals, {
    fields: [activities.dealId],
    references: [deals.id],
  }),
}));

export const fieldDefinitionsRelations = relations(fieldDefinitions, ({ many }) => ({
  options: many(fieldOptions),
  values: many(fieldValues),
}));

export const fieldOptionsRelations = relations(fieldOptions, ({ one, many }) => ({
  field: one(fieldDefinitions, {
    fields: [fieldOptions.fieldId],
    references: [fieldDefinitions.id],
  }),
  values: many(fieldValues),
}));

export const fieldValuesRelations = relations(fieldValues, ({ one }) => ({
  field: one(fieldDefinitions, {
    fields: [fieldValues.fieldId],
    references: [fieldDefinitions.id],
  }),
  company: one(companies, {
    fields: [fieldValues.companyId],
    references: [companies.id],
  }),
  contact: one(contacts, {
    fields: [fieldValues.contactId],
    references: [contacts.id],
  }),
  deal: one(deals, {
    fields: [fieldValues.dealId],
    references: [deals.id],
  }),
  option: one(fieldOptions, {
    fields: [fieldValues.optionId],
    references: [fieldOptions.id],
  }),
}));
