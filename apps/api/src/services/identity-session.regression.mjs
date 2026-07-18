import assert from "node:assert/strict";
import { createCandidateIdentitySessionInStore } from "../../dist/services/platform-store.identity-session.js";
import { assertIdentityPrivacyConsent } from "../../dist/services/platform-store.service.js";

const invite = {
  candidate: { id: "candidate_001", name: "Kim Minjun" },
  exam: { id: "exam_backend_001", identityVerificationEnabled: false }
};

let called = false;
const identityVerification = {
  createSession: async () => {
    called = true;
    return {};
  }
};

assert.throws(
  () => createCandidateIdentitySessionInStore(identityVerification, invite),
  (error) => error instanceof Error && error.message.includes("본인확인이 비활성화")
);
assert.equal(called, false);

assert.throws(() => assertIdentityPrivacyConsent(undefined), /동의/u);
assert.throws(() => assertIdentityPrivacyConsent({ privacyConsentAccepted: false, privacyPolicyVersion: "2026-07-18" }), /동의/u);
assert.throws(() => assertIdentityPrivacyConsent({ privacyConsentAccepted: true, privacyPolicyVersion: "stale" }), /동의/u);
assert.doesNotThrow(() => assertIdentityPrivacyConsent({ privacyConsentAccepted: true, privacyPolicyVersion: "2026-07-18" }));

console.log("identity session disabled exam regression passed");
