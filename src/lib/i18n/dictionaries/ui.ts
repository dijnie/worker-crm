import type { AppLocale } from "../config";

// Shared primitives in src/components/ui render their own default copy when a
// caller does not override it via a prop; overrides still take precedence and
// never look at this dictionary.
export interface UiDictionary {
  pagination: {
    /** Shown instead of a range when there is nothing to page through. */
    noResults: string;
    /** `start` and `end` and `total` arrive already formatted for the locale. */
    range: (start: string, end: string, total: string) => string;
    previousPage: string;
    previous: string;
    nextPage: string;
    next: string;
  };
  dataTable: {
    /** Follows the bold selected count, e.g. "3 selected". */
    selectedSuffix: string;
    clear: string;
    filters: string;
    sort: string;
    sortBy: string;
    detail: string;
    ascending: string;
    descending: string;
    columns: string;
    toggleColumns: string;
    resetColumns: string;
    noResults: string;
    nothingMatches: string;
    selectPage: string;
    selectRow: string;
    selectRowLabel: (rowLabel: string) => string;
    searchFacetPlaceholder: (facetLabel: string) => string;
    all: string;
  };
  command: {
    paletteTitle: string;
    paletteDescription: string;
  };
  spinner: {
    loading: string;
  };
}

export const ui: Record<AppLocale, UiDictionary> = {
  en: {
    pagination: {
      noResults: "No results",
      range: (start, end, total) => `Showing ${start}–${end} of ${total}`,
      previousPage: "Previous page",
      previous: "Previous",
      nextPage: "Next page",
      next: "Next",
    },
    dataTable: {
      selectedSuffix: "selected",
      clear: "Clear",
      filters: "Filters",
      sort: "Sort",
      sortBy: "Sort by",
      detail: "Detail",
      ascending: "Ascending",
      descending: "Descending",
      columns: "Columns",
      toggleColumns: "Toggle columns",
      resetColumns: "Reset columns",
      noResults: "No results found.",
      nothingMatches: "Nothing matches.",
      selectPage: "Select page",
      selectRow: "Select row",
      selectRowLabel: rowLabel => `Select ${rowLabel}`,
      searchFacetPlaceholder: facetLabel => `Search ${facetLabel}…`,
      all: "All",
    },
    command: {
      paletteTitle: "Command Palette",
      paletteDescription: "Search for a command to run...",
    },
    spinner: {
      loading: "Loading",
    },
  },
  vi: {
    pagination: {
      noResults: "Không có kết quả",
      range: (start, end, total) => `Hiển thị ${start}–${end} trong tổng số ${total}`,
      previousPage: "Trang trước",
      previous: "Trước",
      nextPage: "Trang sau",
      next: "Sau",
    },
    dataTable: {
      selectedSuffix: "mục đã chọn",
      clear: "Bỏ chọn",
      filters: "Bộ lọc",
      sort: "Sắp xếp",
      sortBy: "Sắp xếp theo",
      detail: "Chi tiết",
      ascending: "Tăng dần",
      descending: "Giảm dần",
      columns: "Cột",
      toggleColumns: "Hiện/ẩn cột",
      resetColumns: "Đặt lại cột",
      noResults: "Không tìm thấy kết quả nào.",
      nothingMatches: "Không có gì khớp.",
      selectPage: "Chọn cả trang",
      selectRow: "Chọn dòng",
      selectRowLabel: rowLabel => `Chọn ${rowLabel}`,
      searchFacetPlaceholder: facetLabel => `Tìm kiếm ${facetLabel}…`,
      all: "Tất cả",
    },
    command: {
      paletteTitle: "Bảng lệnh",
      paletteDescription: "Tìm lệnh để chạy...",
    },
    spinner: {
      loading: "Đang tải",
    },
  },
};
