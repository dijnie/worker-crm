import type { ErrorCode, ValidationCode } from "@/lib/utils/error-codes";
import type { AppLocale } from "../config";

export interface ErrorsDictionary {
  /**
   * What the API reported, by code. The API writes its messages in English, so
   * English has no table and shows the server's wording unchanged; every other
   * language must translate every code.
   */
  server: Record<ErrorCode, string> | null;
  /** What a single rejected field reported, by code. Same rule as `server`. */
  validation: Record<ValidationCode, string> | null;
  /** The request never produced an answer the app could read. */
  unreachable: string;
  /** The server failed without saying why. */
  unexpected: string;
}

export const errors: Record<AppLocale, ErrorsDictionary> = {
  en: {
    server: null,
    validation: null,
    unreachable: "The request could not be completed. Check your connection and try again.",
    unexpected: "Something went wrong on the server. Try again.",
  },
  vi: {
    server: {
      ACTIVITY_NOT_FOUND: "Không tìm thấy hoạt động.",
      COMPANY_NOT_FOUND: "Không tìm thấy công ty.",
      CONTACT_NOT_FOUND: "Không tìm thấy liên hệ.",
      DEAL_NOT_FOUND: "Không tìm thấy giao dịch.",
      DEAL_CONTACT_NOT_FOUND: "Không tìm thấy liên hệ của giao dịch.",
      FIELD_NOT_FOUND: "Không tìm thấy trường.",
      FIELD_OPTION_NOT_FOUND: "Không tìm thấy tùy chọn của trường.",
      MEMBER_NOT_FOUND: "Không tìm thấy thành viên.",
      ROLE_NOT_FOUND: "Không tìm thấy vai trò.",
      SAVED_VIEW_NOT_FOUND: "Không tìm thấy chế độ xem đã lưu.",
      TARGET_RECORD_NOT_FOUND: "Không tìm thấy bản ghi đích.",
      UNAUTHENTICATED: "Bạn cần đăng nhập.",
      INACTIVE_MEMBERSHIP: "Tư cách thành viên của bạn không còn hoạt động.",
      FORBIDDEN_ACTION: "Bạn không được phép thực hiện thao tác này.",
      PERMISSION_REQUIRED: "Vai trò của bạn không cho phép thao tác này.",
      INVALID_REQUEST: "Yêu cầu không hợp lệ.",
      INVALID_JSON: "Nội dung yêu cầu không phải JSON hợp lệ.",
      INVALID_QUERY: "Tham số truy vấn không hợp lệ.",
      BODY_TOO_LARGE: "Nội dung yêu cầu quá lớn.",
      UNSUPPORTED_MEDIA_TYPE: "Yêu cầu phải ở định dạng application/json.",
      UNIQUE_CONFLICT: "Đã có bản ghi mang các giá trị duy nhất này.",
      COMPANY_DOMAIN_TAKEN: "Một công ty đang hoạt động khác đã dùng tên miền này.",
      COMPANY_IDENTITY_TAKEN: "Một công ty khác đã dùng tên miền hoặc liên hệ chính này.",
      CONTACT_EMAIL_TAKEN: "Một liên hệ đang hoạt động khác đã dùng địa chỉ email này.",
      DEAL_CONTACT_ATTACHED: "Liên hệ này đã được gắn với giao dịch.",
      FIELD_KEY_TAKEN: "Loại bản ghi này đã có trường mang khóa đó.",
      SAVED_VIEW_NAME_TAKEN: "Đã có chế độ xem mang tên này.",
      REFERENCE_MISSING: "Bản ghi được tham chiếu không tồn tại.",
      COMPANY_MISSING: "Công ty được tham chiếu không tồn tại.",
      CONTACT_MISSING: "Liên hệ được tham chiếu không tồn tại.",
      STALE_REVISION: "Dữ liệu đã thay đổi; hãy tải lại rồi thử lại.",
      WORKSPACE_MISSING: "Không gian làm việc chưa được khởi tạo.",
      SETTINGS_EMPTY: "Hãy cung cấp tiền tệ báo cáo hoặc ngôn ngữ.",
      ADMISSION_FAILED: "Không hoàn tất được việc gia nhập không gian làm việc.",
      MEMBERSHIP_CHANGED: "Tư cách thành viên đã thay đổi hoặc thao tác không hợp lệ; hãy tải lại rồi thử lại.",
      LAST_SYSTEM_ACCOUNT: "Phải còn ít nhất một tài khoản hệ thống đang hoạt động.",
      SYSTEM_ROLE_PROTECTED: "Vai trò hệ thống được bảo vệ.",
      ROLE_ASSIGNED: "Vai trò này đang được gán cho một tài khoản.",
      ROLE_CHANGED_OR_ASSIGNED: "Vai trò đã thay đổi hoặc đang được gán cho một tài khoản; hãy tải lại rồi thử lại.",
      ROLE_NAME_TAKEN: "Đã có vai trò mang tên này.",
      FIELD_CHANGED: "Trường đã thay đổi; hãy tải lại rồi thử lại.",
      FIELD_TYPE_LOCKED: "Kiểu trường đã bị thay đổi đồng thời hoặc trường đã có giá trị.",
      FIELD_KEY_UNUSABLE: "Nhãn này không tạo được khóa trường hợp lệ.",
      FIELD_ENTITY_MISMATCH: "Trường không thuộc loại bản ghi này.",
      FIELD_REQUIRED: "Không thể xóa giá trị của trường bắt buộc.",
      FIELD_OPTIONS_UNSUPPORTED: "Chỉ trường lựa chọn đang hoạt động mới có tùy chọn.",
      FIELD_OPTION_REQUIRED: "Trường lựa chọn cần ít nhất một tùy chọn.",
      FIELD_OPTION_MISMATCH: "Hãy chọn một tùy chọn đang hoạt động thuộc trường này.",
      DUPLICATE_ENTRY: "Mỗi mục chỉ được xuất hiện một lần.",
      FILTER_UNAVAILABLE: "Bộ lọc tùy chỉnh không còn dùng được. Hãy sửa hoặc gỡ bộ lọc này.",
      ACTIVITY_NOT_TASK: "Chỉ có thể hoàn thành công việc.",
      AMOUNT_INVALID: "Số tiền phải là số thập phân có tối đa hai chữ số sau dấu phẩy.",
      AMOUNT_OUT_OF_RANGE: "Số tiền vượt quá giới hạn được hỗ trợ.",
    },
    validation: {
      ACTIVITY_NEEDS_ANCHOR: "Hoạt động cần gắn với một công ty, liên hệ hoặc giao dịch.",
      TASK_NEEDS_SUBJECT: "Công việc cần có tiêu đề.",
      DUE_DATE_TASK_ONLY: "Chỉ công việc mới có hạn hoàn thành.",
      LOST_REASON_REQUIRED: "Giao dịch thất bại cần có lý do.",
      COMPANY_DOMAIN_INVALID: "Tên miền công ty không hợp lệ.",
      VALUE_REQUIRED: "Cần nhập giá trị.",
      invalid_type: "Giá trị không đúng kiểu.",
      invalid_string: "Giá trị không đúng định dạng.",
      invalid_enum_value: "Giá trị không nằm trong các lựa chọn cho phép.",
      invalid_date: "Ngày không hợp lệ.",
      too_small: "Giá trị quá ngắn hoặc quá nhỏ.",
      too_big: "Giá trị quá dài hoặc quá lớn.",
      unrecognized_keys: "Yêu cầu chứa thuộc tính không được hỗ trợ.",
      custom: "Giá trị không hợp lệ.",
    },
    unreachable: "Không hoàn tất được yêu cầu. Hãy kiểm tra kết nối rồi thử lại.",
    unexpected: "Máy chủ gặp lỗi. Hãy thử lại.",
  },
};
