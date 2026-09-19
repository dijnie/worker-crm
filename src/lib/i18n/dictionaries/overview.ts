import type { AppLocale } from "../config";

export interface OverviewDictionary {
  /** Shown under a failed request when the server gave no more specific text. */
  retryFallback: string;
  dashboard: {
    title: string;
    description: string;
    currencyLabel: string;
    applyCurrency: string;
    currencyHelp: string;
    invalidCurrencyCode: string;
    invalidLinkCurrency: (stored: string) => string;
    statsAriaLabel: string;
    statsFailedTitle: string;
    retryStatistics: string;
    refreshingStatistics: (currency: string) => string;
    loadingStatistics: (currency: string) => string;
    unavailableValue: string;
    totalCompanies: { label: string; description: string };
    totalContacts: { label: string; description: string };
    openDeals: { label: string; description: string };
    openDealValue: { label: (currency: string) => string; description: (currency: string) => string };
  };
  pipeline: {
    title: string;
    description: (currency: string) => string;
    tableAriaLabel: string;
    caption: (currency: string) => string;
    stageColumn: string;
    dealsColumn: string;
    valueColumn: (currency: string) => string;
    empty: (currency: string) => string;
  };
  recentActivity: {
    title: string;
    description: string;
    refresh: string;
    actorNamesFailed: string;
    retryActorNames: string;
    loadFailedTitle: string;
    retryActivity: string;
    loadingAriaLabel: string;
    refreshing: string;
    empty: string;
    listAriaLabel: string;
    unavailableLink: (entityLower: string, id: string) => string;
    archived: (label: string) => string;
  };
}

export const overview: Record<AppLocale, OverviewDictionary> = {
  en: {
    retryFallback: "Please try again.",
    dashboard: {
      title: "Welcome back",
      description: "What the team has closed, what is still in play, and what needs you today.",
      currencyLabel: "Currency",
      applyCurrency: "Apply currency",
      currencyHelp: "Values use this currency only. No conversion.",
      invalidCurrencyCode: "Enter a three-letter currency code, such as USD or EUR.",
      invalidLinkCurrency: stored => `This link has an invalid currency. Showing ${stored}; enter a three-letter code to update it.`,
      statsAriaLabel: "Workspace statistics",
      statsFailedTitle: "Workspace statistics could not load.",
      retryStatistics: "Retry statistics",
      refreshingStatistics: currency => `Refreshing statistics for ${currency}…`,
      loadingStatistics: currency => `Loading statistics for ${currency}…`,
      unavailableValue: "Unavailable",
      totalCompanies: { label: "Total companies", description: "Workspace total · active companies" },
      totalContacts: { label: "Total contacts", description: "Workspace total · active contacts" },
      openDeals: { label: "Open deals", description: "Workspace total · all currencies" },
      openDealValue: {
        label: currency => `Open deal value · ${currency}`,
        description: currency => `Active open deals · ${currency} only`,
      },
    },
    pipeline: {
      title: "Deal pipeline",
      description: currency => `Active deals in ${currency}, including closed stages`,
      tableAriaLabel: "Deal pipeline",
      caption: currency => `Deal counts and exact values for all seven stages in ${currency}. Select a stage to view matching deals.`,
      stageColumn: "Stage",
      dealsColumn: "Deals",
      valueColumn: currency => `Value (${currency})`,
      empty: currency => `No active deals in ${currency} yet.`,
    },
    recentActivity: {
      title: "Recent activity",
      description: "The latest 10 activities, ordered by creation time",
      refresh: "Refresh activity",
      actorNamesFailed: "Actor names could not load. Historical actor IDs remain visible.",
      retryActorNames: "Retry actor names",
      loadFailedTitle: "Recent activity could not load.",
      retryActivity: "Retry activity",
      loadingAriaLabel: "Loading recent activity",
      refreshing: "Refreshing recent activity…",
      empty: "No activity yet. Activities logged on a company, contact, or deal will appear here.",
      listAriaLabel: "Recent activity",
      unavailableLink: (entityLower, id) => `Unavailable ${entityLower} (${id})`,
      archived: label => `${label} (archived)`,
    },
  },
  vi: {
    retryFallback: "Vui lòng thử lại.",
    dashboard: {
      title: "Chào mừng trở lại",
      description: "Những gì đội ngũ đã chốt, những gì vẫn đang triển khai và những gì cần bạn xử lý hôm nay.",
      currencyLabel: "Tiền tệ",
      applyCurrency: "Áp dụng tiền tệ",
      currencyHelp: "Giá trị chỉ tính theo tiền tệ này. Không quy đổi.",
      invalidCurrencyCode: "Nhập mã tiền tệ gồm ba chữ cái, ví dụ USD hoặc EUR.",
      invalidLinkCurrency: stored => `Liên kết này có tiền tệ không hợp lệ. Đang hiển thị ${stored}; hãy nhập mã ba chữ cái để cập nhật.`,
      statsAriaLabel: "Thống kê không gian làm việc",
      statsFailedTitle: "Không tải được thống kê không gian làm việc.",
      retryStatistics: "Tải lại thống kê",
      refreshingStatistics: currency => `Đang làm mới thống kê cho ${currency}…`,
      loadingStatistics: currency => `Đang tải thống kê cho ${currency}…`,
      unavailableValue: "Không khả dụng",
      totalCompanies: { label: "Tổng số công ty", description: "Tổng không gian làm việc · công ty đang hoạt động" },
      totalContacts: { label: "Tổng số liên hệ", description: "Tổng không gian làm việc · liên hệ đang hoạt động" },
      openDeals: { label: "Giao dịch đang mở", description: "Tổng không gian làm việc · mọi loại tiền tệ" },
      openDealValue: {
        label: currency => `Giá trị giao dịch đang mở · ${currency}`,
        description: currency => `Giao dịch đang mở · chỉ tính ${currency}`,
      },
    },
    pipeline: {
      title: "Kênh giao dịch",
      description: currency => `Giao dịch đang hoạt động theo ${currency}, bao gồm cả các giai đoạn đã chốt`,
      tableAriaLabel: "Kênh giao dịch",
      caption: currency => `Số lượng và giá trị chính xác cho cả bảy giai đoạn theo ${currency}. Chọn một giai đoạn để xem các giao dịch tương ứng.`,
      stageColumn: "Giai đoạn",
      dealsColumn: "Giao dịch",
      valueColumn: currency => `Giá trị (${currency})`,
      empty: currency => `Chưa có giao dịch nào đang hoạt động theo ${currency}.`,
    },
    recentActivity: {
      title: "Hoạt động gần đây",
      description: "10 hoạt động gần nhất, sắp xếp theo thời gian tạo",
      refresh: "Làm mới hoạt động",
      actorNamesFailed: "Không tải được tên người thực hiện. ID người thực hiện trong lịch sử vẫn hiển thị.",
      retryActorNames: "Tải lại tên người thực hiện",
      loadFailedTitle: "Không tải được hoạt động gần đây.",
      retryActivity: "Tải lại hoạt động",
      loadingAriaLabel: "Đang tải hoạt động gần đây",
      refreshing: "Đang làm mới hoạt động gần đây…",
      empty: "Chưa có hoạt động nào. Hoạt động được ghi trên công ty, liên hệ hoặc giao dịch sẽ hiển thị ở đây.",
      listAriaLabel: "Hoạt động gần đây",
      unavailableLink: (entityLower, id) => `Không khả dụng ${entityLower} (${id})`,
      archived: label => `${label} (đã lưu trữ)`,
    },
  },
};
