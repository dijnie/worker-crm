import type { AppLocale } from "@/lib/i18n/config";

export interface AuthEmailMessage {
  to: string;
  url: string;
  /** The workspace's interface language, which the email is written in. */
  locale: AppLocale;
}

export interface AuthEmailAdapter {
  sendVerification(message: AuthEmailMessage): Promise<void>;
  sendPasswordReset(message: AuthEmailMessage): Promise<void>;
}
