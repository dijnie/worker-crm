import type { AppLocale } from "../config";

/**
 * Every reason a manual property edit or create-form submission can be
 * rejected before it reaches the API. `form-values.ts` and `property-values.ts`
 * attach one of these to the `RecordFieldError` they throw, so the thrown
 * `Error.message` stays the exact English text developers and tests see,
 * while the component that catches it shows the matching dictionary string.
 */
export type RecordFieldErrorReason =
  | "readOnly"
  | "required"
  | "idTooLong"
  | "nameTooLong"
  | "valueTooLong"
  | "invalidEmail"
  | "invalidCurrency"
  | "invalidDateFormat"
  | "invalidDateValue"
  | "invalidAmountFormat"
  | "amountOutOfRange"
  | "domainTooLong"
  | "invalidDomain"
  | "requiredName"
  | "requiredCompany"
  | "requiredOwner"
  | "requiredFirstName"
  | "invalidEmailAddress"
  | "invalidCurrencyFormat"
  | "roleTooLong"
  | "contactRequired";

/** Why a record link in the URL could not be opened. */
export type RecordLinkErrorReason = "invalid" | "tooDeep" | "crossOrigin" | "openFailed";

export interface RecordSheetDictionary {
  common: {
    notSet: string;
    unassigned: string;
    none: string;
    archived: string;
    stay: string;
    discard: string;
    saveAndClose: string;
    edit: string;
    changeStage: string;
    unavailableHistorical: (value: string) => string;
  };
  /** Field labels shared by the create form and the property panel. */
  properties: Record<string, string>;
  /** Labels for the read-only system information keys shown on every sheet. */
  systemFields: Record<string, string>;
  /** User-facing text for every reason a manual edit can be rejected. */
  validation: Record<RecordFieldErrorReason, string>;
  bulk: {
    reportSummary: (succeeded: number, failed: number) => string;
    failedRetryHint: string;
    assignOwner: string;
    assignCompany: string;
    restoreSelected: string;
    archiveSelected: string;
    ownerLabel: string;
    dialogTitle: { owner: string; company: string; restore: string; archive: string };
    applyTo: (count: number, entityLower: string, names: string, truncated: boolean) => string;
    restoreDescription: string;
    archiveDescription: string;
    working: string;
    applyAssignment: string;
    restore: string;
    archive: string;
    stoppedAccessChanged: string;
    accessChangedRetry: string;
    operationFailed: string;
  };
  form: {
    permissionDenied: string;
    dealHint: (stageName: string) => string;
    companyHint: string;
    addEntity: (entityLower: string) => string;
    newEntity: (entityLower: string) => string;
    createDescription: (entityLower: string) => string;
    createFailed: string;
  };
  picker: {
    permissionDenied: string;
    searchAria: (labelLower: string) => string;
    searchPlaceholder: (labelLower: string) => string;
    chooseOption: (labelLower: string) => string;
    previousAria: (labelLower: string) => string;
    nextAria: (labelLower: string) => string;
    previous: string;
    next: string;
    retryDirectory: string;
    loadingOptions: string;
    refreshingOptions: string;
    available: (countText: string) => string;
  };
  stageChange: {
    description: (count: number, dealWord: string) => string;
    stageLabel: string;
    reasonLabel: (required: boolean) => string;
    reasonAria: string;
    lostReasonRequired: string;
    reasonTooLong: string;
    updating: string;
    updateStage: string;
    confirmCloseTitle: string;
  };
  actions: {
    updating: string;
    restoreRecord: string;
    archiveRecord: string;
    restored: string;
    archived: string;
    archiveTitle: (entityLower: string) => string;
    archiveDescription: string;
    archiving: string;
  };
  inlineField: {
    lastSaved: (value: string) => string;
    editAria: (labelLower: string) => string;
    saveAria: (labelLower: string) => string;
  };
  propertyPanel: {
    sectionTitle: string;
    sectionAria: string;
    systemInfo: string;
  };
  relatedRecords: {
    confirmCloseTitle: string;
    noItems: (titleLower: string) => string;
    roleText: (role: string) => string;
    attachExistingContact: string;
    detachContactTitle: string;
    detachContactDescription: string;
    detachButton: (name: string) => string;
    detachContact: string;
    detaching: string;
    attachDialogTitle: string;
    attachDialogDescription: string;
    searchHint: string;
    roleFieldLabel: string;
    roleAria: string;
    attaching: string;
    attachContact: string;
    participantLabel: string;
    contactsAria: string;
    noContactsAttached: string;
    createDialogDescription: (entityLower: string) => string;
    editRoleAria: (name: string) => string;
    roleForLabel: (name: string) => string;
  };
  sheet: {
    loadingAria: (entityLower: string) => string;
    refreshing: (entityLower: string) => string;
    retry: (entityLower: string) => string;
    notFound: (entitySingular: string) => string;
    loadFailed: (entityLower: string) => string;
    directoryUnavailable: string;
    retryDirectory: string;
    ownerLabel: string;
    employerLabel: string;
    stageLabel: string;
    closeDateLabel: string;
  };
  company: {
    primaryContactTitle: string;
    employedContactsTitle: string;
    prose: string;
  };
  contact: {
    employerTitle: string;
    primaryContactOfTitle: string;
    associatedDealsTitle: string;
    prose: string;
  };
  host: {
    navigation: Record<RecordLinkErrorReason, string>;
    title: (entitySingular: string) => string;
    invalidTitle: string;
    description: (count: number) => string;
    descriptionSingle: string;
    closeAll: string;
    backToPrevious: string;
    closeRecord: string;
    closeRecordSheet: string;
    closeInvalidLink: string;
    permissionDenied: string;
    contentAria: string;
    propertiesTab: string;
    timelineTab: string;
    timelineRegionAria: string;
    propertiesRegionAria: string;
    unsavedTitle: string;
    unsavedDescription: string;
    saveChanges: string;
    savePartialFailure: string;
    saveFailedGeneric: string;
    archivedSuffix: string;
    loadToViewTimeline: string;
  };
}

const properties: Record<AppLocale, Record<string, string>> = {
  en: {
    name: "Name", firstName: "First name", lastName: "Last name", domain: "Domain", website: "Website",
    description: "Description", industry: "Industry", city: "City", stateCode: "State / region", country: "Country",
    phone: "Phone", email: "Email", linkedinUrl: "LinkedIn URL", twitterUrl: "Twitter URL", githubUrl: "GitHub URL",
    title: "Title", amount: "Amount", currency: "Currency", expectedCloseDate: "Expected close date", ownerId: "Owner",
    primaryContactId: "Primary contact",
  },
  vi: {
    name: "Tên", firstName: "Tên", lastName: "Họ", domain: "Tên miền", website: "Trang web",
    description: "Mô tả", industry: "Ngành", city: "Thành phố", stateCode: "Tỉnh / bang", country: "Quốc gia",
    phone: "Điện thoại", email: "Email", linkedinUrl: "URL LinkedIn", twitterUrl: "URL Twitter", githubUrl: "URL GitHub",
    title: "Chức danh", amount: "Số tiền", currency: "Loại tiền tệ", expectedCloseDate: "Ngày dự kiến chốt", ownerId: "Chủ sở hữu",
    primaryContactId: "Liên hệ chính",
  },
};

const systemFields: Record<AppLocale, Record<string, string>> = {
  en: {
    id: "Id", createdAt: "Created At", updatedAt: "Updated At", lastActivityAt: "Last Activity At", archivedAt: "Archived At",
    source: "Source", enrichmentStatus: "Enrichment Status", enrichmentError: "Enrichment Error", enrichedAt: "Enriched At",
    logoUrl: "Logo Url", logoDarkUrl: "Logo Dark Url", iconUrl: "Icon Url", iconDarkUrl: "Icon Dark Url", iconTone: "Icon Tone",
    brandColor: "Brand Color", subIndustry: "Sub Industry", countryCode: "Country Code", twitterUrl: "Twitter Url",
    githubUrl: "Github Url", pricingUrl: "Pricing Url", careersUrl: "Careers Url", seniority: "Seniority", function: "Function",
    imageUrl: "Image Url", socialsCheckedAt: "Socials Checked At", closedAt: "Closed At", closedReason: "Closed Reason",
    baseAmount: "Base Amount", baseCurrency: "Base Currency", fxRate: "Fx Rate", fxRateAt: "Fx Rate At", stageChangedAt: "Stage Changed At",
  },
  vi: {
    id: "Mã", createdAt: "Ngày tạo", updatedAt: "Ngày cập nhật", lastActivityAt: "Hoạt động gần nhất", archivedAt: "Ngày lưu trữ",
    source: "Nguồn", enrichmentStatus: "Trạng thái làm giàu dữ liệu", enrichmentError: "Lỗi làm giàu dữ liệu", enrichedAt: "Ngày làm giàu dữ liệu",
    logoUrl: "URL logo", logoDarkUrl: "URL logo (nền tối)", iconUrl: "URL biểu tượng", iconDarkUrl: "URL biểu tượng (nền tối)", iconTone: "Tông màu biểu tượng",
    brandColor: "Màu thương hiệu", subIndustry: "Ngành phụ", countryCode: "Mã quốc gia", twitterUrl: "URL Twitter",
    githubUrl: "URL GitHub", pricingUrl: "URL bảng giá", careersUrl: "URL tuyển dụng", seniority: "Cấp bậc", function: "Chức năng",
    imageUrl: "URL ảnh", socialsCheckedAt: "Ngày kiểm tra mạng xã hội", closedAt: "Ngày đóng", closedReason: "Lý do đóng",
    baseAmount: "Số tiền quy đổi", baseCurrency: "Tiền tệ quy đổi", fxRate: "Tỷ giá", fxRateAt: "Ngày áp dụng tỷ giá", stageChangedAt: "Ngày đổi giai đoạn",
  },
};

const validation: Record<AppLocale, Record<RecordFieldErrorReason, string>> = {
  en: {
    readOnly: "This property is read-only.",
    required: "String must contain at least 1 character(s)",
    idTooLong: "String must contain at most 200 character(s)",
    nameTooLong: "String must contain at most 1000 character(s)",
    valueTooLong: "String must contain at most 100000 character(s)",
    invalidEmail: "Invalid email",
    invalidCurrency: "Expected a three-letter currency code",
    invalidDateFormat: "Expected a valid date or ISO timestamp with timezone",
    invalidDateValue: "Choose a valid date.",
    invalidAmountFormat: "Amount must be nonnegative with at most two decimal places.",
    amountOutOfRange: "Amount exceeds the supported range.",
    domainTooLong: "Domain must be at most 2048 characters.",
    invalidDomain: "Expected a valid company domain.",
    requiredName: "name is required.",
    requiredCompany: "company is required.",
    requiredOwner: "owner is required.",
    requiredFirstName: "First name is required.",
    invalidEmailAddress: "Enter a valid email address.",
    invalidCurrencyFormat: "Currency must be a three-letter code.",
    roleTooLong: "Role must be at most 80 characters.",
    contactRequired: "Choose a contact.",
  },
  vi: {
    readOnly: "Thuộc tính này chỉ đọc.",
    required: "Cần nhập ít nhất 1 ký tự.",
    idTooLong: "Không được vượt quá 200 ký tự.",
    nameTooLong: "Không được vượt quá 1000 ký tự.",
    valueTooLong: "Không được vượt quá 100000 ký tự.",
    invalidEmail: "Email không hợp lệ.",
    invalidCurrency: "Cần một mã tiền tệ gồm ba chữ cái.",
    invalidDateFormat: "Cần một ngày hoặc dấu thời gian ISO hợp lệ kèm múi giờ.",
    invalidDateValue: "Hãy chọn một ngày hợp lệ.",
    invalidAmountFormat: "Số tiền phải không âm và có tối đa hai chữ số thập phân.",
    amountOutOfRange: "Số tiền vượt quá giới hạn được hỗ trợ.",
    domainTooLong: "Tên miền tối đa 2048 ký tự.",
    invalidDomain: "Hãy nhập tên miền công ty hợp lệ.",
    requiredName: "cần nhập tên.",
    requiredCompany: "cần chọn công ty.",
    requiredOwner: "cần chọn chủ sở hữu.",
    requiredFirstName: "Cần nhập tên riêng.",
    invalidEmailAddress: "Hãy nhập địa chỉ email hợp lệ.",
    invalidCurrencyFormat: "Tiền tệ phải là mã gồm ba chữ cái.",
    roleTooLong: "Vai trò tối đa 80 ký tự.",
    contactRequired: "Hãy chọn một liên hệ.",
  },
};

export const recordSheet: Record<AppLocale, RecordSheetDictionary> = {
  en: {
    common: {
      notSet: "Not set",
      unassigned: "Unassigned",
      none: "None",
      archived: "Archived",
      stay: "Stay",
      discard: "Discard",
      saveAndClose: "Save and close",
      edit: "Edit",
      changeStage: "Change stage",
      unavailableHistorical: value => `Unavailable / historical (${value})`,
    },
    properties: properties.en,
    systemFields: systemFields.en,
    validation: validation.en,
    bulk: {
      reportSummary: (succeeded, failed) => `${succeeded} succeeded; ${failed} failed.`,
      failedRetryHint: "Failed records remain selected. Choose the action again to retry.",
      assignOwner: "Assign owner",
      assignCompany: "Assign company",
      restoreSelected: "Restore selected",
      archiveSelected: "Archive selected",
      ownerLabel: "Owner",
      dialogTitle: { owner: "Assign owner", company: "Assign company", restore: "Restore records", archive: "Archive records" },
      applyTo: (count, entityLower, names, truncated) => `Apply to ${count} selected ${entityLower}${count === 1 ? "" : "s"}: ${names}${truncated ? "…" : ""}.`,
      restoreDescription: "Records will return to the active list.",
      archiveDescription: "Records will move to the archived list and can be restored.",
      working: "Working…",
      applyAssignment: "Apply assignment",
      restore: "Restore",
      archive: "Archive",
      stoppedAccessChanged: "Stopped because workspace access changed.",
      accessChangedRetry: "Workspace access changed; refresh before retrying.",
      operationFailed: "Operation failed",
    },
    form: {
      permissionDenied: "Your role cannot create this record. Creating deals also requires Company Read.",
      dealHint: stageName => `New deals start at ${stageName}. Amounts are stored exactly in the selected currency.`,
      companyHint: "Choosing a primary contact leaves their employer unchanged. Domains and email addresses are normalized when saved.",
      addEntity: entityLower => `Add ${entityLower}`,
      newEntity: entityLower => `New ${entityLower}`,
      createDescription: entityLower => `Add a ${entityLower} to your workspace.`,
      createFailed: "Could not create the record.",
    },
    picker: {
      permissionDenied: "Your role cannot select this linked record.",
      searchAria: labelLower => `Search ${labelLower}`,
      searchPlaceholder: labelLower => `Search ${labelLower}…`,
      chooseOption: labelLower => `Choose ${labelLower}`,
      previousAria: labelLower => `Previous ${labelLower} options`,
      nextAria: labelLower => `Next ${labelLower} options`,
      previous: "Previous",
      next: "Next",
      retryDirectory: "Retry directory",
      loadingOptions: "Loading options",
      refreshingOptions: "Refreshing options…",
      available: countText => `${countText} available`,
    },
    stageChange: {
      description: (count, dealWord) => `Update ${count} selected ${dealWord}. Each transition is recorded in its activity history.`,
      stageLabel: "Stage",
      reasonLabel: required => `Reason${required ? " *" : " (optional)"}`,
      reasonAria: "Reason",
      lostReasonRequired: "A lost deal needs a reason.",
      reasonTooLong: "Reason must be at most 100000 characters.",
      updating: "Updating…",
      updateStage: "Update stage",
      confirmCloseTitle: "Save the stage change before closing?",
    },
    actions: {
      updating: "Updating…",
      restoreRecord: "Restore record",
      archiveRecord: "Archive record",
      restored: "Record restored.",
      archived: "Record archived.",
      archiveTitle: entityLower => `Archive ${entityLower}?`,
      archiveDescription: "The record stays available in archived views and can be restored.",
      archiving: "Archiving…",
    },
    inlineField: {
      lastSaved: value => `Last saved: ${value}`,
      editAria: labelLower => `Edit ${labelLower}`,
      saveAria: labelLower => `Save ${labelLower}`,
    },
    propertyPanel: {
      sectionTitle: "Properties",
      sectionAria: "Record properties",
      systemInfo: "System information",
    },
    relatedRecords: {
      confirmCloseTitle: "Save your changes before closing?",
      noItems: titleLower => `No ${titleLower}.`,
      roleText: role => `Role: ${role}`,
      attachExistingContact: "Attach existing contact",
      detachContactTitle: "Detach contact?",
      detachContactDescription: "This removes their participation in this deal. Their employer and other records stay unchanged.",
      detachButton: name => `Detach ${name}`,
      detachContact: "Detach contact",
      detaching: "Detaching…",
      attachDialogTitle: "Attach contact",
      attachDialogDescription: "Add a participant independently of their employer.",
      searchHint: "Search all active contacts, including people at other companies.",
      roleFieldLabel: "Role (optional)",
      roleAria: "Participant role",
      attaching: "Attaching…",
      attachContact: "Attach contact",
      participantLabel: "Participant",
      contactsAria: "Deal contacts",
      noContactsAttached: "No contacts attached.",
      createDialogDescription: entityLower => `Add a ${entityLower} with this company's defaults.`,
      editRoleAria: name => `Edit role for ${name}`,
      roleForLabel: name => `Role for ${name}`,
    },
    sheet: {
      loadingAria: entityLower => `Loading ${entityLower}`,
      refreshing: entityLower => `Refreshing ${entityLower}…`,
      retry: entityLower => `Retry ${entityLower}`,
      notFound: entitySingular => `${entitySingular} not found.`,
      loadFailed: entityLower => `Could not load ${entityLower}.`,
      directoryUnavailable: "Owner directory unavailable.",
      retryDirectory: "Retry directory",
      ownerLabel: "Owner",
      employerLabel: "Employer",
      stageLabel: "Stage",
      closeDateLabel: "Close date",
    },
    company: {
      primaryContactTitle: "Primary contact",
      employedContactsTitle: "Employed contacts",
      prose: "Primary contact and employer are independent.",
    },
    contact: {
      employerTitle: "Employer",
      primaryContactOfTitle: "Primary contact of",
      associatedDealsTitle: "Associated deals",
      prose: "Changing employer preserves primary-contact relationships and deal participation.",
    },
    host: {
      navigation: {
        invalid: "This record link is invalid. Close it and open the record again.",
        tooDeep: "A record link can contain at most ten records.",
        crossOrigin: "Record links must stay in this workspace.",
        openFailed: "Could not open record.",
      },
      title: entitySingular => `${entitySingular} record`,
      invalidTitle: "Invalid record link",
      description: count => `${count} linked records open. Properties, relationships and activity history.`,
      descriptionSingle: "Properties, relationships and activity history.",
      closeAll: "Close all",
      backToPrevious: "Back to previous record",
      closeRecord: "Close record",
      closeRecordSheet: "Close record sheet",
      closeInvalidLink: "Close invalid link",
      permissionDenied: "Your role cannot read this record.",
      contentAria: "Record content",
      propertiesTab: "Properties & relations",
      timelineTab: "Timeline",
      timelineRegionAria: "Record timeline",
      propertiesRegionAria: "Record properties and relationships",
      unsavedTitle: "Unsaved changes",
      unsavedDescription: "Save your changes before leaving this record, discard them, or stay and keep editing.",
      saveChanges: "Save changes",
      savePartialFailure: "Some changes could not be saved. Stay on this record to review the field errors.",
      saveFailedGeneric: "Changes could not be saved.",
      archivedSuffix: " (archived)",
      loadToViewTimeline: "Load the record to view its timeline.",
    },
  },
  vi: {
    common: {
      notSet: "Chưa đặt",
      unassigned: "Chưa gán",
      none: "Không có",
      archived: "Đã lưu trữ",
      stay: "Ở lại",
      discard: "Bỏ thay đổi",
      saveAndClose: "Lưu và đóng",
      edit: "Sửa",
      changeStage: "Đổi giai đoạn",
      unavailableHistorical: value => `Không còn khả dụng / lịch sử (${value})`,
    },
    properties: properties.vi,
    systemFields: systemFields.vi,
    validation: validation.vi,
    bulk: {
      reportSummary: (succeeded, failed) => `${succeeded} thành công; ${failed} thất bại.`,
      failedRetryHint: "Các bản ghi lỗi vẫn đang được chọn. Hãy chọn lại thao tác để thử lại.",
      assignOwner: "Gán chủ sở hữu",
      assignCompany: "Gán công ty",
      restoreSelected: "Khôi phục mục đã chọn",
      archiveSelected: "Lưu trữ mục đã chọn",
      ownerLabel: "Chủ sở hữu",
      dialogTitle: { owner: "Gán chủ sở hữu", company: "Gán công ty", restore: "Khôi phục bản ghi", archive: "Lưu trữ bản ghi" },
      applyTo: (count, entityLower, names, truncated) => `Áp dụng cho ${count} ${entityLower} đã chọn: ${names}${truncated ? "…" : ""}.`,
      restoreDescription: "Các bản ghi sẽ quay lại danh sách đang hoạt động.",
      archiveDescription: "Các bản ghi sẽ chuyển sang danh sách lưu trữ và có thể khôi phục.",
      working: "Đang xử lý…",
      applyAssignment: "Áp dụng gán",
      restore: "Khôi phục",
      archive: "Lưu trữ",
      stoppedAccessChanged: "Đã dừng vì quyền truy cập không gian làm việc đã thay đổi.",
      accessChangedRetry: "Quyền truy cập không gian làm việc đã thay đổi; hãy tải lại trước khi thử lại.",
      operationFailed: "Thao tác thất bại",
    },
    form: {
      permissionDenied: "Vai trò của bạn không được tạo bản ghi này. Tạo giao dịch cũng cần quyền đọc công ty.",
      dealHint: stageName => `Giao dịch mới bắt đầu ở giai đoạn ${stageName}. Số tiền được lưu chính xác theo loại tiền tệ đã chọn.`,
      companyHint: "Chọn liên hệ chính không làm thay đổi nơi làm việc của họ. Tên miền và địa chỉ email được chuẩn hóa khi lưu.",
      addEntity: entityLower => `Thêm ${entityLower}`,
      newEntity: entityLower => `${entityLower} mới`,
      createDescription: entityLower => `Thêm một ${entityLower} vào không gian làm việc của bạn.`,
      createFailed: "Không tạo được bản ghi.",
    },
    picker: {
      permissionDenied: "Vai trò của bạn không được chọn bản ghi liên kết này.",
      searchAria: labelLower => `Tìm ${labelLower}`,
      searchPlaceholder: labelLower => `Tìm ${labelLower}…`,
      chooseOption: labelLower => `Chọn ${labelLower}`,
      previousAria: labelLower => `Tùy chọn ${labelLower} trước`,
      nextAria: labelLower => `Tùy chọn ${labelLower} sau`,
      previous: "Trước",
      next: "Sau",
      retryDirectory: "Thử lại danh bạ",
      loadingOptions: "Đang tải tùy chọn",
      refreshingOptions: "Đang làm mới tùy chọn…",
      available: countText => `${countText} khả dụng`,
    },
    stageChange: {
      description: (count, dealWord) => `Cập nhật ${count} ${dealWord} đã chọn. Mỗi lần chuyển giai đoạn đều được ghi lại trong lịch sử hoạt động.`,
      stageLabel: "Giai đoạn",
      reasonLabel: required => `Lý do${required ? " *" : " (tùy chọn)"}`,
      reasonAria: "Lý do",
      lostReasonRequired: "Giao dịch thất bại cần có lý do.",
      reasonTooLong: "Lý do tối đa 100000 ký tự.",
      updating: "Đang cập nhật…",
      updateStage: "Cập nhật giai đoạn",
      confirmCloseTitle: "Lưu thay đổi giai đoạn trước khi đóng?",
    },
    actions: {
      updating: "Đang cập nhật…",
      restoreRecord: "Khôi phục bản ghi",
      archiveRecord: "Lưu trữ bản ghi",
      restored: "Đã khôi phục bản ghi.",
      archived: "Đã lưu trữ bản ghi.",
      archiveTitle: entityLower => `Lưu trữ ${entityLower}?`,
      archiveDescription: "Bản ghi vẫn xem được ở danh sách lưu trữ và có thể khôi phục.",
      archiving: "Đang lưu trữ…",
    },
    inlineField: {
      lastSaved: value => `Đã lưu lần cuối: ${value}`,
      editAria: labelLower => `Sửa ${labelLower}`,
      saveAria: labelLower => `Lưu ${labelLower}`,
    },
    propertyPanel: {
      sectionTitle: "Thuộc tính",
      sectionAria: "Thuộc tính bản ghi",
      systemInfo: "Thông tin hệ thống",
    },
    relatedRecords: {
      confirmCloseTitle: "Lưu thay đổi trước khi đóng?",
      noItems: titleLower => `Không có ${titleLower}.`,
      roleText: role => `Vai trò: ${role}`,
      attachExistingContact: "Gắn liên hệ đã có",
      detachContactTitle: "Gỡ liên hệ?",
      detachContactDescription: "Thao tác này gỡ sự tham gia của họ khỏi giao dịch này. Nơi làm việc và các bản ghi khác của họ không đổi.",
      detachButton: name => `Gỡ ${name}`,
      detachContact: "Gỡ liên hệ",
      detaching: "Đang gỡ…",
      attachDialogTitle: "Gắn liên hệ",
      attachDialogDescription: "Thêm người tham gia độc lập với nơi làm việc của họ.",
      searchHint: "Tìm trong mọi liên hệ đang hoạt động, kể cả người ở công ty khác.",
      roleFieldLabel: "Vai trò (tùy chọn)",
      roleAria: "Vai trò người tham gia",
      attaching: "Đang gắn…",
      attachContact: "Gắn liên hệ",
      participantLabel: "Người tham gia",
      contactsAria: "Liên hệ của giao dịch",
      noContactsAttached: "Chưa có liên hệ nào được gắn.",
      createDialogDescription: entityLower => `Thêm một ${entityLower} với giá trị mặc định của công ty này.`,
      editRoleAria: name => `Sửa vai trò của ${name}`,
      roleForLabel: name => `Vai trò của ${name}`,
    },
    sheet: {
      loadingAria: entityLower => `Đang tải ${entityLower}`,
      refreshing: entityLower => `Đang làm mới ${entityLower}…`,
      retry: entityLower => `Thử lại ${entityLower}`,
      notFound: entitySingular => `Không tìm thấy ${entitySingular.toLowerCase()}.`,
      loadFailed: entityLower => `Không tải được ${entityLower}.`,
      directoryUnavailable: "Danh bạ chủ sở hữu không khả dụng.",
      retryDirectory: "Thử lại danh bạ",
      ownerLabel: "Chủ sở hữu",
      employerLabel: "Nơi làm việc",
      stageLabel: "Giai đoạn",
      closeDateLabel: "Ngày chốt",
    },
    company: {
      primaryContactTitle: "Liên hệ chính",
      employedContactsTitle: "Liên hệ đang làm việc",
      prose: "Liên hệ chính và nơi làm việc là độc lập với nhau.",
    },
    contact: {
      employerTitle: "Nơi làm việc",
      primaryContactOfTitle: "Liên hệ chính của",
      associatedDealsTitle: "Giao dịch liên quan",
      prose: "Đổi nơi làm việc vẫn giữ nguyên quan hệ liên hệ chính và sự tham gia giao dịch.",
    },
    host: {
      navigation: {
        invalid: "Liên kết bản ghi này không hợp lệ. Hãy đóng và mở lại bản ghi.",
        tooDeep: "Một liên kết bản ghi chứa tối đa mười bản ghi.",
        crossOrigin: "Liên kết bản ghi phải nằm trong không gian làm việc này.",
        openFailed: "Không mở được bản ghi.",
      },
      title: entitySingular => `Bản ghi ${entitySingular.toLowerCase()}`,
      invalidTitle: "Liên kết bản ghi không hợp lệ",
      description: count => `${count} bản ghi liên kết đang mở. Thuộc tính, quan hệ và lịch sử hoạt động.`,
      descriptionSingle: "Thuộc tính, quan hệ và lịch sử hoạt động.",
      closeAll: "Đóng tất cả",
      backToPrevious: "Quay lại bản ghi trước",
      closeRecord: "Đóng bản ghi",
      closeRecordSheet: "Đóng bảng bản ghi",
      closeInvalidLink: "Đóng liên kết không hợp lệ",
      permissionDenied: "Vai trò của bạn không được đọc bản ghi này.",
      contentAria: "Nội dung bản ghi",
      propertiesTab: "Thuộc tính & quan hệ",
      timelineTab: "Dòng thời gian",
      timelineRegionAria: "Dòng thời gian bản ghi",
      propertiesRegionAria: "Thuộc tính và quan hệ của bản ghi",
      unsavedTitle: "Thay đổi chưa lưu",
      unsavedDescription: "Hãy lưu thay đổi trước khi rời bản ghi này, bỏ thay đổi, hoặc ở lại để tiếp tục chỉnh sửa.",
      saveChanges: "Lưu thay đổi",
      savePartialFailure: "Một số thay đổi không lưu được. Ở lại bản ghi này để xem lỗi từng trường.",
      saveFailedGeneric: "Không lưu được thay đổi.",
      archivedSuffix: " (đã lưu trữ)",
      loadToViewTimeline: "Hãy tải bản ghi để xem dòng thời gian.",
    },
  },
};
