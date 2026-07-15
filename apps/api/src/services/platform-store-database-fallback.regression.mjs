import assert from "node:assert/strict";
import { ServiceUnavailableException } from "@nestjs/common";
import { PlatformStoreState } from "../../dist/services/platform-store.state.js";

class TestStore extends PlatformStoreState {
  constructor() {
    super({}, {}, {}, {});
  }

  run(operation) {
    return this.tryDatabase(operation);
  }
}

const originalEnv = { ...process.env };
const originalConsoleError = console.error;

try {
  process.env.DATABASE_URL = "postgresql://unavailable";
  process.env.DISABLE_DATABASE = "0";
  delete process.env.ALLOW_DEMO_AUTH;
  process.env.NODE_ENV = "development";

  const demoStore = new TestStore();
  let demoAttempts = 0;
  const demoResult = await demoStore.run(async () => {
    demoAttempts += 1;
    throw new Error("database unavailable");
  });

  assert.equal(demoResult, null);
  assert.equal(demoAttempts, 0);

  process.env.ALLOW_DEMO_AUTH = "0";
  let fallbackAttempts = 0;
  const fallbackStore = new TestStore();
  const first = await fallbackStore.run(async () => {
    fallbackAttempts += 1;
    throw new Error("database unavailable");
  });
  const second = await fallbackStore.run(async () => {
    fallbackAttempts += 1;
    throw new Error("database unavailable");
  });

  assert.equal(first, null);
  assert.equal(second, null);
  assert.equal(fallbackAttempts, 1);

  process.env.NODE_ENV = "production";
  const productionStore = new TestStore();
  console.error = () => undefined;
  await assert.rejects(
    () => productionStore.run(async () => {
      throw new Error("database unavailable");
    }),
    (error) => error instanceof ServiceUnavailableException
  );
  console.error = originalConsoleError;

  console.log("platform store database fallback regression passed");
} finally {
  console.error = originalConsoleError;
  process.env = originalEnv;
}
