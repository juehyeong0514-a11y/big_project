import assert from "node:assert/strict";
import { EmailService } from "../../dist/services/email.service.js";
import { EmailProviderConfigurationError } from "../../dist/services/email-errors.js";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

async function expectMissingConfigFailure() {
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM_ADDRESS;
  process.env.EMAIL_PROVIDER = "resend";

  await assert.rejects(
    () => new EmailService().sendInvite(sampleInvite()),
    (error) => error instanceof EmailProviderConfigurationError && error.provider === "resend" && error.message.includes("RESEND_API_KEY")
  );
}

async function expectPlaceholderConfigFailure() {
  process.env.EMAIL_PROVIDER = "resend";
  process.env.RESEND_API_KEY = "replace-with-rotated-resend-key";
  process.env.EMAIL_FROM_ADDRESS = "no-reply@example.com";

  await assert.rejects(
    () => new EmailService().sendInvite(sampleInvite()),
    (error) => error instanceof EmailProviderConfigurationError && error.provider === "resend" && error.message.includes("실제 RESEND_API_KEY")
  );
}

async function expectInvalidResendKeyShapeFailure() {
  process.env.EMAIL_PROVIDER = "resend";
  process.env.RESEND_API_KEY = "not-a-resend-key";
  process.env.EMAIL_FROM_ADDRESS = "no-reply@example.com";

  await assert.rejects(
    () => new EmailService().sendInvite(sampleInvite()),
    (error) => error instanceof EmailProviderConfigurationError && error.provider === "resend" && error.message.includes("re_로 시작")
  );
}

async function expectResendPayloadAndMessageId() {
  process.env.EMAIL_PROVIDER = "resend";
  process.env.RESEND_API_KEY = "re_test_resend_key";
  process.env.EMAIL_FROM_ADDRESS = "no-reply@example.com";
  process.env.EMAIL_FROM_NAME = "DCVP Tests";
  process.env.RESEND_API_BASE_URL = "https://resend.test";

  let requestUrl = "";
  let requestHeaders = {};
  let requestBody = {};
  globalThis.fetch = async (url, init) => {
    requestUrl = String(url);
    requestHeaders = init.headers;
    requestBody = JSON.parse(String(init.body));
    return Response.json({ id: "email_test_123" }, { status: 200 });
  };

  const result = await new EmailService().sendInvite(sampleInvite());

  assert.equal(requestUrl, "https://resend.test/emails");
  assert.equal(requestHeaders.authorization, "Bearer re_test_resend_key");
  assert.equal(requestBody.from, "DCVP Tests <no-reply@example.com>");
  assert.deepEqual(requestBody.to, ["candidate@example.com"]);
  assert.match(requestBody.subject, /Backend Screening/);
  assert.ok(requestBody.html.includes("https://exam.example.com/candidate/invite_demo_001"));
  assert.match(requestBody.text, /홍길동님/);
  assert.deepEqual(requestBody.tags, [
    { name: "candidate_id", value: "candidate_001" },
    { name: "exam_title", value: "Backend-Screening" }
  ]);
  assert.deepEqual(result, {
    delivered: true,
    provider: "resend",
    providerMessageId: "email_test_123",
    message: "Resend Email API로 초대 메일 발송 요청을 완료했습니다."
  });
}

async function expectResendFailureMessage() {
  process.env.EMAIL_PROVIDER = "resend";
  process.env.RESEND_API_KEY = "re_test_resend_key";
  process.env.EMAIL_FROM_ADDRESS = "no-reply@example.com";
  process.env.RESEND_API_BASE_URL = "https://resend.test";

  globalThis.fetch = async () => Response.json({ message: "API key is invalid" }, { status: 401 });

  await assert.rejects(
    () => new EmailService().sendInvite(sampleInvite()),
    (error) => error instanceof EmailProviderConfigurationError && error.message === "Resend 발송 실패 (401): API 키가 유효하지 않습니다."
  );
}

async function expectNonJsonProviderFailureMessage() {
  process.env.EMAIL_PROVIDER = "resend";
  process.env.RESEND_API_KEY = "re_test_resend_key";
  process.env.EMAIL_FROM_ADDRESS = "no-reply@example.com";
  process.env.RESEND_API_BASE_URL = "https://resend.test";

  globalThis.fetch = async () => new Response("upstream unavailable", { status: 503 });

  await assert.rejects(
    () => new EmailService().sendInvite(sampleInvite()),
    (error) => error instanceof EmailProviderConfigurationError && error.message === "Resend 발송 실패 (503): upstream unavailable"
  );
}

function sampleInvite() {
  return {
    candidateId: "candidate_001",
    candidateName: "홍길동",
    email: "candidate@example.com",
    examTitle: "Backend Screening",
    inviteUrl: "https://exam.example.com/candidate/invite_demo_001"
  };
}

try {
  await expectMissingConfigFailure();
  await expectPlaceholderConfigFailure();
  await expectInvalidResendKeyShapeFailure();
  await expectResendPayloadAndMessageId();
  await expectResendFailureMessage();
  await expectNonJsonProviderFailureMessage();
  console.log("resend email provider regression passed");
} finally {
  globalThis.fetch = originalFetch;
  process.env = originalEnv;
}
