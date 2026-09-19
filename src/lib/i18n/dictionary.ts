import type { AppLocale } from "./config";
import { access, type AccessDictionary } from "./dictionaries/access";
import { auth, type AuthDictionary } from "./dictionaries/auth";
import { common, type CommonDictionary } from "./dictionaries/common";
import { crm, type CrmDictionary } from "./dictionaries/crm";
import { email, type EmailDictionary } from "./dictionaries/email";
import { errors, type ErrorsDictionary } from "./dictionaries/errors";
import { fields, type FieldsDictionary } from "./dictionaries/fields";
import { overview, type OverviewDictionary } from "./dictionaries/overview";
import { recordList, type RecordListDictionary } from "./dictionaries/record-list";
import { recordSheet, type RecordSheetDictionary } from "./dictionaries/record-sheet";
import { settings, type SettingsDictionary } from "./dictionaries/settings";
import { shell, type ShellDictionary } from "./dictionaries/shell";
import { timeline, type TimelineDictionary } from "./dictionaries/timeline";
import { ui, type UiDictionary } from "./dictionaries/ui";

export interface AppDictionary {
  locale: AppLocale;
  access: AccessDictionary;
  auth: AuthDictionary;
  common: CommonDictionary;
  crm: CrmDictionary;
  email: EmailDictionary;
  errors: ErrorsDictionary;
  fields: FieldsDictionary;
  overview: OverviewDictionary;
  recordList: RecordListDictionary;
  recordSheet: RecordSheetDictionary;
  settings: SettingsDictionary;
  shell: ShellDictionary;
  timeline: TimelineDictionary;
  ui: UiDictionary;
}

// Each area file holds both languages against one interface, so a key missing
// from either language fails the type check rather than rendering blank.
function compose(locale: AppLocale): AppDictionary {
  return {
    locale,
    access: access[locale],
    auth: auth[locale],
    common: common[locale],
    crm: crm[locale],
    email: email[locale],
    errors: errors[locale],
    fields: fields[locale],
    overview: overview[locale],
    recordList: recordList[locale],
    recordSheet: recordSheet[locale],
    settings: settings[locale],
    shell: shell[locale],
    timeline: timeline[locale],
    ui: ui[locale],
  };
}

export const dictionaries: Record<AppLocale, AppDictionary> = {
  en: compose("en"),
  vi: compose("vi"),
};
