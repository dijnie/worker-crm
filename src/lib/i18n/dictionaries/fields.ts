import type { AppLocale } from "../config";

export interface FieldsDictionary {
  /** Shared short verbs reused across the panel, the list and the editor. */
  actions: {
    edit: string;
    archive: string;
    restore: string;
  };
  /** Rendered by `FieldValueDisplay` / `fieldValueText`. */
  valueDisplay: {
    notSet: string;
    yes: string;
    no: string;
    /** Appended after a select option's stored label. */
    retiredSuffix: string;
    unavailableOption: (id: string) => string;
    unavailableUser: (id: string) => string;
  };
  /** Values named inside a list filter chip; options and users come from `valueDisplay`. */
  facet: {
    unavailableOption: (value: string) => string;
  };
  /** Shared between the record-sheet panel and the definition editor. */
  saveNotConfirmed: string;
  /** Client-side draft validation, thrown by `parseFieldDraft`. */
  validation: {
    requiredCleared: string;
    checkboxValue: string;
    genericValue: string;
    tooLong: (limit: number) => string;
    numberFormat: string;
    dateFormat: string;
    urlFormat: string;
    emailFormat: string;
  };
  /** The custom fields panel shown inside a record sheet. */
  panel: {
    regionLabel: string;
    manageFields: string;
    loadingLabel: string;
    unavailable: string;
    retry: string;
    empty: string;
    directoryUnavailable: string;
    retryDirectory: string;
    directoryUnavailableValue: (value: string) => string;
    directoryLoadingValue: (value: string) => string;
    draftMismatch: (type: string) => string;
    setToNo: string;
    chooseOption: string;
    checkValue: string;
    /** Prefix shown before the last confirmed value, once an edit fails. */
    lastSaved: string;
    saved: string;
    clear: string;
    editAria: (label: string) => string;
    saveAria: (label: string) => string;
    clearAria: (label: string) => string;
  };
  /** The custom field settings list on the Settings page. */
  list: {
    regionLabel: string;
    title: string;
    description: string;
    newField: string;
    entityGroupLabel: string;
    searchPlaceholder: string;
    searchLabel: string;
    includeArchived: string;
    loadingLabel: string;
    unavailable: string;
    retry: string;
    noMatch: string;
    noneYet: (entityLower: string) => string;
    archivedSuffix: string;
    requiredSuffix: string;
    placementSheet: string;
    placementTable: string;
    placementFilter: string;
    placementHidden: string;
    restoreAria: (label: string) => string;
    moveUpAria: (label: string) => string;
    moveDownAria: (label: string) => string;
    editAria: (label: string) => string;
    archiveAria: (label: string) => string;
    fieldArchived: string;
    fieldRestored: string;
    orderSaved: string;
    changeFailed: string;
    clearSearchHint: string;
    savingChanges: string;
    returnToRecords: string;
  };
  /** The create/edit field definition dialog. */
  form: {
    editTitle: string;
    newTitle: string;
    description: (entityLower: string) => string;
    formLabel: string;
    fieldLabel: string;
    entityImmutable: string;
    keyImmutable: string;
    fieldKeyOptional: string;
    keyPlaceholderFallback: string;
    enterExplicitKey: string;
    keyPreview: (value: string) => string;
    fieldType: string;
    typeChangeHint: string;
    toggles: {
      required: string;
      showOnSheet: string;
      showOnTable: string;
      showOnFilter: string;
    };
    filtersHint: string;
    selectOptions: string;
    optionLabelAria: (position: number) => string;
    moveOptionUpAria: (position: number) => string;
    moveOptionDownAria: (position: number) => string;
    archiveOptionAria: (position: number) => string;
    addOption: string;
    showArchivedOptions: string;
    loadingArchivedOptions: string;
    archivedOptionsUnavailable: string;
    retryOptions: string;
    noArchivedOptions: string;
    restoreOptionAria: (label: string) => string;
    optionsHint: string;
    storedAgentMetadata: string;
    agentFilled: string;
    agentBrief: string;
    labelRequired: string;
    keyInvalid: string;
    optionsRequired: string;
    savingField: string;
    unsavedChanges: string;
    keepEditing: string;
    discardChanges: string;
    saveField: string;
  };
}

export const fields: Record<AppLocale, FieldsDictionary> = {
  en: {
    actions: { edit: "Edit", archive: "Archive", restore: "Restore" },
    valueDisplay: {
      notSet: "Not set",
      yes: "Yes",
      no: "No",
      retiredSuffix: " (retired)",
      unavailableOption: id => `Unavailable / retired option (${id})`,
      unavailableUser: id => `Unavailable / historical (${id})`,
    },
    facet: {
      unavailableOption: value => `Unavailable option (${value})`,
    },
    saveNotConfirmed: "The save could not be confirmed. Your draft is preserved.",
    validation: {
      requiredCleared: "A required field cannot be cleared.",
      checkboxValue: "Choose a checkbox value.",
      genericValue: "Enter a valid value.",
      tooLong: limit => `Use at most ${limit} characters.`,
      numberFormat: "Enter a decimal number without exponent notation.",
      dateFormat: "Choose a valid calendar date.",
      urlFormat: "Enter an HTTP or HTTPS URL.",
      emailFormat: "Enter a valid email address.",
    },
    panel: {
      regionLabel: "Custom fields",
      manageFields: "Manage fields",
      loadingLabel: "Loading custom fields",
      unavailable: "Custom fields unavailable.",
      retry: "Retry custom fields",
      empty: "No custom fields shown on this record.",
      directoryUnavailable: "User directory unavailable.",
      retryDirectory: "Retry user directory",
      directoryUnavailableValue: value => `User directory unavailable (${value})`,
      directoryLoadingValue: value => `Loading user… (${value})`,
      draftMismatch: type => `This field changed or is no longer visible. Your draft uses ${type}. Cancel to load the current definition.`,
      setToNo: "Set to No",
      chooseOption: "Choose an option",
      checkValue: "Check this value.",
      lastSaved: "Last saved:",
      saved: "Saved.",
      clear: "Clear",
      editAria: label => `Edit ${label}`,
      saveAria: label => `Save ${label}`,
      clearAria: label => `Clear ${label}`,
    },
    list: {
      regionLabel: "Custom field settings",
      title: "Custom fields",
      description: "Manage record properties for your workspace.",
      newField: "New field",
      entityGroupLabel: "Field entity",
      searchPlaceholder: "Search fields…",
      searchLabel: "Search custom fields",
      includeArchived: "Include archived fields",
      loadingLabel: "Loading fields",
      unavailable: "Fields unavailable.",
      retry: "Retry fields",
      noMatch: "No fields match your search.",
      noneYet: entityLower => `No ${entityLower} fields yet.`,
      archivedSuffix: " (archived)",
      requiredSuffix: " · Required",
      placementSheet: "Sheet",
      placementTable: "Table",
      placementFilter: "Filter",
      placementHidden: "Hidden from record layouts",
      restoreAria: label => `Restore field ${label}`,
      moveUpAria: label => `Move field ${label} up`,
      moveDownAria: label => `Move field ${label} down`,
      editAria: label => `Edit field ${label}`,
      archiveAria: label => `Archive field ${label}`,
      fieldArchived: "Field archived. Stored values are preserved.",
      fieldRestored: "Field restored.",
      orderSaved: "Field order saved.",
      changeFailed: "The change could not be confirmed.",
      clearSearchHint: "Clear the search to reorder all active fields.",
      savingChanges: "Saving changes…",
      returnToRecords: "Return to records",
    },
    form: {
      editTitle: "Edit field",
      newTitle: "New field",
      description: entityLower => `Configure a ${entityLower} custom field. Changes apply across this workspace.`,
      formLabel: "Field definition",
      fieldLabel: "Field label",
      entityImmutable: "Entity (immutable)",
      keyImmutable: "Key (immutable)",
      fieldKeyOptional: "Field key (optional)",
      keyPlaceholderFallback: "custom_field",
      enterExplicitKey: "Enter an explicit key",
      keyPreview: value => `Key preview: ${value}. The key cannot change after creation.`,
      fieldType: "Field type",
      typeChangeHint: "A type change is allowed only when the field has no stored values.",
      toggles: {
        required: "Required",
        showOnSheet: "Show on sheet",
        showOnTable: "Show on table",
        showOnFilter: "Show on filter",
      },
      filtersHint: "Filters support Select and User fields. Required prevents clearing a value; existing empty records remain allowed.",
      selectOptions: "Select options",
      optionLabelAria: position => `Option ${position} label`,
      moveOptionUpAria: position => `Move option ${position} up`,
      moveOptionDownAria: position => `Move option ${position} down`,
      archiveOptionAria: position => `Archive option ${position}`,
      addOption: "Add option",
      showArchivedOptions: "Show archived options",
      loadingArchivedOptions: "Loading archived options…",
      archivedOptionsUnavailable: "Archived options unavailable.",
      retryOptions: "Retry options",
      noArchivedOptions: "No archived options.",
      restoreOptionAria: label => `Restore option ${label}`,
      optionsHint: "Renaming, ordering, archiving and restoring options take effect when you save the field. Historical values retain their option IDs.",
      storedAgentMetadata: "Stored agent metadata",
      agentFilled: "Agent filled",
      agentBrief: "Agent brief",
      labelRequired: "Field label is required.",
      keyInvalid: "Enter a field key beginning with a lowercase letter, using letters, numbers and underscores.",
      optionsRequired: "A select field needs at least one option, and every option needs a label.",
      savingField: "Saving field…",
      unsavedChanges: "Keep editing or discard your unsaved field changes.",
      keepEditing: "Keep editing",
      discardChanges: "Discard changes",
      saveField: "Save field",
    },
  },
  vi: {
    actions: { edit: "Sửa", archive: "Lưu trữ", restore: "Khôi phục" },
    valueDisplay: {
      notSet: "Chưa đặt",
      yes: "Có",
      no: "Không",
      retiredSuffix: " (đã ngừng dùng)",
      unavailableOption: id => `Tùy chọn không khả dụng / đã ngừng dùng (${id})`,
      unavailableUser: id => `Không khả dụng / lịch sử (${id})`,
    },
    facet: {
      unavailableOption: value => `Tùy chọn không khả dụng (${value})`,
    },
    saveNotConfirmed: "Không xác nhận được việc lưu. Bản nháp của bạn vẫn được giữ.",
    validation: {
      requiredCleared: "Không thể xóa giá trị của trường bắt buộc.",
      checkboxValue: "Hãy chọn một giá trị hộp kiểm.",
      genericValue: "Hãy nhập một giá trị hợp lệ.",
      tooLong: limit => `Chỉ được dùng tối đa ${limit} ký tự.`,
      numberFormat: "Hãy nhập một số thập phân, không dùng ký hiệu mũ.",
      dateFormat: "Hãy chọn một ngày hợp lệ.",
      urlFormat: "Hãy nhập một URL bắt đầu bằng HTTP hoặc HTTPS.",
      emailFormat: "Hãy nhập một địa chỉ email hợp lệ.",
    },
    panel: {
      regionLabel: "Trường tùy chỉnh",
      manageFields: "Quản lý trường",
      loadingLabel: "Đang tải trường tùy chỉnh",
      unavailable: "Không tải được trường tùy chỉnh.",
      retry: "Thử lại trường tùy chỉnh",
      empty: "Bản ghi này không hiển thị trường tùy chỉnh nào.",
      directoryUnavailable: "Không tải được danh bạ người dùng.",
      retryDirectory: "Thử lại danh bạ người dùng",
      directoryUnavailableValue: value => `Không tải được danh bạ người dùng (${value})`,
      directoryLoadingValue: value => `Đang tải người dùng… (${value})`,
      draftMismatch: type => `Trường này đã thay đổi hoặc không còn hiển thị. Bản nháp của bạn dùng kiểu ${type}. Hãy hủy để tải lại định nghĩa hiện tại.`,
      setToNo: "Đặt thành Không",
      chooseOption: "Chọn một tùy chọn",
      checkValue: "Hãy kiểm tra lại giá trị này.",
      lastSaved: "Đã lưu lần cuối:",
      saved: "Đã lưu.",
      clear: "Xóa giá trị",
      editAria: label => `Sửa ${label}`,
      saveAria: label => `Lưu ${label}`,
      clearAria: label => `Xóa ${label}`,
    },
    list: {
      regionLabel: "Cài đặt trường tùy chỉnh",
      title: "Trường tùy chỉnh",
      description: "Quản lý các thuộc tính bản ghi cho không gian làm việc của bạn.",
      newField: "Trường mới",
      entityGroupLabel: "Loại thực thể",
      searchPlaceholder: "Tìm trường…",
      searchLabel: "Tìm trường tùy chỉnh",
      includeArchived: "Bao gồm trường đã lưu trữ",
      loadingLabel: "Đang tải trường",
      unavailable: "Không tải được trường.",
      retry: "Thử lại trường",
      noMatch: "Không có trường nào khớp với tìm kiếm của bạn.",
      noneYet: entityLower => `Chưa có trường nào cho ${entityLower}.`,
      archivedSuffix: " (đã lưu trữ)",
      requiredSuffix: " · Bắt buộc",
      placementSheet: "Bảng chi tiết",
      placementTable: "Bảng danh sách",
      placementFilter: "Bộ lọc",
      placementHidden: "Ẩn khỏi các bố cục bản ghi",
      restoreAria: label => `Khôi phục trường ${label}`,
      moveUpAria: label => `Di chuyển trường ${label} lên`,
      moveDownAria: label => `Di chuyển trường ${label} xuống`,
      editAria: label => `Sửa trường ${label}`,
      archiveAria: label => `Lưu trữ trường ${label}`,
      fieldArchived: "Đã lưu trữ trường. Giá trị đã lưu vẫn được giữ lại.",
      fieldRestored: "Đã khôi phục trường.",
      orderSaved: "Đã lưu thứ tự trường.",
      changeFailed: "Không xác nhận được thay đổi.",
      clearSearchHint: "Xóa tìm kiếm để sắp xếp lại tất cả trường đang hoạt động.",
      savingChanges: "Đang lưu thay đổi…",
      returnToRecords: "Quay lại bản ghi",
    },
    form: {
      editTitle: "Sửa trường",
      newTitle: "Trường mới",
      description: entityLower => `Cấu hình một trường tùy chỉnh cho ${entityLower}. Thay đổi áp dụng cho toàn bộ không gian làm việc.`,
      formLabel: "Định nghĩa trường",
      fieldLabel: "Nhãn trường",
      entityImmutable: "Thực thể (không đổi)",
      keyImmutable: "Khóa (không đổi)",
      fieldKeyOptional: "Khóa trường (tùy chọn)",
      keyPlaceholderFallback: "custom_field",
      enterExplicitKey: "Nhập một khóa cụ thể",
      keyPreview: value => `Xem trước khóa: ${value}. Khóa không thể thay đổi sau khi tạo.`,
      fieldType: "Kiểu trường",
      typeChangeHint: "Chỉ có thể đổi kiểu khi trường chưa có giá trị nào được lưu.",
      toggles: {
        required: "Bắt buộc",
        showOnSheet: "Hiện trên bảng chi tiết",
        showOnTable: "Hiện trên bảng danh sách",
        showOnFilter: "Hiện trên bộ lọc",
      },
      filtersHint: "Bộ lọc chỉ hỗ trợ trường Lựa chọn và Người dùng. Bắt buộc ngăn việc xóa giá trị; bản ghi trống hiện có vẫn được giữ nguyên.",
      selectOptions: "Tùy chọn lựa chọn",
      optionLabelAria: position => `Nhãn tùy chọn ${position}`,
      moveOptionUpAria: position => `Di chuyển tùy chọn ${position} lên`,
      moveOptionDownAria: position => `Di chuyển tùy chọn ${position} xuống`,
      archiveOptionAria: position => `Lưu trữ tùy chọn ${position}`,
      addOption: "Thêm tùy chọn",
      showArchivedOptions: "Hiện tùy chọn đã lưu trữ",
      loadingArchivedOptions: "Đang tải tùy chọn đã lưu trữ…",
      archivedOptionsUnavailable: "Không tải được tùy chọn đã lưu trữ.",
      retryOptions: "Thử lại tùy chọn",
      noArchivedOptions: "Không có tùy chọn nào đã lưu trữ.",
      restoreOptionAria: label => `Khôi phục tùy chọn ${label}`,
      optionsHint: "Đổi tên, sắp xếp, lưu trữ và khôi phục tùy chọn sẽ có hiệu lực khi bạn lưu trường. Giá trị lịch sử vẫn giữ nguyên ID tùy chọn.",
      storedAgentMetadata: "Siêu dữ liệu tác nhân đã lưu",
      agentFilled: "Do tác nhân điền",
      agentBrief: "Tóm tắt cho tác nhân",
      labelRequired: "Nhãn trường là bắt buộc.",
      keyInvalid: "Hãy nhập khóa trường bắt đầu bằng chữ thường, chỉ gồm chữ, số và dấu gạch dưới.",
      optionsRequired: "Trường lựa chọn cần ít nhất một tùy chọn, và mỗi tùy chọn cần có nhãn.",
      savingField: "Đang lưu trường…",
      unsavedChanges: "Tiếp tục chỉnh sửa hoặc hủy các thay đổi trường chưa lưu.",
      keepEditing: "Tiếp tục chỉnh sửa",
      discardChanges: "Hủy thay đổi",
      saveField: "Lưu trường",
    },
  },
};
