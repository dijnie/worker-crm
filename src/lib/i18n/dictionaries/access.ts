import type { PermissionAction } from "@/lib/auth/permissions";
import type { AppLocale } from "../config";

export interface AccessDictionary {
  nav: {
    regionLabel: string;
    general: string;
    members: string;
    roles: string;
    fields: string;
  };
  /** The permission catalog's action identifiers, by their display label. */
  actions: Record<PermissionAction, string>;
  members: {
    title: string;
    description: string;
    workspaceMembersLabel: string;
    paginationLabel: string;
    accessStatusLabel: string;
    statusAll: string;
    statusActive: string;
    statusRevoked: string;
    refresh: string;
    rolesUnavailable: string;
    retryRoles: string;
    loadFailed: string;
    loadingLabel: string;
    empty: string;
    nameHeader: string;
    emailHeader: string;
    roleHeader: string;
    statusHeader: string;
    actionsHeader: string;
    you: string;
    noRole: string;
    statusActiveBadge: string;
    statusRevokedBadge: string;
    roleForAria: (name: string) => string;
    revokeAccessForAria: (name: string) => string;
    revokeAccess: string;
    restoreAccessForAria: (name: string) => string;
    restoreAccess: string;
    restoring: string;
    paginationSummary: (page: number, totalPages: number, total: number) => string;
    previous: string;
    next: string;
    revokeDialogTitle: string;
    revokeDialogDescription: (name: string) => string;
    revokingSelf: string;
    revoking: string;
    tryAgain: string;
    changeFailed: string;
    accessRevokedNotice: string;
    accessRestoredNotice: string;
    roleUpdatedNotice: string;
  };
  roles: {
    title: string;
    description: string;
    createRole: string;
    loadingLabel: string;
    unavailable: string;
    protected: string;
    memberCount: (count: number) => string;
    fullAccess: string;
    permissionCount: (count: number) => string;
    viewPermissions: string;
    editRole: string;
    deleteRole: string;
    deleteDisabledHint: string;
    createDialogTitle: string;
    systemDialogTitle: string;
    editDialogTitle: string;
    permissionsHint: string;
    permissionsFooter: string;
    deleteDialogTitle: string;
    deleteDialogDescription: (name: string) => string;
    deleteFailed: string;
    deleting: string;
    roleNameLabel: string;
    descriptionLabel: string;
    reloadRole: string;
    reloadFailed: string;
    saveFailed: string;
    saveRole: string;
  };
}

export const access: Record<AppLocale, AccessDictionary> = {
  en: {
    nav: {
      regionLabel: "Workspace settings",
      general: "General",
      members: "Members",
      roles: "Roles",
      fields: "Fields",
    },
    actions: {
      read: "Read",
      create: "Create",
      update: "Update",
      archive: "Archive",
      restore: "Restore",
      complete: "Complete",
      delete: "Delete",
    },
    members: {
      title: "Members",
      description: "Everyone with active access shares the CRM workspace. System accounts manage roles and access. At least one active system account must remain.",
      workspaceMembersLabel: "Workspace members",
      paginationLabel: "Members pagination",
      accessStatusLabel: "Access status",
      statusAll: "All members",
      statusActive: "Active",
      statusRevoked: "Revoked",
      refresh: "Refresh members",
      rolesUnavailable: "Roles could not load.",
      retryRoles: "Retry roles",
      loadFailed: "Members could not be loaded. Try again.",
      loadingLabel: "Loading members",
      empty: "No members match this access status.",
      nameHeader: "Name",
      emailHeader: "Email",
      roleHeader: "Role",
      statusHeader: "Status",
      actionsHeader: "Actions",
      you: "(you)",
      noRole: "No role",
      statusActiveBadge: "Active",
      statusRevokedBadge: "Revoked",
      roleForAria: name => `Role for ${name}`,
      revokeAccessForAria: name => `Revoke access for ${name}`,
      revokeAccess: "Revoke access",
      restoreAccessForAria: name => `Restore access for ${name}`,
      restoreAccess: "Restore access",
      restoring: "Restoring…",
      paginationSummary: (page, totalPages, total) => `Page ${page} of ${totalPages} · ${total} ${total === 1 ? "member" : "members"}`,
      previous: "Previous",
      next: "Next",
      revokeDialogTitle: "Revoke workspace access?",
      revokeDialogDescription: name => `${name} will be signed out and lose access to the shared workspace. Their CRM records and history will remain. A system account can restore access later.`,
      revokingSelf: "You are revoking your own access. Another system account will need to restore it.",
      revoking: "Revoking…",
      tryAgain: "Try again",
      changeFailed: "The change could not be saved. Check your connection and try again.",
      accessRevokedNotice: "Access revoked. This account has been signed out.",
      accessRestoredNotice: "Access restored with no role. This account must sign in again and be assigned a role.",
      roleUpdatedNotice: "Member role updated.",
    },
    roles: {
      title: "Roles",
      description: "Create roles and choose what each role can access. New roles start with no permissions.",
      createRole: "Create role",
      loadingLabel: "Loading roles",
      unavailable: "Roles could not load.",
      protected: "Protected system role",
      memberCount: count => `${count} assigned ${count === 1 ? "account" : "accounts"}`,
      fullAccess: "Full access",
      permissionCount: count => `${count} permissions`,
      viewPermissions: "View permissions",
      editRole: "Edit role",
      deleteRole: "Delete role",
      deleteDisabledHint: "Remove role assignments before deleting this role.",
      createDialogTitle: "Create role",
      systemDialogTitle: "System permissions",
      editDialogTitle: "Edit role",
      permissionsHint: "Write permissions require Read for the same entity. Field definitions, roles, and members are managed by system accounts.",
      permissionsFooter: "Creating deals also requires Company Read. Linking records and logging activity require Read for all linked entities. Archive keeps records available for restoration; deleting activity is permanent.",
      deleteDialogTitle: "Delete role?",
      deleteDialogDescription: name => `Delete ${name}? Only roles with no assigned accounts can be deleted.`,
      deleteFailed: "Role could not be deleted.",
      deleting: "Deleting…",
      roleNameLabel: "Role name",
      descriptionLabel: "Description",
      reloadRole: "Reload current role and discard draft",
      reloadFailed: "Role could not reload.",
      saveFailed: "Role could not be saved.",
      saveRole: "Save role",
    },
  },
  vi: {
    nav: {
      regionLabel: "Cài đặt không gian làm việc",
      general: "Chung",
      members: "Thành viên",
      roles: "Vai trò",
      fields: "Trường",
    },
    actions: {
      read: "Xem",
      create: "Tạo",
      update: "Cập nhật",
      archive: "Lưu trữ",
      restore: "Khôi phục",
      complete: "Hoàn tất",
      delete: "Xóa",
    },
    members: {
      title: "Thành viên",
      description: "Mọi người có quyền truy cập đang hoạt động đều dùng chung không gian làm việc CRM này. Tài khoản hệ thống quản lý vai trò và quyền truy cập. Phải còn ít nhất một tài khoản hệ thống đang hoạt động.",
      workspaceMembersLabel: "Thành viên không gian làm việc",
      paginationLabel: "Phân trang thành viên",
      accessStatusLabel: "Trạng thái truy cập",
      statusAll: "Tất cả thành viên",
      statusActive: "Đang hoạt động",
      statusRevoked: "Đã thu hồi",
      refresh: "Làm mới thành viên",
      rolesUnavailable: "Không tải được vai trò.",
      retryRoles: "Thử lại vai trò",
      loadFailed: "Không tải được thành viên. Hãy thử lại.",
      loadingLabel: "Đang tải thành viên",
      empty: "Không có thành viên nào khớp với trạng thái truy cập này.",
      nameHeader: "Tên",
      emailHeader: "Email",
      roleHeader: "Vai trò",
      statusHeader: "Trạng thái",
      actionsHeader: "Hành động",
      you: "(bạn)",
      noRole: "Không có vai trò",
      statusActiveBadge: "Đang hoạt động",
      statusRevokedBadge: "Đã thu hồi",
      roleForAria: name => `Vai trò của ${name}`,
      revokeAccessForAria: name => `Thu hồi quyền truy cập của ${name}`,
      revokeAccess: "Thu hồi quyền truy cập",
      restoreAccessForAria: name => `Khôi phục quyền truy cập cho ${name}`,
      restoreAccess: "Khôi phục quyền truy cập",
      restoring: "Đang khôi phục…",
      paginationSummary: (page, totalPages, total) => `Trang ${page}/${totalPages} · ${total} thành viên`,
      previous: "Trước",
      next: "Sau",
      revokeDialogTitle: "Thu hồi quyền truy cập không gian làm việc?",
      revokeDialogDescription: name => `${name} sẽ bị đăng xuất và mất quyền truy cập vào không gian làm việc chung. Bản ghi CRM và lịch sử của họ vẫn được giữ lại. Một tài khoản hệ thống có thể khôi phục quyền truy cập sau.`,
      revokingSelf: "Bạn đang thu hồi quyền truy cập của chính mình. Một tài khoản hệ thống khác sẽ cần khôi phục lại.",
      revoking: "Đang thu hồi…",
      tryAgain: "Thử lại",
      changeFailed: "Không lưu được thay đổi. Hãy kiểm tra kết nối rồi thử lại.",
      accessRevokedNotice: "Đã thu hồi quyền truy cập. Tài khoản này đã được đăng xuất.",
      accessRestoredNotice: "Đã khôi phục quyền truy cập nhưng chưa có vai trò. Tài khoản này phải đăng nhập lại và được gán vai trò.",
      roleUpdatedNotice: "Đã cập nhật vai trò thành viên.",
    },
    roles: {
      title: "Vai trò",
      description: "Tạo vai trò và chọn những gì mỗi vai trò có thể truy cập. Vai trò mới bắt đầu không có quyền nào.",
      createRole: "Tạo vai trò",
      loadingLabel: "Đang tải vai trò",
      unavailable: "Không tải được vai trò.",
      protected: "Vai trò hệ thống được bảo vệ",
      memberCount: count => `${count} tài khoản được gán`,
      fullAccess: "Toàn quyền truy cập",
      permissionCount: count => `${count} quyền`,
      viewPermissions: "Xem quyền",
      editRole: "Sửa vai trò",
      deleteRole: "Xóa vai trò",
      deleteDisabledHint: "Hãy gỡ các tài khoản khỏi vai trò này trước khi xóa.",
      createDialogTitle: "Tạo vai trò",
      systemDialogTitle: "Quyền hệ thống",
      editDialogTitle: "Sửa vai trò",
      permissionsHint: "Quyền ghi yêu cầu có quyền Xem trên cùng thực thể. Định nghĩa trường, vai trò và thành viên do tài khoản hệ thống quản lý.",
      permissionsFooter: "Tạo giao dịch cũng yêu cầu quyền Xem trên Công ty. Liên kết bản ghi và ghi nhận hoạt động yêu cầu quyền Xem trên tất cả thực thể liên quan. Lưu trữ giữ bản ghi có thể khôi phục; xóa hoạt động là vĩnh viễn.",
      deleteDialogTitle: "Xóa vai trò?",
      deleteDialogDescription: name => `Xóa ${name}? Chỉ những vai trò không có tài khoản nào được gán mới có thể xóa.`,
      deleteFailed: "Không xóa được vai trò.",
      deleting: "Đang xóa…",
      roleNameLabel: "Tên vai trò",
      descriptionLabel: "Mô tả",
      reloadRole: "Tải lại vai trò hiện tại và bỏ bản nháp",
      reloadFailed: "Không tải lại được vai trò.",
      saveFailed: "Không lưu được vai trò.",
      saveRole: "Lưu vai trò",
    },
  },
};
