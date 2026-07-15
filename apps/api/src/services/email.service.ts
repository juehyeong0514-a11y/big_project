import { Injectable } from "@nestjs/common";
import { resendAdapter, sendGridAdapter, webhookAdapter } from "./email-delivery.js";
import { EmailProviderConfigurationError } from "./email-errors.js";
import type { EmailProviderAdapter, SendInviteEmailInput, SendInviteEmailResult } from "./email.types.js";
export type { SendInviteEmailInput, SendInviteEmailResult } from "./email.types.js";
export { EmailProviderConfigurationError } from "./email-errors.js";

@Injectable()
export class EmailService {
  configuredProviderName() {
    return process.env.EMAIL_PROVIDER ?? "resend";
  }

  async sendInvite(input: SendInviteEmailInput): Promise<SendInviteEmailResult> {
    return this.providerAdapter().send(input);
  }

  private providerAdapter(): EmailProviderAdapter {
    const provider = this.configuredProviderName();
    switch (provider) {
      case "resend":
        return resendAdapter();
      case "sendgrid":
        return sendGridAdapter();
      case "webhook":
        return webhookAdapter();
      default:
        throw new EmailProviderConfigurationError(provider, `Unsupported EMAIL_PROVIDER "${provider}". Use "resend" for production delivery.`);
    }
  }
}
