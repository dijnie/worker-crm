import type { AppLocale } from "../config";

export interface SettingsDictionary {
  title: string;
  description: string;
  unavailableTitle: string;
  currency: {
    regionLabel: string;
    title: string;
    description: string;
    unavailable: string;
    label: string;
    submit: string;
    saved: (currency: string) => string;
    conflict: string;
    failed: string;
  };
  language: {
    regionLabel: string;
    title: string;
    description: string;
    unavailable: string;
    label: string;
    submit: string;
    conflict: string;
    failed: string;
  };
  access: {
    regionLabel: string;
    title: string;
    description: string;
    manageRoles: string;
    manageMembers: string;
  };
}

export const settings: Record<AppLocale, SettingsDictionary> = {
  en: {
    title: "Settings",
    description: "The reporting currency, workspace access, and the custom properties records carry.",
    unavailableTitle: "Workspace settings are unavailable",
    currency: {
      regionLabel: "Reporting currency settings",
      title: "Reporting currency",
      description: "Totals on the overview use this currency only. No conversion.",
      unavailable: "The stored reporting currency could not be read.",
      label: "Reporting currency",
      submit: "Save currency",
      saved: currency => `Reporting currency saved as ${currency}.`,
      conflict: "The reporting currency changed while you were editing. The stored value is shown; apply it again.",
      failed: "The reporting currency could not be saved.",
    },
    language: {
      regionLabel: "Workspace language settings",
      title: "Language",
      description: "Everyone in the workspace sees the interface, dates, numbers and emails in this language.",
      unavailable: "The stored language could not be read.",
      label: "Workspace language",
      submit: "Save language",
      conflict: "The workspace settings changed while you were editing. The stored value is shown; apply it again.",
      failed: "The language could not be saved.",
    },
    access: {
      regionLabel: "Roles and members",
      title: "Roles and members",
      description: "Create roles, configure permissions, and assign workspace access.",
      manageRoles: "Manage roles",
      manageMembers: "Manage members",
    },
  },
  vi: {
    title: "Cài đặt",
    description: "Tiền tệ báo cáo, quyền truy cập không gian làm việc và các thuộc tính tùy chỉnh của bản ghi.",
    unavailableTitle: "Không tải được cài đặt không gian làm việc",
    currency: {
      regionLabel: "Cài đặt tiền tệ báo cáo",
      title: "Tiền tệ báo cáo",
      description: "Tổng số ở trang tổng quan chỉ tính theo tiền tệ này. Không quy đổi.",
      unavailable: "Không đọc được tiền tệ báo cáo đã lưu.",
      label: "Tiền tệ báo cáo",
      submit: "Lưu tiền tệ",
      saved: currency => `Đã lưu tiền tệ báo cáo là ${currency}.`,
      conflict: "Tiền tệ báo cáo đã thay đổi trong lúc bạn chỉnh sửa. Giá trị đang lưu được hiển thị; hãy áp dụng lại.",
      failed: "Không lưu được tiền tệ báo cáo.",
    },
    language: {
      regionLabel: "Cài đặt ngôn ngữ không gian làm việc",
      title: "Ngôn ngữ",
      description: "Mọi người trong không gian làm việc sẽ thấy giao diện, ngày tháng, con số và email bằng ngôn ngữ này.",
      unavailable: "Không đọc được ngôn ngữ đã lưu.",
      label: "Ngôn ngữ không gian làm việc",
      submit: "Lưu ngôn ngữ",
      conflict: "Cài đặt không gian làm việc đã thay đổi trong lúc bạn chỉnh sửa. Giá trị đang lưu được hiển thị; hãy áp dụng lại.",
      failed: "Không lưu được ngôn ngữ.",
    },
    access: {
      regionLabel: "Vai trò và thành viên",
      title: "Vai trò và thành viên",
      description: "Tạo vai trò, cấu hình quyền và cấp quyền truy cập không gian làm việc.",
      manageRoles: "Quản lý vai trò",
      manageMembers: "Quản lý thành viên",
    },
  },
};
