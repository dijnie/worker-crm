import { getDictionary } from "@/lib/i18n/get-dictionary";
import type { AuthEmailAdapter, AuthEmailMessage } from "./email-adapter";

interface CloudflareEmailAdapterOptions {
  binding: SendEmail;
  from: string;
}

export class CloudflareEmailAdapter implements AuthEmailAdapter {
  constructor(private readonly options: CloudflareEmailAdapterOptions) {
    const missing = [!options.binding && "EMAIL binding", !options.from && "AUTH_EMAIL_FROM"].filter(Boolean);
    if (missing.length) {
      throw new Error(`Cloudflare Email Service configuration is incomplete: missing ${missing.join(", ")}`);
    }
  }

  sendVerification(message: AuthEmailMessage): Promise<void> {
    const { email } = getDictionary(message.locale);
    return this.send(message, email.verificationSubject, email.verificationAction);
  }

  sendPasswordReset(message: AuthEmailMessage): Promise<void> {
    const { email } = getDictionary(message.locale);
    return this.send(message, email.passwordResetSubject, email.passwordResetAction);
  }

  private async send(message: AuthEmailMessage, subject: string, action: string): Promise<void> {
    await this.options.binding.send({
      to: message.to,
      from: { name: "CRM", email: this.options.from },
      subject,
      text: `${action}: ${message.url}`,
    });
  }
}
