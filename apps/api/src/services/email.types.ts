export interface SendInviteEmailInput {
  candidateId: string;
  candidateName: string;
  email: string;
  examTitle: string;
  inviteUrl: string;
}

export interface SendInviteEmailResult {
  delivered: boolean;
  provider: string;
  providerMessageId?: string;
  message: string;
}

export type EmailProvider = "resend" | "sendgrid" | "webhook";

export interface EmailProviderAdapter {
  readonly provider: EmailProvider;
  readonly send: (input: SendInviteEmailInput) => Promise<SendInviteEmailResult>;
}
