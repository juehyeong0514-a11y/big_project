import type { EmailProviderAdapter, SendInviteEmailInput, SendInviteEmailResult } from "./email.types.js";
import { providerErrorMessage, providerMessageId } from "./email-provider-response.js";
import { renderInviteEmail } from "./email-template.js";
import { EmailProviderConfigurationError } from "./email-errors.js";
import { hasUsableConfigValue } from "./config-values.js";

const sendGridApiBaseUrl = "https://api.sendgrid.com/v3";
const resendApiBaseUrl = "https://api.resend.com";

export function resendAdapter(): EmailProviderAdapter {
  return { provider: "resend", send: sendWithResend };
}

export function sendGridAdapter(): EmailProviderAdapter {
  return { provider: "sendgrid", send: sendWithSendGrid };
}

export function webhookAdapter(): EmailProviderAdapter {
  return { provider: "webhook", send: sendWithWebhook };
}

async function sendWithResend(input: SendInviteEmailInput): Promise<SendInviteEmailResult> {
  const apiKey = parseResendApiKey(process.env.RESEND_API_KEY);
  const fromEmail = process.env.EMAIL_FROM_ADDRESS;
  if (!apiKey || !fromEmail) {
    throw new EmailProviderConfigurationError("resend", "Resend 발송에는 RESEND_API_KEY와 EMAIL_FROM_ADDRESS가 필요합니다.");
  }

  const content = renderInviteEmail(input);
  const response = await fetch(`${process.env.RESEND_API_BASE_URL ?? resendApiBaseUrl}/emails`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({
      from: formatSender(fromEmail),
      to: [input.email],
      subject: content.subject,
      html: content.html,
      text: content.text,
      tags: [{ name: "candidate_id", value: emailTagValue(input.candidateId) }, { name: "exam_title", value: emailTagValue(input.examTitle) }]
    })
  });

  const body = await readProviderResponse(response);
  if (!response.ok) {
    throw new EmailProviderConfigurationError("resend", `Resend 발송 실패 (${response.status}): ${providerErrorMessage(body)}`);
  }

  const messageId = providerMessageId(body);
  return {
    delivered: true,
    provider: "resend",
    ...(messageId ? { providerMessageId: messageId } : {}),
    message: "Resend Email API로 초대 메일 발송 요청을 완료했습니다."
  };
}

async function sendWithSendGrid(input: SendInviteEmailInput): Promise<SendInviteEmailResult> {
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.EMAIL_FROM_ADDRESS;
  if (!apiKey || !fromEmail) {
    throw new EmailProviderConfigurationError("sendgrid", "SendGrid 발송에는 SENDGRID_API_KEY와 EMAIL_FROM_ADDRESS가 필요합니다.");
  }

  const content = renderInviteEmail(input);
  const response = await fetch(`${process.env.SENDGRID_API_BASE_URL ?? sendGridApiBaseUrl}/mail/send`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({
      personalizations: [
        {
          to: [{ email: input.email, name: input.candidateName }],
          custom_args: { candidateId: input.candidateId, examTitle: input.examTitle }
        }
      ],
      from: {
        email: fromEmail,
        name: process.env.EMAIL_FROM_NAME ?? "DCVP"
      },
      subject: content.subject,
      content: [
        {
          type: "text/html",
          value: content.html
        },
        {
          type: "text/plain",
          value: content.text
        }
      ]
    })
  });

  if (response.status !== 202) {
    throw new EmailProviderConfigurationError("sendgrid", `SendGrid 발송 실패 (${response.status}): ${await response.text()}`);
  }

  const messageId = response.headers.get("x-message-id");
  return {
    delivered: true,
    provider: "sendgrid",
    ...(messageId ? { providerMessageId: messageId } : {}),
    message: "SendGrid Mail Send API로 초대 메일 발송 요청을 완료했습니다."
  };
}

async function sendWithWebhook(input: SendInviteEmailInput): Promise<SendInviteEmailResult> {
  if (!process.env.EMAIL_WEBHOOK_URL) {
    throw new EmailProviderConfigurationError("webhook", "Webhook 발송에는 EMAIL_WEBHOOK_URL이 필요합니다.");
  }

  const content = renderInviteEmail(input);
  const response = await fetch(process.env.EMAIL_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(process.env.EMAIL_API_KEY ? { authorization: `Bearer ${process.env.EMAIL_API_KEY}` } : {})
    },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({
      to: input.email,
      subject: content.subject,
      html: content.html,
      text: content.text,
      data: input
    })
  });

  if (!response.ok) {
    throw new EmailProviderConfigurationError("webhook", `Webhook 발송 실패 (${response.status}): ${await response.text()}`);
  }

  const messageId = response.headers.get("x-message-id") ?? response.headers.get("x-request-id");
  return {
    delivered: true,
    provider: "webhook",
    ...(messageId ? { providerMessageId: messageId } : {}),
    message: "EMAIL_WEBHOOK_URL provider로 초대 메일 발송 요청을 완료했습니다."
  };
}

function formatSender(email: string) {
  const name = process.env.EMAIL_FROM_NAME ?? "DCVP";
  return `${name} <${email}>`;
}

function parseResendApiKey(value: string | undefined) {
  const apiKey = value?.trim();
  if (!apiKey || !hasUsableConfigValue(apiKey)) {
    throw new EmailProviderConfigurationError("resend", "Resend 발송에는 실제 RESEND_API_KEY가 필요합니다. placeholder 값은 사용할 수 없습니다.");
  }

  if (!apiKey.startsWith("re_")) {
    throw new EmailProviderConfigurationError("resend", "Resend API 키는 re_로 시작해야 합니다.");
  }
  return apiKey;
}

async function readProviderResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch (error) {
      if (error instanceof Error) {
        return { message: "Provider returned invalid JSON." };
      }
      throw error;
    }
  }

  const text = await response.text();
  return { message: redactSensitiveText(text) };
}

function redactSensitiveText(value: string) {
  return value.replace(/re_[A-Za-z0-9_]+/g, "[REDACTED_RESEND_API_KEY]").slice(0, 500);
}

function emailTagValue(value: string) {
  const normalized = value
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return normalized || "dcvp";
}
