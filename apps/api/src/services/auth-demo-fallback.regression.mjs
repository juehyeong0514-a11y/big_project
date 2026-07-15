import assert from "node:assert/strict";
import { ServiceUnavailableException } from "@nestjs/common";
import { AuthService } from "../../dist/services/auth.service.js";

const originalEnv = { ...process.env };
const originalConsoleError = console.error;

try {
  process.env.DATABASE_URL = "postgresql://unavailable";
  process.env.DISABLE_DATABASE = "0";
  delete process.env.ALLOW_DEMO_AUTH;
  process.env.NODE_ENV = "development";

  let countAttempts = 0;
  let findUniqueAttempts = 0;
  const throwingPrisma = {
    user: {
      count: async () => {
        countAttempts += 1;
        throw new Error("database unavailable");
      },
      findUnique: async () => {
        findUniqueAttempts += 1;
        throw new Error("database unavailable");
      }
    }
  };

  const demoService = new AuthService(throwingPrisma);
  const setup = await demoService.setupStatus();
  const session = await demoService.login({ email: "admin@acme.test", password: "demo1234" });

  assert.deepEqual(setup, { enabled: false, reason: "DATABASE_UNAVAILABLE" });
  assert.equal(session.user.email, "admin@acme.test");
  assert.equal(countAttempts, 0);
  assert.equal(findUniqueAttempts, 0);

  process.env.NODE_ENV = "production";
  const productionService = new AuthService(throwingPrisma);
  console.error = () => undefined;
  await assert.rejects(
    () => productionService.login({ email: "admin@acme.test", password: "demo1234" }),
    (error) => error instanceof ServiceUnavailableException
  );
  console.error = originalConsoleError;

  console.log("auth demo fallback regression passed");
} finally {
  console.error = originalConsoleError;
  process.env = originalEnv;
}
