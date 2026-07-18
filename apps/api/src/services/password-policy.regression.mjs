import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { BadRequestException, ServiceUnavailableException } from "@nestjs/common";
import { AdminSignupRequestsService } from "../../dist/services/admin-signup-requests.service.js";
import { AuthService } from "../../dist/services/auth.service.js";
import { createPasswordHash, isStrongPassword, verifyPassword } from "../../dist/services/password-hash.js";

const originalEnv = { ...process.env };

const unavailablePrisma = {
  user: {
    count: async () => 1,
    findUnique: async () => null
  }
};

try {
  process.env.DATABASE_URL = "postgresql://available";
  process.env.DISABLE_DATABASE = "0";

  // Given: passwords that meet and miss the required composition rules.
  // When: the central password policy evaluates them.
  // Then: only 12+ character passwords with three character groups pass.
  assert.equal(isStrongPassword("Password1!ab"), true);
  assert.equal(isStrongPassword("password1!ab"), true);
  assert.equal(isStrongPassword("Pass1!abcd"), false);
  assert.equal(isStrongPassword("alllowercase1"), false);
  assert.equal(isStrongPassword(undefined), false);
  assert.equal(isStrongPassword(null), false);

  const currentHash = await createPasswordHash("Password1!ab");
  assert.equal(await verifyPassword("Password1!ab", currentHash), true);
  let concurrentChecksSettled = false;
  const concurrentChecks = Promise.all(Array.from({ length: 4 }, () => verifyPassword("WrongPassword1!", currentHash))).then(() => {
    concurrentChecksSettled = true;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(concurrentChecksSettled, false);
  await concurrentChecks;

  // The KDF admission queue is bounded. A burst beyond the four active and
  // sixteen queued operations fails closed instead of growing without limit.
  const saturatedChecks = await Promise.allSettled(Array.from({ length: 21 }, () => verifyPassword("WrongPassword1!", currentHash)));
  assert.equal(saturatedChecks.filter((result) => result.status === "rejected").length, 1);
  assert.equal(saturatedChecks.some((result) => result.status === "rejected" && result.reason instanceof ServiceUnavailableException), true);

  const auth = new AuthService(unavailablePrisma);
  const signupRequests = new AdminSignupRequestsService(unavailablePrisma);
  const weakPassword = "alllowercase1";

  // Given: a weak password at every password-creation service boundary.
  // When: a caller attempts to create an account or organization-manager request.
  // Then: each boundary rejects the request before persisting credentials.
  await assert.rejects(
    () => auth.createInitialAdmin({ organizationName: "Acme", name: "Operator", email: "operator@example.test", password: weakPassword, privacyConsentAccepted: true, privacyPolicyVersion: "2026-07-18" }),
    (error) => error instanceof BadRequestException
  );
  await assert.rejects(
    () => auth.register({ name: "Candidate", email: "candidate@example.test", password: weakPassword, privacyConsentAccepted: true, privacyPolicyVersion: "2026-07-18" }),
    (error) => error instanceof BadRequestException
  );
  await assert.rejects(
    () => auth.register({ name: "Candidate", email: "candidate@example.test", password: undefined, privacyConsentAccepted: true, privacyPolicyVersion: "2026-07-18" }),
    (error) => error instanceof BadRequestException
  );
  await assert.rejects(
    () => signupRequests.createRequest({ organizationName: "Acme", name: "Manager", email: "manager@example.test", password: weakPassword, reason: "Need an exam workspace." }),
    (error) => error instanceof BadRequestException
  );

  const legacyPassword = "Legacy1!password";
  const legacyUser = {
    id: "user_legacy",
    email: "legacy@example.test",
    name: "Legacy User",
    passwordHash: createHash("sha256").update(legacyPassword).digest("hex"),
    role: "CANDIDATE",
    organizationId: null,
    createdAt: new Date("2026-07-16T00:00:00.000Z"),
    organization: null
  };
  const legacyPrisma = {
    user: {
      findUnique: async () => legacyUser,
      update: async ({ data }) => {
        legacyUser.passwordHash = data.passwordHash;
      return legacyUser;
    }
  },
  $transaction: async (operation) => operation(legacyPrisma)
};

  // Given: a preexisting SHA-256 password hash.
  // When: the account signs in with the correct password.
  // Then: authentication succeeds and the hash upgrades to PBKDF2.
  process.env.NODE_ENV = "production";
  process.env.ALLOW_DEMO_AUTH = "0";
  const legacySession = await new AuthService(legacyPrisma).login({ email: legacyUser.email, password: legacyPassword });
  assert.equal(legacySession.user.id, legacyUser.id);
  assert.equal(await verifyPassword(legacyPassword, legacyUser.passwordHash), true);

  console.log("password policy regression passed");
} finally {
  process.env = originalEnv;
}
