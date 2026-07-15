import assert from "node:assert/strict";
import { DashboardController } from "../../dist/modules/dashboard.controller.js";

const originalEnv = { ...process.env };

try {
  process.env = {
    ...originalEnv,
    WEB_PUBLIC_URL: "not a url",
    API_PUBLIC_URL: "https://10.0.0.10",
    WEB_PORT: "5173",
    PORT: "4000"
  };
  const fallbackAccess = new DashboardController({}).mobileAccess();
  assert.match(fallbackAccess.webBaseUrl, /^http:\/\//);
  assert.match(fallbackAccess.apiBaseUrl, /^http:\/\//);

  process.env = {
    ...originalEnv,
    WEB_PUBLIC_URL: "https://exam.company.com/",
    API_PUBLIC_URL: "https://api.exam.company.com/"
  };
  const publicAccess = new DashboardController({}).mobileAccess();
  assert.equal(publicAccess.host, "exam.company.com");
  assert.equal(publicAccess.webBaseUrl, "https://exam.company.com");
  assert.equal(publicAccess.apiBaseUrl, "https://api.exam.company.com");
} finally {
  process.env = originalEnv;
}

console.log("mobile access public URL regression passed");
