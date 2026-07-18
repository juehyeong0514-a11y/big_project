import assert from "node:assert/strict";
import { OperationsReadinessService, hasUsableConfigValue } from "../../dist/services/operations-readiness.service.js";

assert.equal(hasUsableConfigValue(""), false);
assert.equal(hasUsableConfigValue("replace-me"), false);
assert.equal(hasUsableConfigValue("replace-with-rotated-resend-key"), false);
assert.equal(hasUsableConfigValue("your-key"), false);
assert.equal(hasUsableConfigValue("no-reply@example.com"), false);
assert.equal(hasUsableConfigValue("http://localhost:5173"), false);
assert.equal(hasUsableConfigValue("re_live_rotated_value"), true);
assert.equal(hasUsableConfigValue("no-reply@verified-company.com"), true);

const originalEnv = { ...process.env };

async function readinessWithEnv(env) {
  process.env = { ...originalEnv, ...env, DISABLE_DATABASE: "1" };
  const readiness = await new OperationsReadinessService({ user: { count: async () => 0 } }).getReadiness();
  return Object.fromEntries(readiness.checks.map((check) => [check.id, check.status]));
}

try {
  assert.deepEqual(
    await readinessWithEnv({
      EMAIL_PROVIDER: "resend",
      RESEND_API_KEY: "not-a-resend-key",
      EMAIL_FROM_ADDRESS: "no-reply@verified-company.com",
      KYC_SANDBOX_API_BASE_URL: "https://kyc.vendor.test",
      KYC_SANDBOX_API_KEY: "kyc-live-key"
    }),
    {
      database: "ACTION_REQUIRED",
      email: "ACTION_REQUIRED",
      kyc: "READY",
      "public-url": "WARNING",
      auth: "READY",
      "code-runner": "WARNING",
      proctor: "WARNING",
      "proctor-ice": "WARNING"
    }
  );

  assert.deepEqual(
    await readinessWithEnv({
      EMAIL_PROVIDER: "resend",
      RESEND_API_KEY: "re_live_rotated_value",
      EMAIL_FROM_ADDRESS: "no-reply@verified-company.com",
      WEB_PUBLIC_URL: "https://192.168.1.10",
      API_PUBLIC_URL: "https://10.0.0.10",
      KYC_SANDBOX_API_BASE_URL: "http://10.0.0.5",
      KYC_SANDBOX_API_KEY: "kyc-live-key"
    }),
    {
      database: "ACTION_REQUIRED",
      email: "READY",
      kyc: "ACTION_REQUIRED",
      "public-url": "WARNING",
      auth: "READY",
      "code-runner": "WARNING",
      proctor: "WARNING",
      "proctor-ice": "WARNING"
    }
  );

  assert.deepEqual(
    await readinessWithEnv({
      EMAIL_PROVIDER: "resend",
      RESEND_API_KEY: "re_live_rotated_value",
      EMAIL_FROM_ADDRESS: "no-reply@verified-company.com",
      WEB_PUBLIC_URL: "https://exam.verified-company.com",
      API_PUBLIC_URL: "https://api.verified-company.com",
      KYC_SANDBOX_API_BASE_URL: "https://kyc.vendor.test",
      KYC_SANDBOX_API_KEY: "kyc-live-key",
      PROCTOR_ICE_SERVERS: JSON.stringify([{ urls: "turns:turn.verified-company.com:5349", username: "turn-user", credential: "turn-secret" }])
    }),
    {
      database: "ACTION_REQUIRED",
      email: "READY",
      kyc: "READY",
      "public-url": "READY",
      auth: "READY",
      "code-runner": "WARNING",
      proctor: "READY",
      "proctor-ice": "READY"
    }
  );
} finally {
  process.env = originalEnv;
}

console.log("operations readiness placeholder regression passed");
