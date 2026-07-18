import assert from "node:assert/strict";
import { BadRequestException } from "@nestjs/common";
import { verifyCandidateIdentityInStore } from "../../dist/services/platform-store.identity-environment.js";

const invite = {
  candidate: { id: "candidate_001", name: "Kim Minjun", identityPrivacyConsentVersion: "2026-07-18", identityPrivacyConsentAcceptedAt: "2026-07-18T00:00:00.000Z" },
  exam: { id: "exam_backend_001", identityVerificationEnabled: true }
};
const requiredChecks = ["DOCUMENT_AUTHENTICITY", "FACE_MATCH", "LIVENESS", "OCR_NAME_MATCH"];

const baseInput = {
  providerSessionId: "contract-session",
  documentUploadRef: "contract-doc-ref",
  faceUploadRef: "contract-face-ref",
  documentCaptured: true,
  faceImageCaptured: true,
  livenessConfirmed: true
};

const context = {
  prisma: {},
  runDatabase: async () => null,
  identityVerification: {
    verify: async () => ({
      documentAuthenticityScore: 96,
      faceMatchScore: 94,
      livenessScore: 93,
      ocrNameMatched: true,
      verificationChecks: requiredChecks,
      provider: "kyc-contract",
      providerDecision: "VERIFIED",
      providerReferenceId: "contract-verified-ref"
    })
  }
};

await assert.rejects(
  () => verifyCandidateIdentityInStore({
    context,
    invite: { ...invite, candidate: { id: "candidate_without_consent", name: "No Consent" } },
    input: baseInput,
    memoryVerifications: []
  }),
  (error) => error instanceof BadRequestException && error.message.includes("개인정보 처리방침")
);

const result = await verifyCandidateIdentityInStore({
  context,
  invite,
  input: baseInput,
  memoryVerifications: []
});

assert.equal(result.verification.status, "VERIFIED");
assert.equal(result.verification.failureReason, undefined);
assert.equal(result.verification.providerDecision, "VERIFIED");
assert.equal(result.verification.documentImageName, "document-capture-confirmed");
assert.equal(result.verification.privacyConsentVersion, "2026-07-18");
assert.equal(result.verification.privacyConsentAcceptedAt, "2026-07-18T00:00:00.000Z");

const lowScoreContext = {
  prisma: {},
  runDatabase: async () => null,
  identityVerification: {
    verify: async () => ({
      documentAuthenticityScore: 84,
      faceMatchScore: 94,
      livenessScore: 93,
      ocrNameMatched: true,
      verificationChecks: requiredChecks,
      provider: "kyc-contract",
      providerDecision: "VERIFIED",
      providerReferenceId: "contract-low-score-ref"
    })
  }
};

const lowScoreResult = await verifyCandidateIdentityInStore({
  context: lowScoreContext,
  invite,
  input: baseInput,
  memoryVerifications: []
});

assert.equal(lowScoreResult.verification.status, "FAILED");
assert.equal(lowScoreResult.verification.failureReason, "KYC provider 점수 기준을 충족하지 못했습니다.");
assert.equal(lowScoreResult.verification.providerDecision, "VERIFIED");

const fractionalLowScoreContext = {
  prisma: {},
  runDatabase: async () => null,
  identityVerification: {
    verify: async () => ({
      documentAuthenticityScore: 84.6,
      faceMatchScore: 94,
      livenessScore: 93,
      ocrNameMatched: true,
      verificationChecks: requiredChecks,
      provider: "kyc-contract",
      providerDecision: "VERIFIED",
      providerReferenceId: "contract-fractional-low-score-ref"
    })
  }
};

const fractionalLowScoreResult = await verifyCandidateIdentityInStore({
  context: fractionalLowScoreContext,
  invite,
  input: baseInput,
  memoryVerifications: []
});

assert.equal(fractionalLowScoreResult.verification.status, "FAILED");
assert.equal(fractionalLowScoreResult.verification.documentAuthenticityScore, 84.6);

const rejectedContext = {
  prisma: {},
  runDatabase: async () => null,
  identityVerification: {
    verify: async () => ({
      documentAuthenticityScore: 96,
      faceMatchScore: 94,
      livenessScore: 93,
      ocrNameMatched: true,
      verificationChecks: [],
      provider: "kyc-contract",
      providerDecision: "REJECTED",
      providerReferenceId: "contract-rejected-ref",
      failureReason: "raw provider PII: passport 1234"
    })
  }
};

const rejectedResult = await verifyCandidateIdentityInStore({
  context: rejectedContext,
  invite,
  input: baseInput,
  memoryVerifications: []
});

assert.equal(rejectedResult.verification.status, "FAILED");
assert.equal(rejectedResult.verification.failureReason, "KYC provider가 본인확인을 승인하지 않았습니다.");

const emptyChecksContext = {
  prisma: {},
  runDatabase: async () => null,
  identityVerification: {
    verify: async () => ({
      documentAuthenticityScore: 96,
      faceMatchScore: 94,
      livenessScore: 93,
      ocrNameMatched: true,
      verificationChecks: [],
      provider: "kyc-contract",
      providerDecision: "VERIFIED",
      providerReferenceId: "contract-empty-checks-ref"
    })
  }
};

const emptyChecksResult = await verifyCandidateIdentityInStore({
  context: emptyChecksContext,
  invite,
  input: baseInput,
  memoryVerifications: []
});

assert.equal(emptyChecksResult.verification.status, "FAILED");
assert.deepEqual(emptyChecksResult.verification.verificationChecks, []);

await assert.rejects(
  () =>
    verifyCandidateIdentityInStore({
      context,
      invite: { ...invite, exam: { id: "exam_no_identity", identityVerificationEnabled: false } },
      input: baseInput,
      memoryVerifications: []
    }),
  (error) => error instanceof Error && error.message.includes("본인확인이 비활성화")
);

console.log("identity store provider decision regression passed");
