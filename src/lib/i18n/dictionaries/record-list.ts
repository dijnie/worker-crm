import type { AppLocale } from "../config";

interface RecordListColumnsDictionary {
  /** The name column header shown only for contacts; companies and deals reuse `dictionary.crm.entities`. */
  name: string;
  domain: string;
  industry: string;
  owner: string;
  contacts: string;
  openDeals: string;
  title: string;
  email: string;
  stage: string;
  amount: string;
  closeDate: string;
  created: string;
  lastActivity: string;
  enrichment: string;
  archived: string;
  actions: string;
}

interface RecordListListDictionary {
  /** "New <entity>", the create-record button. */
  newRecord: (entityLower: string) => string;
  search: {
    ariaLabel: (entityLowerPlural: string) => string;
    placeholder: (entityLowerPlural: string) => string;
  };
  columns: RecordListColumnsDictionary;
  /** The `directoryStatus` fallback passed to custom USER-type field columns, no trailing period. */
  directoryStatusUnavailable: string;
  directoryStatusLoading: string;
  unknownCompany: (companyId: string) => string;
  archivedSuffix: string;
  ownerUnavailable: (ownerId: string) => string;
  unassigned: string;
  invalidRecordLinkClose: string;
  fieldsUnavailableMessage: string;
  retryCustomFields: string;
  /** Same wording as `directoryStatusUnavailable`, with the trailing period this alert uses. */
  userDirectoryUnavailableMessage: string;
  retryUserDirectory: string;
  unavailableFieldFiltersMessage: string;
  removeUnavailableFieldFilters: string;
  requestFailedFallback: string;
  filterOptionsUnavailableMessage: string;
  retryFilters: string;
  filteredBy: string;
  removeFilter: (facetLabel: string) => string;
  selectedCount: (count: number) => string;
  amountSortNote: string;
  loadRecordsFailedFallback: string;
  retryRecords: string;
  refreshAriaLabel: string;
  refreshTitle: string;
  emptyNoMatches: string;
  emptyNoneYet: (entityLowerPlural: string) => string;
  emptyAdjustFilters: string;
  emptyCreateFirst: (entityLower: string) => string;
  loadingRecords: string;
  refreshingRecords: string;
  recordCount: (total: number) => string;
  pageSizeLabel: string;
  invalidLinkMessage: string;
  /** The parser's own English reason, shown under `invalidLinkMessage`. */
  invalidLinkDetail: (detail: string) => string;
  clearInvalidFilters: string;
}

interface RecordListSavedViewsDictionary {
  trigger: string;
  applyLabel: string;
  chooseView: string;
  sharedSuffix: string;
  privateSuffix: string;
  loadFailedFallback: string;
  retry: string;
  viewNameLabel: string;
  sharedCheckbox: string;
  saveAsNew: string;
  rename: string;
  updateConfiguration: string;
  makePrivate: string;
  shareView: string;
  deleteView: string;
  removeUnsupportedFilters: string;
  repairFieldMessage: string;
  waitForDefinitions: string;
  unsupportedConfigurationMessage: string;
  updateFailedFallback: string;
}

export interface RecordListDictionary {
  /** The shared description under the Companies/Contacts/Deals page titles. */
  pageDescription: string;
  /** Filter facet names, keyed by facet id (`owner`, `industry`, `field:<key>`, ...). */
  facets: Record<string, string>;
  clearFilters: string;
  list: RecordListListDictionary;
  savedViews: RecordListSavedViewsDictionary;
}

export const recordList: Record<AppLocale, RecordListDictionary> = {
  en: {
    pageDescription: "Manage your workspace records",
    facets: {
      owner: "Owner",
      industry: "Industry",
      source: "Source",
      enrichment: "Enrichment",
      activity: "Activity",
      company: "Company",
      title: "Title",
      seniority: "Seniority",
      persona: "Persona",
      stage: "Stage",
      status: "Status",
      closing: "Closing",
      currency: "Currency",
    },
    clearFilters: "Clear filters",
    list: {
      newRecord: entityLower => `New ${entityLower}`,
      search: {
        ariaLabel: entityLowerPlural => `Search ${entityLowerPlural}`,
        placeholder: entityLowerPlural => `Search ${entityLowerPlural}…`,
      },
      columns: {
        name: "Name",
        domain: "Domain",
        industry: "Industry",
        owner: "Owner",
        contacts: "Contacts",
        openDeals: "Open deals",
        title: "Title",
        email: "Email",
        stage: "Stage",
        amount: "Amount (grouped by currency)",
        closeDate: "Close date",
        created: "Created",
        lastActivity: "Last activity",
        enrichment: "Enrichment",
        archived: "Archived",
        actions: "Actions",
      },
      directoryStatusUnavailable: "User directory unavailable",
      directoryStatusLoading: "Loading user…",
      unknownCompany: companyId => `Unknown company (${companyId})`,
      archivedSuffix: " (archived)",
      ownerUnavailable: ownerId => `Unavailable / historical (${ownerId})`,
      unassigned: "Unassigned",
      invalidRecordLinkClose: "Close invalid record link",
      fieldsUnavailableMessage: "Custom field definitions could not load.",
      retryCustomFields: "Retry custom fields",
      userDirectoryUnavailableMessage: "User directory unavailable.",
      retryUserDirectory: "Retry user directory",
      unavailableFieldFiltersMessage: "A selected custom field is retired or no longer supports filtering. Repair the filters to continue.",
      removeUnavailableFieldFilters: "Remove unavailable field filters",
      requestFailedFallback: "Request failed.",
      filterOptionsUnavailableMessage: "Filter options could not load.",
      retryFilters: "Retry filters",
      filteredBy: "Filtered by",
      removeFilter: facetLabel => `Remove ${facetLabel} filter`,
      selectedCount: count => `${count} selected`,
      amountSortNote: "Amounts are grouped by currency and sorted exactly within each currency. No exchange-rate conversion is applied.",
      loadRecordsFailedFallback: "Could not load records.",
      retryRecords: "Retry records",
      refreshAriaLabel: "Refresh",
      refreshTitle: "Refresh records",
      emptyNoMatches: "No matching records",
      emptyNoneYet: entityLowerPlural => `No ${entityLowerPlural} yet`,
      emptyAdjustFilters: "Adjust your search or filters to find records.",
      emptyCreateFirst: entityLower => `Create your first ${entityLower} to get started.`,
      loadingRecords: "Loading records…",
      refreshingRecords: "Refreshing records…",
      recordCount: total => `${total} ${total === 1 ? "record" : "records"}`,
      pageSizeLabel: "Page size",
      invalidLinkMessage: "This table link contains an unsupported or invalid query. Your filters have not been applied.",
      invalidLinkDetail: detail => detail,
      clearInvalidFilters: "Clear invalid filters",
    },
    savedViews: {
      trigger: "Saved views",
      applyLabel: "Apply saved view",
      chooseView: "Choose a view",
      sharedSuffix: " (shared)",
      privateSuffix: " (private)",
      loadFailedFallback: "Could not load saved views",
      retry: "Retry views",
      viewNameLabel: "View name",
      sharedCheckbox: "Shared view",
      saveAsNew: "Save as new view",
      rename: "Rename view",
      updateConfiguration: "Update view configuration",
      makePrivate: "Make private",
      shareView: "Share view",
      deleteView: "Delete view",
      removeUnsupportedFilters: "Remove unsupported field filters",
      repairFieldMessage: "This view references a retired or unsupported field. Repair its filters before applying it.",
      waitForDefinitions: "Wait for field definitions to load before applying this view.",
      unsupportedConfigurationMessage: "This view contains unsupported filters or sorting. Remove unsupported field filters to apply it, or clear the view and save a supported configuration.",
      updateFailedFallback: "Could not update the view.",
    },
  },
  vi: {
    pageDescription: "Quản lý các bản ghi trong không gian làm việc của bạn.",
    facets: {
      owner: "Chủ sở hữu",
      industry: "Ngành",
      source: "Nguồn",
      enrichment: "Làm giàu dữ liệu",
      activity: "Hoạt động",
      company: "Công ty",
      title: "Chức danh",
      seniority: "Cấp bậc",
      persona: "Vai trò",
      stage: "Giai đoạn",
      status: "Trạng thái",
      closing: "Hạn chốt",
      currency: "Tiền tệ",
    },
    clearFilters: "Xóa bộ lọc",
    list: {
      newRecord: entityLower => `Thêm ${entityLower} mới`,
      search: {
        ariaLabel: entityLowerPlural => `Tìm kiếm ${entityLowerPlural}`,
        placeholder: entityLowerPlural => `Tìm kiếm ${entityLowerPlural}…`,
      },
      columns: {
        name: "Tên",
        domain: "Tên miền",
        industry: "Ngành",
        owner: "Chủ sở hữu",
        contacts: "Liên hệ",
        openDeals: "Giao dịch đang mở",
        title: "Chức danh",
        email: "Email",
        stage: "Giai đoạn",
        amount: "Số tiền (nhóm theo tiền tệ)",
        closeDate: "Ngày chốt",
        created: "Ngày tạo",
        lastActivity: "Hoạt động gần nhất",
        enrichment: "Làm giàu dữ liệu",
        archived: "Đã lưu trữ",
        actions: "Thao tác",
      },
      directoryStatusUnavailable: "Không tải được danh bạ người dùng",
      directoryStatusLoading: "Đang tải người dùng…",
      unknownCompany: companyId => `Công ty không xác định (${companyId})`,
      archivedSuffix: " (đã lưu trữ)",
      ownerUnavailable: ownerId => `Không còn hoạt động / lịch sử (${ownerId})`,
      unassigned: "Chưa phân công",
      invalidRecordLinkClose: "Đóng liên kết bản ghi không hợp lệ",
      fieldsUnavailableMessage: "Không tải được định nghĩa trường tùy chỉnh.",
      retryCustomFields: "Thử lại trường tùy chỉnh",
      userDirectoryUnavailableMessage: "Không tải được danh bạ người dùng.",
      retryUserDirectory: "Thử lại danh bạ người dùng",
      unavailableFieldFiltersMessage: "Một trường tùy chỉnh đã chọn đã bị ngừng dùng hoặc không còn hỗ trợ lọc. Hãy sửa bộ lọc để tiếp tục.",
      removeUnavailableFieldFilters: "Xóa bộ lọc trường không khả dụng",
      requestFailedFallback: "Yêu cầu thất bại.",
      filterOptionsUnavailableMessage: "Không tải được tùy chọn bộ lọc.",
      retryFilters: "Thử lại bộ lọc",
      filteredBy: "Lọc theo",
      removeFilter: facetLabel => `Xóa bộ lọc ${facetLabel}`,
      selectedCount: count => `Đã chọn ${count}`,
      amountSortNote: "Số tiền được nhóm theo tiền tệ và sắp xếp chính xác trong từng loại tiền tệ. Không quy đổi tỷ giá.",
      loadRecordsFailedFallback: "Không tải được bản ghi.",
      retryRecords: "Thử lại bản ghi",
      refreshAriaLabel: "Làm mới",
      refreshTitle: "Làm mới bản ghi",
      emptyNoMatches: "Không có bản ghi phù hợp",
      emptyNoneYet: entityLowerPlural => `Chưa có ${entityLowerPlural}`,
      emptyAdjustFilters: "Điều chỉnh tìm kiếm hoặc bộ lọc để tìm bản ghi.",
      emptyCreateFirst: entityLower => `Tạo ${entityLower} đầu tiên để bắt đầu.`,
      loadingRecords: "Đang tải bản ghi…",
      refreshingRecords: "Đang làm mới bản ghi…",
      recordCount: total => `${total} bản ghi`,
      pageSizeLabel: "Số dòng mỗi trang",
      invalidLinkMessage: "Liên kết bảng này chứa truy vấn không được hỗ trợ hoặc không hợp lệ. Bộ lọc của bạn chưa được áp dụng.",
      invalidLinkDetail: detail => `Chi tiết kỹ thuật: ${detail}`,
      clearInvalidFilters: "Xóa bộ lọc không hợp lệ",
    },
    savedViews: {
      trigger: "Chế độ xem đã lưu",
      applyLabel: "Áp dụng chế độ xem đã lưu",
      chooseView: "Chọn một chế độ xem",
      sharedSuffix: " (dùng chung)",
      privateSuffix: " (riêng tư)",
      loadFailedFallback: "Không tải được chế độ xem đã lưu",
      retry: "Thử lại chế độ xem",
      viewNameLabel: "Tên chế độ xem",
      sharedCheckbox: "Chế độ xem dùng chung",
      saveAsNew: "Lưu thành chế độ xem mới",
      rename: "Đổi tên chế độ xem",
      updateConfiguration: "Cập nhật cấu hình chế độ xem",
      makePrivate: "Chuyển thành riêng tư",
      shareView: "Chia sẻ chế độ xem",
      deleteView: "Xóa chế độ xem",
      removeUnsupportedFilters: "Xóa bộ lọc trường không được hỗ trợ",
      repairFieldMessage: "Chế độ xem này tham chiếu đến một trường đã ngừng dùng hoặc không được hỗ trợ. Hãy sửa bộ lọc trước khi áp dụng.",
      waitForDefinitions: "Hãy đợi định nghĩa trường tải xong trước khi áp dụng chế độ xem này.",
      unsupportedConfigurationMessage: "Chế độ xem này chứa bộ lọc hoặc cách sắp xếp không được hỗ trợ. Hãy xóa bộ lọc trường không được hỗ trợ để áp dụng, hoặc xóa chế độ xem và lưu một cấu hình được hỗ trợ.",
      updateFailedFallback: "Không cập nhật được chế độ xem.",
    },
  },
};
