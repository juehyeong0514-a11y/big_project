import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BadRequestException, ServiceUnavailableException } from "@nestjs/common";
import { AiEvaluationService } from "../../dist/services/ai-evaluation.service.js";
import { AuthService } from "../../dist/services/auth.service.js";
import { AuthSessionRegistry } from "../../dist/services/auth-session-registry.js";
import { createEnvironmentCheckSession } from "../../dist/services/environment-check-evidence.js";
import { IdentityVerificationService } from "../../dist/services/identity-verification.service.js";
import { AccountCreationRateLimiter, CandidateExecutionRateLimiter, LoginRateLimiter } from "../../dist/services/login-rate-limiter.js";
import { CodeRunnerService } from "../../dist/services/code-runner.service.js";

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

try {
  process.env.NODE_ENV = "development";
  process.env.ALLOW_DEMO_AUTH = "1";
  delete process.env.DATABASE_URL;

  // Given: the development quick-login password shown by the web application.
  // When: the demo fallback authenticates the account.
  // Then: the displayed credential works instead of silently using an older password.
  const demoSession = await new AuthService({}).login({ email: "admin@acme.test", password: "@A1234567890" });
  assert.equal(demoSession.user.role, "ADMIN");

  const originalNow = Date.now;
  try {
    let now = Date.parse("2026-07-18T00:00:00.000Z");
    Date.now = () => now;
    const revokedTokens = [];
    const sessions = new AuthSessionRegistry((session) => revokedTokens.push(session.token));
    sessions.set(demoSession.token, demoSession);
    assert.equal(sessions.get(demoSession.token)?.token, demoSession.token);
    now += 31 * 60 * 1000;
    assert.equal(sessions.get(demoSession.token), undefined);
    assert.deepEqual(revokedTokens, [demoSession.token]);
  } finally {
    Date.now = originalNow;
  }

  const passiveRevocations = [];
  const passiveSessions = new AuthSessionRegistry((session) => passiveRevocations.push(session.token), { absoluteTtlMs: 40, idleTtlMs: 40 });
  passiveSessions.set(demoSession.token, demoSession);
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.deepEqual(passiveRevocations, [demoSession.token]);

  const logoutAuth = new AuthService({});
  const logoutSession = await logoutAuth.login({ email: "admin@acme.test", password: "@A1234567890" });
  const logoutRevocations = [];
  logoutAuth.onSessionRevoked((session) => logoutRevocations.push(session.token));
  logoutAuth.logout(logoutSession.token);
  assert.deepEqual(logoutRevocations, [logoutSession.token]);

  const loginRateLimiter = new LoginRateLimiter();
  const loginRequest = { socket: { remoteAddress: "203.0.113.10" }, headers: {} };
  for (let attempt = 0; attempt < 10; attempt += 1) {
    assert.equal(loginRateLimiter.consume(loginRequest, "limited@example.test", 1_000), null);
  }
  assert.equal(loginRateLimiter.consume(loginRequest, "limited@example.test", 1_000), 60);
  assert.equal(loginRateLimiter.consume(loginRequest, "limited@example.test", 61_001), null);

  // A single client rotating account identifiers must not exhaust a shared
  // global bucket and deny authentication to an unrelated client/account.
  const poisoningLimiter = new LoginRateLimiter();
  const attackerRequest = { socket: { remoteAddress: "203.0.113.11" }, headers: {} };
  for (let attempt = 0; attempt < 61; attempt += 1) {
    poisoningLimiter.consume(attackerRequest, `rotated-${attempt}@example.test`, 1_000);
  }
  const legitimateRequest = { socket: { remoteAddress: "203.0.113.12" }, headers: {} };
  assert.equal(poisoningLimiter.consume(legitimateRequest, "legitimate@example.test", 1_000), null);

  const accountCreationRateLimiter = new AccountCreationRateLimiter();
  for (let attempt = 0; attempt < 6; attempt += 1) {
    assert.equal(accountCreationRateLimiter.consume(loginRequest, `registration-${attempt}@example.test`, 1_000), null);
  }
  assert.equal(accountCreationRateLimiter.consume(loginRequest, "registration-overflow@example.test", 1_000), 60);

  const unavailableRegistrationAuth = new AuthService({
    user: {
      findUnique: async () => { throw new Error("database unavailable"); }
    }
  });
  process.env.DATABASE_URL = "postgresql://configured-but-unavailable";
  process.env.DISABLE_DATABASE = "0";
  await assert.rejects(
    () => unavailableRegistrationAuth.register({
      name: "Unavailable DB User",
      email: "db-unavailable@example.test",
      password: "Password1!ab",
      privacyConsentAccepted: true,
      privacyPolicyVersion: "2026-07-18"
    }),
    (error) => error instanceof ServiceUnavailableException
  );

  const executionRateLimiter = new CandidateExecutionRateLimiter();
  for (let attempt = 0; attempt < 6; attempt += 1) {
    assert.equal(executionRateLimiter.consume(loginRequest, "invite-limited", 1_000), null);
  }
  assert.equal(executionRateLimiter.consume(loginRequest, "invite-limited", 1_000), 60);

  const runner = new CodeRunnerService();
  const releaseRuns = [];
  let activeRuns = 0;
  let maximumActiveRuns = 0;
  runner.judgeAdmitted = async () => new Promise((resolve) => {
    activeRuns += 1;
    maximumActiveRuns = Math.max(maximumActiveRuns, activeRuns);
    releaseRuns.push(() => {
      activeRuns -= 1;
      resolve({ status: "SUCCESS", output: "", executionTimeMs: 0, memoryUsageMb: 0, passedTests: 0, totalTests: 0, testResults: [] });
    });
  });
  const runnerPromises = [
    runner.judge("javascript", "code", [], "candidate-a"),
    runner.judge("javascript", "code", [], "candidate-b"),
    runner.judge("javascript", "code", [], "candidate-c")
  ];
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(maximumActiveRuns, 2);
  releaseRuns.shift()();
  await new Promise((resolve) => setImmediate(resolve));
  while (releaseRuns.length > 0) releaseRuns.shift()();
  await Promise.all(runnerPromises);
  assert.equal(maximumActiveRuns, 2);

  let createdUserData;
  const registrationPrisma = {
    user: {
      findUnique: async () => null,
      create: async ({ data }) => {
        createdUserData = data;
        return {
          ...data,
          organizationId: null,
          createdAt: new Date("2026-07-18T00:00:00.000Z")
        };
      }
    }
  };
  process.env.DATABASE_URL = "postgresql://available";
  process.env.DISABLE_DATABASE = "0";
  process.env.ALLOW_DEMO_AUTH = "0";
  const registrationAuth = new AuthService(registrationPrisma);

  // Given: registration without informed privacy consent.
  // When: the account creation boundary parses the request.
  // Then: it rejects before storing any personal information.
  await assert.rejects(
    () => registrationAuth.register({
      name: "Consent User",
      email: "consent@example.test",
      password: "Password1!ab",
      privacyConsentAccepted: false,
      privacyPolicyVersion: "2026-07-18"
    }),
    (error) => error instanceof BadRequestException
  );

  // Given: explicit consent to the current privacy policy.
  // When: registration succeeds.
  // Then: the version and acceptance time are stored as audit evidence.
  await registrationAuth.register({
    name: "Consent User",
    email: "consent@example.test",
    password: "Password1!ab",
    privacyConsentAccepted: true,
    privacyPolicyVersion: "2026-07-18"
  });
  assert.equal(createdUserData.privacyConsentVersion, "2026-07-18");
  assert.equal(createdUserData.privacyConsentAcceptedAt instanceof Date, true);

  process.env.KYC_SANDBOX_API_BASE_URL = "http://127.0.0.1:4050";
  process.env.KYC_SANDBOX_API_KEY = "test-key";
  let kycRequestInit;
  globalThis.fetch = async (_url, init) => {
    kycRequestInit = init;
    return Response.json({
      provider: "test-provider",
      providerSessionId: "session-1",
      documentUploadRef: "document-1",
      faceUploadRef: "face-1",
      expiresAt: "2026-07-18T01:00:00.000Z"
    });
  };

  // Given: an outbound KYC request.
  // When: the provider is called.
  // Then: redirects are blocked and the request has a bounded lifetime.
  await new IdentityVerificationService().createSession({ candidateId: "candidate-1", candidateName: "Kim", examId: "exam-1" });
  assert.equal(kycRequestInit.redirect, "error");
  assert.equal(kycRequestInit.signal instanceof AbortSignal, true);

  globalThis.fetch = async () => Response.json({
    provider: "test-provider",
    providerSessionId: "session-1",
    documentUploadRef: "document-1",
    faceUploadRef: "face-1",
    expiresAt: "x".repeat(70_000)
  });
  await assert.rejects(
    () => new IdentityVerificationService().createSession({ candidateId: "candidate-1", candidateName: "Kim", examId: "exam-1" }),
    (error) => error instanceof ServiceUnavailableException
  );

  let aiFetchCalls = 0;
  process.env.AI_API_BASE_URL = "http://169.254.169.254/latest/meta-data";
  globalThis.fetch = async () => {
    aiFetchCalls += 1;
    throw new Error("network must not be reached");
  };
  await assert.rejects(() => new AiEvaluationService().generateReport({
    examSessionId: "session-1",
    candidateId: "candidate-1",
    examId: "exam-1",
    signals: { submissions: 0, passedTests: 0, failedTests: 0, codeRuns: 0, pasteEvents: 0, riskScore: 0, elapsedMinutes: 0 }
  }));
  assert.equal(aiFetchCalls, 0);

  process.env.NODE_ENV = "production";
  await assert.rejects(
    () => new CodeRunnerService().judge("javascript", "function solution(input) { return input; }", [], "candidate-production"),
    (error) => error instanceof ServiceUnavailableException
  );
  delete process.env.ENVIRONMENT_CHECK_SECRET;
  delete process.env.AUTH_SESSION_SECRET;
  assert.throws(() => createEnvironmentCheckSession("invite-token"), ServiceUnavailableException);
  process.env.ENVIRONMENT_CHECK_SECRET = "too-short";
  assert.throws(() => createEnvironmentCheckSession("invite-token"), ServiceUnavailableException);

  const codeRunnerSource = readFileSync(new URL("./code-runner.service.ts", import.meta.url), "utf8");
  for (const requiredFlag of ["--read-only", "--cap-drop", "--security-opt", "no-new-privileges", "--user", "--tmpfs"]) {
    assert.match(codeRunnerSource, new RegExp(requiredFlag));
  }
  assert.match(codeRunnerSource, /MAX_JUDGE_DURATION_MS = 30_000/u);
  const passwordHashSource = readFileSync(new URL("./password-hash.ts", import.meta.url), "utf8");
  assert.match(passwordHashSource, /maxConcurrentPasswordKdf = 4/u);
  assert.match(passwordHashSource, /maxQueuedPasswordKdf = 16/u);
  assert.match(passwordHashSource, /passwordKdfQueueTimeoutMs = 5_000/u);
  assert.match(codeRunnerSource, /deadlineAt - Date\.now\(\)/u);

  const examContentSource = readFileSync(new URL("./platform-store.exam-content.ts", import.meta.url), "utf8");
  assert.match(examContentSource, /createSecretToken\("invite"\)/u);

  const gatewaySource = readFileSync(new URL("../modules/proctor.gateway.ts", import.meta.url), "utf8");
  assert.doesNotMatch(gatewaySource, /origin:\s*true/u);

  const apiDockerfile = readFileSync(new URL("../../Dockerfile", import.meta.url), "utf8");
  assert.match(apiDockerfile, /^USER node$/mu);

  console.log("security hardening regression passed");
} finally {
  process.env = originalEnv;
  globalThis.fetch = originalFetch;
}
