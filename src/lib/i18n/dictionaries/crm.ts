import type { ActivityType, DealStage, EnrichmentStatus, FieldEntity, FieldType, RecordSource } from "@/lib/db/schema/constants";
import type { AppLocale } from "../config";

interface EntityNames {
  /** "Company" */
  singular: string;
  /** "Companies" */
  plural: string;
  /** "company", for the middle of a sentence */
  lower: string;
  /** "companies", for the middle of a sentence */
  lowerPlural: string;
}

// The vocabulary every area shares. Stored values (stage, type, status) keep
// their English identifiers in the API; these are only how they are shown.
export interface CrmDictionary {
  entities: Record<FieldEntity, EntityNames>;
  activity: EntityNames;
  stages: Record<DealStage, string>;
  activityTypes: Record<ActivityType, string>;
  enrichmentStatuses: Record<EnrichmentStatus, string>;
  recordSources: Record<RecordSource, string>;
  fieldTypes: Record<FieldType, string>;
  /** Shown where a value is absent. */
  empty: string;
}

export const crm: Record<AppLocale, CrmDictionary> = {
  en: {
    entities: {
      COMPANY: { singular: "Company", plural: "Companies", lower: "company", lowerPlural: "companies" },
      CONTACT: { singular: "Contact", plural: "Contacts", lower: "contact", lowerPlural: "contacts" },
      DEAL: { singular: "Deal", plural: "Deals", lower: "deal", lowerPlural: "deals" },
    },
    activity: { singular: "Activity", plural: "Activities", lower: "activity", lowerPlural: "activities" },
    stages: {
      DEMO_BOOKED: "Demo booked",
      QUALIFIED_TO_BUY: "Qualified to buy",
      UNQUALIFIED_TO_BUY: "Unqualified to buy",
      DECISION_MAKER_BOUGHT_IN: "Decision maker bought in",
      CONTRACT_SENT: "Contract sent",
      CLOSED_WON: "Closed won",
      CLOSED_LOST: "Closed lost",
    },
    activityTypes: {
      NOTE: "Note",
      CALL: "Call",
      EMAIL: "Email",
      MEETING: "Meeting",
      TASK: "Task",
      STAGE_CHANGE: "Stage change",
      ENRICHMENT: "Enrichment",
    },
    enrichmentStatuses: { PENDING: "Pending", RUNNING: "Running", COMPLETE: "Complete", FAILED: "Failed", SKIPPED: "Skipped" },
    recordSources: { MANUAL: "Manual", IMPORT: "Import", EMAIL: "Email", CALENDAR: "Calendar", TRACKING: "Tracking" },
    fieldTypes: {
      TEXT: "Text", LONG_TEXT: "Long text", NUMBER: "Number", DATE: "Date", CHECKBOX: "Checkbox",
      SELECT: "Select", URL: "URL", EMAIL: "Email", PHONE: "Phone", USER: "User",
    },
    empty: "—",
  },
  vi: {
    entities: {
      COMPANY: { singular: "Công ty", plural: "Công ty", lower: "công ty", lowerPlural: "công ty" },
      CONTACT: { singular: "Liên hệ", plural: "Liên hệ", lower: "liên hệ", lowerPlural: "liên hệ" },
      DEAL: { singular: "Giao dịch", plural: "Giao dịch", lower: "giao dịch", lowerPlural: "giao dịch" },
    },
    activity: { singular: "Hoạt động", plural: "Hoạt động", lower: "hoạt động", lowerPlural: "hoạt động" },
    stages: {
      DEMO_BOOKED: "Đã đặt lịch demo",
      QUALIFIED_TO_BUY: "Đủ điều kiện mua",
      UNQUALIFIED_TO_BUY: "Không đủ điều kiện mua",
      DECISION_MAKER_BOUGHT_IN: "Người quyết định đã đồng thuận",
      CONTRACT_SENT: "Đã gửi hợp đồng",
      CLOSED_WON: "Chốt thành công",
      CLOSED_LOST: "Chốt thất bại",
    },
    activityTypes: {
      NOTE: "Ghi chú",
      CALL: "Cuộc gọi",
      EMAIL: "Email",
      MEETING: "Cuộc họp",
      TASK: "Công việc",
      STAGE_CHANGE: "Đổi giai đoạn",
      ENRICHMENT: "Làm giàu dữ liệu",
    },
    enrichmentStatuses: { PENDING: "Đang chờ", RUNNING: "Đang chạy", COMPLETE: "Hoàn tất", FAILED: "Thất bại", SKIPPED: "Đã bỏ qua" },
    recordSources: { MANUAL: "Thủ công", IMPORT: "Nhập dữ liệu", EMAIL: "Email", CALENDAR: "Lịch", TRACKING: "Theo dõi" },
    fieldTypes: {
      TEXT: "Văn bản", LONG_TEXT: "Văn bản dài", NUMBER: "Số", DATE: "Ngày", CHECKBOX: "Hộp kiểm",
      SELECT: "Lựa chọn", URL: "URL", EMAIL: "Email", PHONE: "Điện thoại", USER: "Người dùng",
    },
    empty: "—",
  },
};
