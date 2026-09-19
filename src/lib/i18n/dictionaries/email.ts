import type { AppLocale } from "../config";

export interface EmailDictionary {
  verificationSubject: string;
  verificationAction: string;
  passwordResetSubject: string;
  passwordResetAction: string;
}

export const email: Record<AppLocale, EmailDictionary> = {
  en: {
    verificationSubject: "Verify your email",
    verificationAction: "Verify email",
    passwordResetSubject: "Reset your password",
    passwordResetAction: "Reset password",
  },
  vi: {
    verificationSubject: "Xác minh email của bạn",
    verificationAction: "Xác minh email",
    passwordResetSubject: "Đặt lại mật khẩu của bạn",
    passwordResetAction: "Đặt lại mật khẩu",
  },
};
