import assert from "node:assert/strict";
import { providerBaseUrl } from "../../dist/services/identity-provider-security.js";

const originalEnv = { ...process.env };

try {
  for (const baseUrl of ["https://[fd00::1]", "https://[fe80::1]", "https://[::ffff:10.0.0.5]"]) {
    process.env.KYC_SANDBOX_API_BASE_URL = baseUrl;
    assert.throws(
      () => providerBaseUrl(),
      (error) => error instanceof Error && error.message.includes("KYC provider base URL")
    );
  }

  process.env.KYC_SANDBOX_API_BASE_URL = "https://kyc.example.com/";
  assert.equal(providerBaseUrl(), "https://kyc.example.com");

  console.log("identity provider security regression passed");
} finally {
  process.env = originalEnv;
}
