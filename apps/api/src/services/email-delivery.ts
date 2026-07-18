import type { EmailProvider, EmailProviderAdapter, SendInviteEmailInput, SendInviteEmailResult } from "./email.types.js";
import { providerErrorMessage, providerMessageId } from "./email-provider-response.js";
import { renderInviteEmail } from "./email-template.js";
import { EmailProviderConfigurationError } from "./email-errors.js";
import { hasUsableConfigValue } from "./config-values.js";
import { OutboundRequestSecurityError, readBoundedJson, readBoundedText, secureOutboundFetch } from "./outbound-http-security.js";

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
  const response = await providerFetch("resend", `${process.env.RESEND_API_BASE_URL ?? resendApiBaseUrl}/emails`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
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
    throw new EmailProviderConfigurationError("resend", `Resend 발송 실패 (${response.status}): ${redactSensitiveText(providerErrorMessage(body))}`);
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
  const response = await providerFetch("sendgrid", `${process.env.SENDGRID_API_BASE_URL ?? sendGridApiBaseUrl}/mail/send`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
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
    throw new EmailProviderConfigurationError("sendgrid", `SendGrid 발송 실패 (${response.status}): ${redactSensitiveText(await boundedProviderText("sendgrid", response))}`);
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
  const response = await providerFetch("webhook", process.env.EMAIL_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(process.env.EMAIL_API_KEY ? { authorization: `Bearer ${process.env.EMAIL_API_KEY}` } : {})
    },
    body: JSON.stringify({
      to: input.email,
      subject: content.subject,
      html: content.html,
      text: content.text,
      data: input
    })
  });

  if (!response.ok) {
    throw new EmailProviderConfigurationError("webhook", `Webhook 발송 실패 (${response.status}): ${redactSensitiveText(await boundedProviderText("webhook", response))}`);
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
      return await readBoundedJson(response);
    } catch (error) {
      if (error instanceof OutboundRequestSecurityError) {
        return { message: "Provider returned invalid JSON." };
      }
      throw error;
    }
  }

  const text = await boundedProviderText("resend", response);
  return { message: redactSensitiveText(text) };
}

async function providerFetch(provider: EmailProvider, url: string, init: RequestInit): Promise<Response> {
  try {
    return await secureOutboundFetch(url, init, 15_000);
  } catch (error) {
    if (error instanceof OutboundRequestSecurityError) {
      throw new EmailProviderConfigurationError(provider, `${provider} 외부 연결 설정이 안전하지 않거나 응답하지 않습니다.`);
    }
    throw error;
  }
}

async function boundedProviderText(provider: EmailProvider, response: Response): Promise<string> {
  try {
    return await readBoundedText(response);
  } catch (error) {
    if (error instanceof OutboundRequestSecurityError) {
      throw new EmailProviderConfigurationError(provider, `${provider} 응답 크기가 허용 범위를 초과했습니다.`);
    }
    throw error;
  }
}

function redactSensitiveText(value: string) {
  let redacted = value
    .replace(/re_[A-Za-z0-9_]+/gu, "[REDACTED_API_KEY]")
    .replace(/SG\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/gu, "[REDACTED_API_KEY]")
    .replace(/sk-[A-Za-z0-9_-]+/gu, "[REDACTED_API_KEY]");
  for (const secret of [process.env.RESEND_API_KEY, process.env.SENDGRID_API_KEY, process.env.EMAIL_API_KEY]) {
    if (secret?.trim()) redacted = redacted.replaceAll(secret.trim(), "[REDACTED_API_KEY]");
  }
  return redacted.slice(0, 500);
}

function emailTagValue(value: string) {
  const normalized = value
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return normalized || "dcvp";
}
