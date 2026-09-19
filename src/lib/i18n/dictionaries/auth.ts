import type { AppLocale } from "../config";

/** The auth form's screen; also the key for its per-mode copy below. */
export type AuthMode = "sign-in" | "sign-up" | "verify-email" | "forgot-password" | "reset-password" | "access-revoked";

interface AuthModeCopy {
  title: string;
  description: string;
  action: string;
}

export interface AuthDictionary {
  /** aria-label on the logo link back to the homepage. */
  homepageLabel: string;
  /** sr-only text on the auth form's loading skeleton. */
  loadingForm: string;
  /** Submit button label while a request is in flight. */
  pending: string;
  modes: Record<AuthMode, AuthModeCopy>;
  fields: {
    name: string;
    email: string;
    password: string;
    newPassword: string;
    confirmPassword: string;
    passwordHint: string;
  };
  /** Client-side messages the form shows itself, not text from the server. */
  errors: {
    passwordMismatch: string;
    nameRequired: string;
    tooManyAttempts: string;
    signInFailed: string;
    signUpFailed: string;
    verificationSendFailed: string;
    passwordResetRequestFailed: string;
    resetFailed: string;
    signOutFailed: string;
    requestFailed: string;
  };
  alerts: {
    verificationLinkUnusable: string;
    emailVerified: string;
    verifyLinkInvalid: string;
    resetLinkProblem: string;
  };
  notices: {
    verificationResent: string;
    resetLinkSent: string;
    passwordResetDone: string;
  };
  nav: {
    label: string;
    tryAgain: string;
    backToSignIn: string;
    createAccount: string;
    forgotPassword: string;
    resendVerification: string;
    requestNewResetLink: string;
  };
}

export const auth: Record<AppLocale, AuthDictionary> = {
  en: {
    homepageLabel: "Homepage",
    loadingForm: "Loading form…",
    pending: "Please wait…",
    modes: {
      "sign-in": { title: "Sign in", description: "Use your verified email to open the shared workspace.", action: "Sign in" },
      "sign-up": { title: "Create an account", description: "Verify your email to join the shared Vinext workspace.", action: "Create account" },
      "verify-email": { title: "Verify your email", description: "Open the verification link in your email, then sign in. Need a new link? Enter your email below.", action: "Resend verification email" },
      "forgot-password": { title: "Forgot your password?", description: "Enter your email to request a password reset link.", action: "Send reset link" },
      "reset-password": { title: "Reset your password", description: "Choose a new password. You will need to sign in again on all devices.", action: "Reset password" },
      "access-revoked": { title: "Workspace access revoked", description: "Contact a workspace owner to restore your access. Once restored, sign in again to continue.", action: "Sign out" },
    },
    fields: {
      name: "Name",
      email: "Email",
      password: "Password",
      newPassword: "New password",
      confirmPassword: "Confirm new password",
      passwordHint: "Use 8 to 128 characters.",
    },
    errors: {
      passwordMismatch: "The passwords do not match. Enter the same password in both fields.",
      nameRequired: "Enter your name to create an account.",
      tooManyAttempts: "Too many attempts. Wait a minute and try again.",
      signInFailed: "Unable to sign in. Check your email and password, and make sure your email is verified.",
      signUpFailed: "We could not complete signup. Try again, or resend a verification email if you already submitted this form.",
      verificationSendFailed: "We could not send the verification email. Wait a minute and try again.",
      passwordResetRequestFailed: "We could not process this request. Wait a minute and try again.",
      resetFailed: "This reset link could not be used. It may have expired or already been used. Request a new link below.",
      signOutFailed: "We could not sign you out. Check your connection and try again.",
      requestFailed: "The request could not be completed. Check your connection and try again.",
    },
    alerts: {
      verificationLinkUnusable: "The verification link could not be used. Request a new verification email below.",
      emailVerified: "Your email is verified. Sign in to continue.",
      verifyLinkInvalid: "This verification link is invalid or expired. Request a new link below.",
      resetLinkProblem: "This reset link is missing, invalid, or expired. Request a new link below.",
    },
    notices: {
      verificationResent: "If this account needs verification, a new link has been sent. Check your inbox and spam folder.",
      resetLinkSent: "If an account matches this email, a reset link has been sent. Check your inbox and spam folder.",
      passwordResetDone: "Your password has been reset. Sign in with your new password.",
    },
    nav: {
      label: "Account help",
      tryAgain: "Try signing in again",
      backToSignIn: "Back to sign in",
      createAccount: "Create an account",
      forgotPassword: "Forgot your password?",
      resendVerification: "Resend verification email",
      requestNewResetLink: "Request a new reset link",
    },
  },
  vi: {
    homepageLabel: "Trang chủ",
    loadingForm: "Đang tải biểu mẫu…",
    pending: "Vui lòng đợi…",
    modes: {
      "sign-in": { title: "Đăng nhập", description: "Dùng email đã xác minh để mở không gian làm việc chung.", action: "Đăng nhập" },
      "sign-up": { title: "Tạo tài khoản", description: "Xác minh email của bạn để tham gia không gian làm việc Vinext chung.", action: "Tạo tài khoản" },
      "verify-email": { title: "Xác minh email của bạn", description: "Mở liên kết xác minh trong email, sau đó đăng nhập. Cần liên kết mới? Nhập email của bạn bên dưới.", action: "Gửi lại email xác minh" },
      "forgot-password": { title: "Quên mật khẩu?", description: "Nhập email của bạn để yêu cầu liên kết đặt lại mật khẩu.", action: "Gửi liên kết đặt lại" },
      "reset-password": { title: "Đặt lại mật khẩu", description: "Chọn mật khẩu mới. Bạn sẽ cần đăng nhập lại trên mọi thiết bị.", action: "Đặt lại mật khẩu" },
      "access-revoked": { title: "Quyền truy cập không gian làm việc đã bị thu hồi", description: "Liên hệ chủ sở hữu không gian làm việc để khôi phục quyền truy cập. Sau khi được khôi phục, hãy đăng nhập lại để tiếp tục.", action: "Đăng xuất" },
    },
    fields: {
      name: "Tên",
      email: "Email",
      password: "Mật khẩu",
      newPassword: "Mật khẩu mới",
      confirmPassword: "Xác nhận mật khẩu mới",
      passwordHint: "Dùng từ 8 đến 128 ký tự.",
    },
    errors: {
      passwordMismatch: "Mật khẩu không khớp. Hãy nhập cùng một mật khẩu ở cả hai ô.",
      nameRequired: "Nhập tên của bạn để tạo tài khoản.",
      tooManyAttempts: "Quá nhiều lần thử. Hãy đợi một phút rồi thử lại.",
      signInFailed: "Không thể đăng nhập. Kiểm tra lại email và mật khẩu, và đảm bảo email của bạn đã được xác minh.",
      signUpFailed: "Không hoàn tất được việc đăng ký. Hãy thử lại, hoặc gửi lại email xác minh nếu bạn đã gửi biểu mẫu này.",
      verificationSendFailed: "Không gửi được email xác minh. Hãy đợi một phút rồi thử lại.",
      passwordResetRequestFailed: "Không xử lý được yêu cầu này. Hãy đợi một phút rồi thử lại.",
      resetFailed: "Không thể dùng liên kết đặt lại này. Liên kết có thể đã hết hạn hoặc đã được sử dụng. Hãy yêu cầu một liên kết mới bên dưới.",
      signOutFailed: "Không thể đăng xuất cho bạn. Kiểm tra kết nối rồi thử lại.",
      requestFailed: "Không hoàn tất được yêu cầu. Hãy kiểm tra kết nối rồi thử lại.",
    },
    alerts: {
      verificationLinkUnusable: "Không thể dùng liên kết xác minh này. Hãy yêu cầu một email xác minh mới bên dưới.",
      emailVerified: "Email của bạn đã được xác minh. Đăng nhập để tiếp tục.",
      verifyLinkInvalid: "Liên kết xác minh này không hợp lệ hoặc đã hết hạn. Hãy yêu cầu một liên kết mới bên dưới.",
      resetLinkProblem: "Liên kết đặt lại này bị thiếu, không hợp lệ hoặc đã hết hạn. Hãy yêu cầu một liên kết mới bên dưới.",
    },
    notices: {
      verificationResent: "Nếu tài khoản này cần xác minh, một liên kết mới đã được gửi. Hãy kiểm tra hộp thư đến và thư mục spam.",
      resetLinkSent: "Nếu có tài khoản khớp với email này, một liên kết đặt lại đã được gửi. Hãy kiểm tra hộp thư đến và thư mục spam.",
      passwordResetDone: "Mật khẩu của bạn đã được đặt lại. Hãy đăng nhập bằng mật khẩu mới.",
    },
    nav: {
      label: "Trợ giúp tài khoản",
      tryAgain: "Thử đăng nhập lại",
      backToSignIn: "Quay lại đăng nhập",
      createAccount: "Tạo tài khoản",
      forgotPassword: "Quên mật khẩu?",
      resendVerification: "Gửi lại email xác minh",
      requestNewResetLink: "Yêu cầu liên kết đặt lại mới",
    },
  },
};
