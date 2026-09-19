import type { NavigationKey } from "@/components/app/navigation-items";
import type { AppLocale } from "../config";

export interface ShellDictionary {
  navigation: Record<NavigationKey, string>;
  appHeader: {
    /** aria-label on the button that opens the mobile navigation sheet. */
    openNavigation: string;
    /** aria-label on the logo link back to the homepage. */
    homepageLabel: string;
    /** sr-only text on the header's loading skeleton. */
    loadingHeader: string;
  };
  appIconRail: {
    /** aria-label shared by the desktop rail and the mobile navigation sheet. */
    primaryLabel: string;
    /** Title of the mobile navigation sheet. */
    navigationTitle: string;
    /** sr-only text on the rail's loading skeleton. */
    loadingNavigation: string;
  };
  appShell: {
    /** The skip-to-content link, visible only on keyboard focus. */
    skipToContent: string;
  };
  accountMenu: {
    /** aria-label on the account avatar button. */
    accountLabel: string;
    /** Shown in place of the role name when the account has none. */
    noRole: string;
    lightMode: string;
    darkMode: string;
    manageMembers: string;
    signOut: string;
    signingOut: string;
    signOutFailedRetry: string;
    signOutFailedConnection: string;
  };
  permissionGate: {
    accessDeniedTitle: string;
    forbiddenTitle: string;
    forbiddenDescription: string;
    pendingTitle: string;
    pendingDescription: string;
    checkAccess: string;
  };
  pageShell: {
    /** sr-only text on the page-level loading skeleton. */
    loadingPage: string;
  };
  detailSheet: {
    /** Default label for DetailSheetHeader's back button. */
    back: string;
    /** DetailSheetPending status when the enrichment agent is still running. */
    researching: string;
    /** DetailSheetPending status when no agent run has produced a value yet. */
    unknownYet: string;
  };
  appDataProvider: {
    accessUnavailable: string;
    checkAccessAgain: string;
  };
  docsPage: {
    title: string;
    description: string;
    signIn: string;
    signInFollowup: string;
    secondParagraph: string;
    openApiLink: string;
  };
  apiDocumentation: {
    loadFailedTitle: string;
    loadFailedDescription: string;
    loadingLabel: string;
    interactiveLabel: string;
  };
}

export const shell: Record<AppLocale, ShellDictionary> = {
  en: {
    navigation: {
      overview: "Overview",
      companies: "Companies",
      contacts: "Contacts",
      deals: "Deals",
      settings: "Settings",
      docs: "API docs",
    },
    appHeader: {
      openNavigation: "Open navigation",
      homepageLabel: "Homepage",
      loadingHeader: "Loading workspace header…",
    },
    appIconRail: {
      primaryLabel: "Primary",
      navigationTitle: "Navigation",
      loadingNavigation: "Loading navigation…",
    },
    appShell: {
      skipToContent: "Skip to content",
    },
    accountMenu: {
      accountLabel: "Account",
      noRole: "No role",
      lightMode: "Light mode",
      darkMode: "Dark mode",
      manageMembers: "Manage members",
      signOut: "Sign out",
      signingOut: "Signing out…",
      signOutFailedRetry: "Sign out failed. Please try again.",
      signOutFailedConnection: "Sign out failed. Check your connection and try again.",
    },
    permissionGate: {
      accessDeniedTitle: "Access denied",
      forbiddenTitle: "This role cannot open this area",
      forbiddenDescription: "Your role does not allow access to this page. Contact a system account to request access.",
      pendingTitle: "Waiting for access",
      pendingDescription: "Your account is signed in. A system account must assign a role with permissions before you can use the workspace.",
      checkAccess: "Check access",
    },
    pageShell: {
      loadingPage: "Loading page…",
    },
    detailSheet: {
      back: "Back",
      researching: "Agent is researching",
      unknownYet: "Not known yet",
    },
    appDataProvider: {
      accessUnavailable: "Your access could not be checked. Try again to resume the workspace.",
      checkAccessAgain: "Check access again",
    },
    docsPage: {
      title: "API documentation",
      description: "Explore endpoints and send requests to this application.",
      signIn: "Sign in",
      signInFollowup: ", then return here to use Try it out. Your browser sends the session cookie automatically. Signed-out requests return 401; role and member administration requires a system account. New accounts have no CRM access until a role is assigned.",
      secondParagraph: "Changes require the configured same Origin, supplied automatically by your browser, and JSON content type for JSON bodies. Activity creators and stage-change actors come from your session. Authentication flows under /api/auth/* are handled separately by Better Auth.",
      openApiLink: "OpenAPI JSON",
    },
    apiDocumentation: {
      loadFailedTitle: "API documentation could not load.",
      loadFailedDescription: "Retry the interactive viewer, or open the OpenAPI JSON above.",
      loadingLabel: "Loading API documentation",
      interactiveLabel: "Interactive API reference",
    },
  },
  vi: {
    navigation: {
      overview: "Tổng quan",
      companies: "Công ty",
      contacts: "Liên hệ",
      deals: "Giao dịch",
      settings: "Cài đặt",
      docs: "Tài liệu API",
    },
    appHeader: {
      openNavigation: "Mở điều hướng",
      homepageLabel: "Trang chủ",
      loadingHeader: "Đang tải phần đầu không gian làm việc…",
    },
    appIconRail: {
      primaryLabel: "Chính",
      navigationTitle: "Điều hướng",
      loadingNavigation: "Đang tải điều hướng…",
    },
    appShell: {
      skipToContent: "Bỏ qua để đến nội dung",
    },
    accountMenu: {
      accountLabel: "Tài khoản",
      noRole: "Chưa có vai trò",
      lightMode: "Chế độ sáng",
      darkMode: "Chế độ tối",
      manageMembers: "Quản lý thành viên",
      signOut: "Đăng xuất",
      signingOut: "Đang đăng xuất…",
      signOutFailedRetry: "Đăng xuất thất bại. Hãy thử lại.",
      signOutFailedConnection: "Đăng xuất thất bại. Kiểm tra kết nối rồi thử lại.",
    },
    permissionGate: {
      accessDeniedTitle: "Truy cập bị từ chối",
      forbiddenTitle: "Vai trò này không thể mở khu vực này",
      forbiddenDescription: "Vai trò của bạn không cho phép truy cập trang này. Liên hệ một tài khoản hệ thống để yêu cầu quyền truy cập.",
      pendingTitle: "Đang chờ cấp quyền truy cập",
      pendingDescription: "Tài khoản của bạn đã đăng nhập. Một tài khoản hệ thống cần gán vai trò kèm quyền hạn trước khi bạn có thể dùng không gian làm việc.",
      checkAccess: "Kiểm tra quyền truy cập",
    },
    pageShell: {
      loadingPage: "Đang tải trang…",
    },
    detailSheet: {
      back: "Quay lại",
      researching: "Tác nhân đang tìm hiểu",
      unknownYet: "Chưa xác định",
    },
    appDataProvider: {
      accessUnavailable: "Không kiểm tra được quyền truy cập của bạn. Hãy thử lại để tiếp tục không gian làm việc.",
      checkAccessAgain: "Kiểm tra lại quyền truy cập",
    },
    docsPage: {
      title: "Tài liệu API",
      description: "Khám phá các điểm cuối và gửi yêu cầu đến ứng dụng này.",
      signIn: "Đăng nhập",
      signInFollowup: ", rồi quay lại đây để dùng Try it out. Trình duyệt của bạn tự động gửi cookie phiên. Yêu cầu khi chưa đăng nhập trả về 401; việc quản trị vai trò và thành viên yêu cầu tài khoản hệ thống. Tài khoản mới chưa có quyền truy cập CRM cho đến khi được gán vai trò.",
      secondParagraph: "Các thay đổi yêu cầu đúng Origin đã cấu hình, được trình duyệt của bạn tự động cung cấp, và kiểu nội dung JSON cho phần thân JSON. Người tạo hoạt động và người thực hiện đổi giai đoạn được lấy từ phiên của bạn. Các luồng xác thực dưới /api/auth/* được Better Auth xử lý riêng.",
      openApiLink: "OpenAPI JSON",
    },
    apiDocumentation: {
      loadFailedTitle: "Không tải được tài liệu API.",
      loadFailedDescription: "Hãy thử lại trình xem tương tác, hoặc mở OpenAPI JSON ở trên.",
      loadingLabel: "Đang tải tài liệu API",
      interactiveLabel: "Tài liệu tham khảo API tương tác",
    },
  },
};
