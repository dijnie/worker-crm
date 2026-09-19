import type { AppLocale } from "../config";

export interface CommonDictionary {
  appName: string;
  appDescription: string;
  save: string;
  saving: string;
  cancel: string;
  close: string;
  retry: string;
  loading: string;
  languageNames: Record<AppLocale, string>;
}

// Each language is named in itself so a reader can find their own.
const languageNames: Record<AppLocale, string> = { en: "English", vi: "Tiếng Việt" };

export const common: Record<AppLocale, CommonDictionary> = {
  en: {
    appName: "Vinext",
    appDescription: "A unified workspace for your team.",
    save: "Save",
    saving: "Saving…",
    cancel: "Cancel",
    close: "Close",
    retry: "Retry",
    loading: "Loading…",
    languageNames,
  },
  vi: {
    appName: "Vinext",
    appDescription: "Không gian làm việc hợp nhất cho đội ngũ của bạn.",
    save: "Lưu",
    saving: "Đang lưu…",
    cancel: "Hủy",
    close: "Đóng",
    retry: "Thử lại",
    loading: "Đang tải…",
    languageNames,
  },
};
