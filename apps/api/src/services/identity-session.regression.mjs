import assert from "node:assert/strict";
import { createCandidateIdentitySessionInStore } from "../../dist/services/platform-store.identity-session.js";

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

console.log("identity session disabled exam regression passed");
