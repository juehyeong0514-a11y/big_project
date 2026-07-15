import assert from "node:assert/strict";
import { IdentityVerificationService } from "../../dist/services/identity-verification.service.js";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
const verifyInput = {
  candidateId: "candidate_001",
  candidateName: "Kim Minjun",
  examId: "exam_backend_001",
  providerSessionId: "session_123",
  documentCaptured: true,
  faceImageCaptured: true,
  livenessConfirmed: true,
  documentUploadRef: "doc_ref_123",
  faceUploadRef: "face_ref_123"
};

async function expectSessionRequestContract() {
  process.env.KYC_SANDBOX_API_BASE_URL = "https://kyc.test/";
  process.env.KYC_SANDBOX_API_KEY = "kyc-test-key";

  let requestUrl = "";
  let requestHeaders = {};
  let requestBody = {};
  globalThis.fetch = async (url, init) => {
    requestUrl = String(url);
    requestHeaders = init.headers;
    requestBody = JSON.parse(String(init.body));
    return Response.json({
      provider: "kyc-sandbox",
      providerSessionId: "session_123",
      documentUploadRef: "doc_ref_123",
      faceUploadRef: "face_ref_123",
      expiresAt: "2026-07-12T10:30:00.000Z"
    });
  };

  const session = await new IdentityVerificationService().createSession({
    candidateId: "candidate_001",
    candidateName: "Kim Minjun",
    examId: "exam_backend_001"
  });

  assert.equal(requestUrl, "https://kyc.test/identity/sessions");
  assert.equal(requestHeaders.authorization, "Bearer kyc-test-key");
  assert.deepEqual(requestBody, {
    candidate: { id: "candidate_001", name: "Kim Minjun" },
    examId: "exam_backend_001",
    requiredChecks: ["DOCUMENT_AUTHENTICITY", "FACE_MATCH", "LIVENESS", "OCR_NAME_MATCH"]
  });
  assert.deepEqual(session, {
    provider: "kyc-sandbox",
    providerSessionId: "session_123",
    documentUploadRef: "doc_ref_123",
    faceUploadRef: "face_ref_123",
    expiresAt: "2026-07-12T10:30:00.000Z"
  });
}

async function expectVerifyRequestAndNormalization() {
  process.env.KYC_SANDBOX_API_BASE_URL = "https://kyc.test";
  process.env.KYC_SANDBOX_API_KEY = "kyc-test-key";

  let requestBody = {};
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "https://kyc.test/identity/verify");
    requestBody = JSON.parse(String(init.body));
    return Response.json({
      provider: "kyc-sandbox",
      providerDecision: "VERIFIED",
      providerReferenceId: "verification_ref_123",
      documentAuthenticityScore: 97.6,
      faceMatchScore: 88.2,
      livenessScore: 100,
      ocrNameMatched: true,
      verificationChecks: ["DOCUMENT_AUTHENTICITY", "FACE_MATCH", "LIVENESS", "OCR_NAME_MATCH"]
    });
  };

  const result = await new IdentityVerificationService().verify(verifyInput);

  assert.deepEqual(requestBody, {
    candidate: { id: "candidate_001", name: "Kim Minjun" },
    examId: "exam_backend_001",
    providerSessionId: "session_123",
    documentUploadRef: "doc_ref_123",
    faceUploadRef: "face_ref_123",
    captureSignals: {
      documentCaptured: true,
      faceImageCaptured: true,
      livenessConfirmed: true
    }
  });
  assert.equal(result.providerDecision, "VERIFIED");
  assert.equal(result.providerReferenceId, "verification_ref_123");
  assert.equal(result.documentAuthenticityScore, 97.6);
  assert.equal(result.faceMatchScore, 88.2);
  assert.equal(result.livenessScore, 100);
  assert.equal(result.ocrNameMatched, true);
}

async function expectProviderFailureMessage() {
  process.env.KYC_SANDBOX_API_BASE_URL = "https://kyc.test";
  process.env.KYC_SANDBOX_API_KEY = "kyc-test-key";
  globalThis.fetch = async () => new Response("sandbox unavailable", { status: 503 });

  await assert.rejects(
    () =>
      new IdentityVerificationService().verify(verifyInput),
    (error) => error instanceof Error && error.message.includes("KYC provider 호출 실패 (503)") && !error.message.includes("sandbox unavailable")
  );
}

async function expectProviderContractRejectsMalformedSuccess() {
  process.env.KYC_SANDBOX_API_BASE_URL = "https://kyc.test";
  process.env.KYC_SANDBOX_API_KEY = "kyc-test-key";
  globalThis.fetch = async () =>
    Response.json({
      provider: "kyc-sandbox",
      providerDecision: "VERIFIED",
      documentAuthenticityScore: 91,
      faceMatchScore: 88,
      livenessScore: 91,
      ocrNameMatched: true,
      verificationChecks: ["FACE_MATCH"]
    });

  await assert.rejects(
    () =>
      new IdentityVerificationService().verify(verifyInput),
    (error) => error instanceof Error && error.message.includes("providerReferenceId")
  );
}

async function expectProviderContractRejectsAliasOnlySuccess() {
  process.env.KYC_SANDBOX_API_BASE_URL = "https://kyc.test";
  process.env.KYC_SANDBOX_API_KEY = "kyc-test-key";
  globalThis.fetch = async () =>
    Response.json({
      provider: "kyc-sandbox",
      decision: "VERIFIED",
      referenceId: "alias-ref",
      documentAuthenticityScore: 91,
      faceMatchScore: 88,
      livenessScore: 91,
      ocrNameMatched: true,
      verificationChecks: ["DOCUMENT_AUTHENTICITY", "FACE_MATCH", "LIVENESS", "OCR_NAME_MATCH"]
    });

  await assert.rejects(
    () =>
      new IdentityVerificationService().verify(verifyInput),
    (error) => error instanceof Error && error.message.includes("providerDecision")
  );
}

async function expectProviderFailureReasonSanitized() {
  process.env.KYC_SANDBOX_API_BASE_URL = "https://kyc.test";
  process.env.KYC_SANDBOX_API_KEY = "kyc-test-key";
  globalThis.fetch = async () =>
    Response.json({
      provider: "kyc-sandbox",
      providerDecision: "REJECTED",
      providerReferenceId: "rejected-ref",
      failureReason: "raw provider PII: passport 1234",
      documentAuthenticityScore: 91,
      faceMatchScore: 88,
      livenessScore: 91,
      ocrNameMatched: true,
      verificationChecks: []
    });

  const result = await new IdentityVerificationService().verify(verifyInput);

  assert.equal(result.failureReason, "KYC provider가 본인확인을 거절했습니다.");
}

async function expectUnsafeKycBaseUrlRejected() {
  process.env.KYC_SANDBOX_API_BASE_URL = "http://10.0.0.5";
  process.env.KYC_SANDBOX_API_KEY = "kyc-test-key";

  await assert.rejects(
    () =>
      new IdentityVerificationService().verify(verifyInput),
    (error) => error instanceof Error && error.message.includes("KYC provider base URL")
  );
}

async function expectRawUploadReferenceRejectedBeforeProviderCall() {
  process.env.KYC_SANDBOX_API_BASE_URL = "https://kyc.test";
  process.env.KYC_SANDBOX_API_KEY = "kyc-test-key";
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return Response.json({});
  };

  await assert.rejects(
    () =>
      new IdentityVerificationService().verify({ ...verifyInput, documentUploadRef: "DATA:image/png;base64,abc123" }),
    (error) => error instanceof Error && error.message.includes("upload reference")
  );
  assert.equal(called, false);
}

try {
  await expectSessionRequestContract();
  await expectVerifyRequestAndNormalization();
  await expectProviderFailureMessage();
  await expectProviderContractRejectsMalformedSuccess();
  await expectProviderContractRejectsAliasOnlySuccess();
  await expectProviderFailureReasonSanitized();
  await expectUnsafeKycBaseUrlRejected();
  await expectRawUploadReferenceRejectedBeforeProviderCall();
  console.log("identity provider regression passed");
} finally {
  globalThis.fetch = originalFetch;
  process.env = originalEnv;
}
