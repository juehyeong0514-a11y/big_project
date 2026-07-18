import assert from "node:assert/strict";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import { AuthService } from "../../dist/services/auth.service.js";
import { ensurePlatformSeedData } from "../../dist/services/platform-store.seed-data.js";
import { PlatformStoreState } from "../../dist/services/platform-store.state.js";
import { toPublicCandidateInvite } from "../../dist/services/platform-store.service.js";

const originalEnv = { ...process.env };

function createInitialAdminPrisma() {
  const users = [];
  const organizations = [];
  let directCountCalls = 0;
  let releaseDirectCounts;
  const directCountsReady = new Promise((resolve) => {
    releaseDirectCounts = resolve;
  });
  let transactionTail = Promise.resolve();

  const createOrganization = async ({ data }) => {
    const organization = { ...data, createdAt: new Date("2026-07-18T00:00:00.000Z") };
    organizations.push(organization);
    return organization;
  };
  const createUser = async ({ data }) => {
    const user = { ...data, organizationId: data.organizationId ?? null, createdAt: new Date("2026-07-18T00:00:00.000Z") };
    users.push(user);
    return user;
  };

  const transactionClient = {
    organization: { create: createOrganization },
    user: {
      count: async () => users.length,
      create: createUser
    }
  };

  return {
    organization: { create: createOrganization },
    user: {
      count: async () => {
        directCountCalls += 1;
        if (directCountCalls === 2) releaseDirectCounts();
        await directCountsReady;
        return users.length;
      },
      create: createUser
    },
    $transaction: async (operation) => {
      const previous = transactionTail;
      let releaseTransaction;
      transactionTail = new Promise((resolve) => {
        releaseTransaction = resolve;
      });
      await previous;
      try {
        return await operation(transactionClient);
      } finally {
        releaseTransaction();
      }
    },
    users,
    organizations
  };
}

class WorkspaceGuardStore extends PlatformStoreState {
  constructor() {
    super({}, {}, {}, {});
  }

  assertWorkspace(invite) {
    this.assertCandidateCanUseWorkspace(invite);
  }
}

try {
  process.env.DATABASE_URL = "postgresql://available";
  process.env.DISABLE_DATABASE = "0";
  process.env.NODE_ENV = "development";
  process.env.ALLOW_DEMO_AUTH = "0";

  // Given: two first-run administrator requests reach an empty database together.
  // When: both requests attempt setup concurrently.
  // Then: the serializable creation boundary permits exactly one administrator.
  const prisma = createInitialAdminPrisma();
  const auth = new AuthService(prisma);
  const requests = ["first", "second"].map((name) => auth.createInitialAdmin({
    organizationName: `${name} organization`,
    name,
    email: `${name}@example.test`,
    password: "Password1!ab",
    privacyConsentAccepted: true,
    privacyPolicyVersion: "2026-07-18"
  }));
  const setupResults = await Promise.allSettled(requests);
  assert.equal(setupResults.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(setupResults.filter((result) => result.status === "rejected" && result.reason instanceof ConflictException).length, 1);
  assert.equal(prisma.users.length, 1);
  assert.equal(prisma.organizations.length, 1);

  // Given: the API starts in production with an empty database.
  // When: a read path asks the seed helper to initialize data.
  // Then: no predictable demo organization, exam, or invite is created.
  process.env.NODE_ENV = "production";
  let productionSeedWrites = 0;
  const productionPrisma = {
    organization: { upsert: async () => { productionSeedWrites += 1; } },
    exam: { count: async () => 0, create: async () => { productionSeedWrites += 1; } },
    testCase: { count: async () => 0, createMany: async () => { productionSeedWrites += 1; } }
  };
  await ensurePlatformSeedData(productionPrisma, {
    organization: { id: "org_demo", name: "Demo", createdAt: new Date().toISOString() },
    exams: [],
    questions: [],
    candidates: [],
    testCases: []
  });
  assert.equal(productionSeedWrites, 0);

  // Given: a fully prepared candidate before the scheduled start time.
  // When: the candidate requests the exam workspace.
  // Then: server-side schedule enforcement denies early access.
  const guard = new WorkspaceGuardStore();
  assert.throws(() => guard.assertWorkspace({
    candidate: { id: "candidate_early", status: "READY" },
    exam: {
      id: "exam_future",
      status: "SCHEDULED",
      startAt: "2999-01-01T00:00:00.000Z",
      endAt: "2999-01-01T02:00:00.000Z",
      identityVerificationEnabled: false,
      mobileCameraRequired: false
    },
    environmentCheck: { requiredPassed: true },
    proctorDevices: []
  }), ForbiddenException);

  const publicInvite = toPublicCandidateInvite({
    candidate: { id: "candidate_early", status: "INVITED" },
    exam: { id: "exam_future" },
    organization: { id: "org", name: "Organization" },
    questions: [{ id: "secret-question", title: "Pre-start prompt" }],
    proctorDevices: []
  });
  assert.deepEqual(publicInvite.questions, []);

  console.log("security invariants regression passed");
} finally {
  process.env = originalEnv;
}
