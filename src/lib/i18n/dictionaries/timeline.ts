import type { ActivityView } from "@/lib/api";
import type { AppLocale } from "../config";

export interface TimelineDictionary {
  entry: {
    /** Shown instead of a formatted timestamp when the date could not be read. */
    timeUnavailable: string;
    /** "{from stage} → {to stage}" for a stage-change activity. */
    stageTransition: (from: string, to: string) => string;
    stageTransitionUnavailable: string;
    /** The actor label for an activity whose creator no longer resolves in the directory. */
    unavailableActor: string;
    metadataUnavailable: string;
    storedDetailsSummary: string;
    emailThreadReference: (id: string) => string;
    calendarEventReference: (id: string) => string;
    /** The fallback button label for a related record whose name was not supplied. */
    relatedRecordFallback: (entityLabel: string, id: string) => string;
    relatedRecordsAriaLabel: string;
    untitled: string;
    task: {
      completed: string;
      dueDateUnavailable: string;
      noDueDate: string;
      overdue: string;
      due: string;
    };
  };
  actions: {
    reopenTask: string;
    completeTask: string;
    deleteActivity: string;
    updating: string;
    deleted: string;
    reopened: string;
    completed: string;
    deleteDialog: {
      title: string;
      description: (subject: string) => string;
      stageChangeNote: string;
      deleting: string;
      confirm: string;
    };
  };
  composer: {
    heading: string;
    shortcutHint: string;
    typeLabel: string;
    logEmailOption: string;
    emailHint: string;
    subjectLabel: (required: boolean) => string;
    subjectAria: string;
    bodyLabel: string;
    bodyAria: string;
    bodyPlaceholderCall: string;
    bodyPlaceholderDefault: string;
    occurredAtLabel: string;
    dueAtLabel: string;
    withOptional: (label: string) => string;
    formatAria: (label: string) => string;
    dateOnlyOption: string;
    dateTimeOption: string;
    timezoneHint: string;
    saving: string;
    addActivity: string;
    discardDraft: string;
    savedMessage: (typeLabel: string) => string;
    saveUnconfirmed: string;
    genericCheckFields: string;
    errors: {
      invalidType: string;
      tooLong: string;
      taskNeedsSubject: string;
      needsSubjectOrBody: string;
      invalidDateTime: string;
      invalidLocalDateTime: string;
      invalidDate: string;
      invalidLinkedRecord: string;
      checkFields: string;
    };
  };
  panel: {
    heading: string;
    refresh: string;
    sectionAriaLabel: string;
    viewsAriaLabel: string;
    views: Record<ActivityView, string>;
    countsFailed: string;
    countsRefreshing: string;
    directoryFailed: string;
    requestFailed: string;
    pendingCount: string;
    activityCreated: string;
    pinnedSectionAriaLabel: string;
    upcomingHeading: string;
    upcomingFailed: string;
    upcomingLoadingMore: string;
    upcomingRefreshing: string;
    upcomingLoading: string;
    noUpcoming: string;
    loadMoreUpcoming: string;
    timelineFailed: string;
    loadingMoreActivities: string;
    refreshingTimeline: string;
    loadingTimeline: string;
    dateUnavailable: string;
    noActivitiesInView: string;
    shownInUpcoming: string;
    loadMoreTasks: string;
    loadOlderActivities: string;
  };
}

export const timeline: Record<AppLocale, TimelineDictionary> = {
  en: {
    entry: {
      timeUnavailable: "Time unavailable",
      stageTransition: (from, to) => `${from} → ${to}`,
      stageTransitionUnavailable: "Stage transition details unavailable",
      unavailableActor: "Unavailable / historical actor",
      metadataUnavailable: "Stored metadata is unavailable.",
      storedDetailsSummary: "Stored activity details",
      emailThreadReference: id => `Email thread reference: ${id}`,
      calendarEventReference: id => `Calendar event reference: ${id}`,
      relatedRecordFallback: (entityLabel, id) => `${entityLabel} · ${id}`,
      relatedRecordsAriaLabel: "Activity related records",
      untitled: "Untitled",
      task: {
        completed: "Completed",
        dueDateUnavailable: "Due date unavailable",
        noDueDate: "No due date",
        overdue: "Overdue",
        due: "Due",
      },
    },
    actions: {
      reopenTask: "Reopen task",
      completeTask: "Complete task",
      deleteActivity: "Delete activity",
      updating: "Updating activity…",
      deleted: "Activity deleted.",
      reopened: "Task reopened.",
      completed: "Task completed.",
      deleteDialog: {
        title: "Delete activity",
        description: subject => `Delete “${subject}”? This removes the activity from all linked timelines. This cannot be undone.`,
        stageChangeNote: " Deleting this history entry does not change the deal’s current stage.",
        deleting: "Deleting…",
        confirm: "Delete",
      },
    },
    composer: {
      heading: "Log activity",
      shortcutHint: "Ctrl / ⌘ + Enter to save",
      typeLabel: "Activity type",
      logEmailOption: "Log email",
      emailHint: "Record an email in the CRM. This does not send an email.",
      subjectLabel: required => `Subject ${required ? "(required)" : "(optional)"}`,
      subjectAria: "Subject",
      bodyLabel: "Body",
      bodyAria: "Body",
      bodyPlaceholderCall: "Call outcome and notes",
      bodyPlaceholderDefault: "Activity notes",
      occurredAtLabel: "Occurred at",
      dueAtLabel: "Due date",
      withOptional: label => `${label} (optional)`,
      formatAria: label => `${label} format`,
      dateOnlyOption: "Date only (UTC)",
      dateTimeOption: "Date and time (local)",
      timezoneHint: "Leave occurrence blank for now. Dates use midnight UTC; date and time uses your local timezone.",
      saving: "Saving activity…",
      addActivity: "Add activity",
      discardDraft: "Discard draft",
      savedMessage: typeLabel => `${typeLabel} saved.`,
      saveUnconfirmed: "The save could not be confirmed. Check the timeline before trying again to avoid a duplicate.",
      genericCheckFields: "Check the activity fields.",
      errors: {
        invalidType: "Choose a manual activity type.",
        tooLong: "Use at most 100,000 characters.",
        taskNeedsSubject: "A task needs a subject.",
        needsSubjectOrBody: "Add a subject or notes before saving.",
        invalidDateTime: "Choose a valid date and time.",
        invalidLocalDateTime: "Choose a valid local date and time.",
        invalidDate: "Choose a valid date.",
        invalidLinkedRecord: "Choose a valid linked record.",
        checkFields: "Check the highlighted activity fields.",
      },
    },
    panel: {
      heading: "Timeline",
      refresh: "Refresh timeline",
      sectionAriaLabel: "Activity timeline",
      viewsAriaLabel: "Activity views",
      views: { all: "All", history: "History", notes: "Notes", upcoming: "Upcoming", done: "Done", email: "Email", meetings: "Meetings" },
      countsFailed: "Activity counts could not load.",
      countsRefreshing: "Refreshing activity counts…",
      directoryFailed: "Actor directory could not load. Historical IDs remain visible.",
      requestFailed: "Request failed.",
      pendingCount: "…",
      activityCreated: "Activity saved. The current view has been refreshed; use All to see every activity type.",
      pinnedSectionAriaLabel: "Pinned upcoming tasks",
      upcomingHeading: "Upcoming tasks",
      upcomingFailed: "Upcoming tasks could not load.",
      upcomingLoadingMore: "Loading more upcoming tasks…",
      upcomingRefreshing: "Refreshing upcoming tasks…",
      upcomingLoading: "Loading upcoming tasks…",
      noUpcoming: "No upcoming tasks.",
      loadMoreUpcoming: "Load more upcoming tasks",
      timelineFailed: "Timeline could not load.",
      loadingMoreActivities: "Loading more activities…",
      refreshingTimeline: "Refreshing timeline…",
      loadingTimeline: "Loading timeline…",
      dateUnavailable: "Date unavailable",
      noActivitiesInView: "No activities in this view.",
      shownInUpcoming: "The activities on these pages are shown in Upcoming tasks.",
      loadMoreTasks: "Load more tasks",
      loadOlderActivities: "Load older activities",
    },
  },
  vi: {
    entry: {
      timeUnavailable: "Không có thời gian",
      stageTransition: (from, to) => `${from} → ${to}`,
      stageTransitionUnavailable: "Không có chi tiết chuyển giai đoạn",
      unavailableActor: "Người thực hiện không khả dụng / trong lịch sử",
      metadataUnavailable: "Siêu dữ liệu đã lưu không khả dụng.",
      storedDetailsSummary: "Chi tiết hoạt động đã lưu",
      emailThreadReference: id => `Tham chiếu luồng email: ${id}`,
      calendarEventReference: id => `Tham chiếu sự kiện lịch: ${id}`,
      relatedRecordFallback: (entityLabel, id) => `${entityLabel} · ${id}`,
      relatedRecordsAriaLabel: "Bản ghi liên quan của hoạt động",
      untitled: "Chưa có tiêu đề",
      task: {
        completed: "Đã hoàn thành",
        dueDateUnavailable: "Không đọc được hạn hoàn thành",
        noDueDate: "Không có hạn hoàn thành",
        overdue: "Quá hạn",
        due: "Đến hạn",
      },
    },
    actions: {
      reopenTask: "Mở lại công việc",
      completeTask: "Hoàn thành công việc",
      deleteActivity: "Xóa hoạt động",
      updating: "Đang cập nhật hoạt động…",
      deleted: "Đã xóa hoạt động.",
      reopened: "Đã mở lại công việc.",
      completed: "Đã hoàn thành công việc.",
      deleteDialog: {
        title: "Xóa hoạt động",
        description: subject => `Xóa “${subject}”? Thao tác này sẽ gỡ hoạt động khỏi mọi dòng thời gian liên kết. Không thể hoàn tác.`,
        stageChangeNote: " Xóa mục lịch sử này không làm thay đổi giai đoạn hiện tại của giao dịch.",
        deleting: "Đang xóa…",
        confirm: "Xóa",
      },
    },
    composer: {
      heading: "Ghi nhận hoạt động",
      shortcutHint: "Ctrl / ⌘ + Enter để lưu",
      typeLabel: "Loại hoạt động",
      logEmailOption: "Ghi nhận email",
      emailHint: "Ghi nhận một email trong CRM. Thao tác này không gửi email.",
      subjectLabel: required => `Tiêu đề ${required ? "(bắt buộc)" : "(tùy chọn)"}`,
      subjectAria: "Tiêu đề",
      bodyLabel: "Nội dung",
      bodyAria: "Nội dung",
      bodyPlaceholderCall: "Kết quả cuộc gọi và ghi chú",
      bodyPlaceholderDefault: "Ghi chú hoạt động",
      occurredAtLabel: "Thời điểm diễn ra",
      dueAtLabel: "Hạn hoàn thành",
      withOptional: label => `${label} (tùy chọn)`,
      formatAria: label => `Định dạng ${label}`,
      dateOnlyOption: "Chỉ ngày (UTC)",
      dateTimeOption: "Ngày và giờ (giờ địa phương)",
      timezoneHint: "Có thể để trống thời điểm diễn ra. Ngày dùng nửa đêm UTC; ngày và giờ dùng múi giờ của bạn.",
      saving: "Đang lưu hoạt động…",
      addActivity: "Thêm hoạt động",
      discardDraft: "Hủy bản nháp",
      savedMessage: typeLabel => `Đã lưu ${typeLabel.toLowerCase()}.`,
      saveUnconfirmed: "Không xác nhận được việc lưu. Hãy kiểm tra dòng thời gian trước khi thử lại để tránh trùng lặp.",
      genericCheckFields: "Hãy kiểm tra lại các trường của hoạt động.",
      errors: {
        invalidType: "Hãy chọn một loại hoạt động thủ công.",
        tooLong: "Dùng tối đa 100.000 ký tự.",
        taskNeedsSubject: "Công việc cần có tiêu đề.",
        needsSubjectOrBody: "Hãy thêm tiêu đề hoặc ghi chú trước khi lưu.",
        invalidDateTime: "Hãy chọn ngày và giờ hợp lệ.",
        invalidLocalDateTime: "Hãy chọn ngày và giờ địa phương hợp lệ.",
        invalidDate: "Hãy chọn một ngày hợp lệ.",
        invalidLinkedRecord: "Hãy chọn một bản ghi liên kết hợp lệ.",
        checkFields: "Hãy kiểm tra các trường hoạt động được đánh dấu.",
      },
    },
    panel: {
      heading: "Dòng thời gian",
      refresh: "Làm mới dòng thời gian",
      sectionAriaLabel: "Dòng thời gian hoạt động",
      viewsAriaLabel: "Chế độ xem hoạt động",
      views: { all: "Tất cả", history: "Lịch sử", notes: "Ghi chú", upcoming: "Sắp tới", done: "Hoàn tất", email: "Email", meetings: "Cuộc họp" },
      countsFailed: "Không tải được số lượng hoạt động.",
      countsRefreshing: "Đang làm mới số lượng hoạt động…",
      directoryFailed: "Không tải được danh bạ người thực hiện. ID trong lịch sử vẫn hiển thị.",
      requestFailed: "Yêu cầu thất bại.",
      pendingCount: "…",
      activityCreated: "Đã lưu hoạt động. Chế độ xem hiện tại đã được làm mới; dùng Tất cả để xem mọi loại hoạt động.",
      pinnedSectionAriaLabel: "Công việc sắp tới được ghim",
      upcomingHeading: "Công việc sắp tới",
      upcomingFailed: "Không tải được công việc sắp tới.",
      upcomingLoadingMore: "Đang tải thêm công việc sắp tới…",
      upcomingRefreshing: "Đang làm mới công việc sắp tới…",
      upcomingLoading: "Đang tải công việc sắp tới…",
      noUpcoming: "Không có công việc sắp tới.",
      loadMoreUpcoming: "Tải thêm công việc sắp tới",
      timelineFailed: "Không tải được dòng thời gian.",
      loadingMoreActivities: "Đang tải thêm hoạt động…",
      refreshingTimeline: "Đang làm mới dòng thời gian…",
      loadingTimeline: "Đang tải dòng thời gian…",
      dateUnavailable: "Không có ngày",
      noActivitiesInView: "Không có hoạt động nào trong chế độ xem này.",
      shownInUpcoming: "Các hoạt động ở những trang này được hiển thị trong Công việc sắp tới.",
      loadMoreTasks: "Tải thêm công việc",
      loadOlderActivities: "Tải hoạt động cũ hơn",
    },
  },
};
