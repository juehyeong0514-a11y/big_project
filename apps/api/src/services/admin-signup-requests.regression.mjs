import assert from "node:assert/strict";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import { AdminSignupRequestsService } from "../../dist/services/admin-signup-requests.service.js";

const originalEnv = { ...process.env };

function createMemoryPrisma() {
  const state = {
    users: [],
    organizations: [],
    requests: []
  };
  const prisma = {
    user: {
      findUnique: async ({ where }) => state.users.find((user) => user.email === where.email) ?? null,
      create: async ({ data }) => {
        const user = { ...data, createdAt: new Date("2026-07-13T00:00:00.000Z") };
        state.users.push(user);
        return user;
      },
      update: async ({ where, data }) => {
        const index = state.users.findIndex((user) => user.id === where.id);
        assert.notEqual(index, -1);
        const updated = { ...state.users[index], ...data };
        state.users[index] = updated;
        return updated;
      }
    },
    organization: {
      create: async ({ data }) => {
        const organization = { ...data, createdAt: new Date("2026-07-13T00:00:00.000Z") };
        state.organizations.push(organization);
        return organization;
      }
    },
    adminSignupRequest: {
      findFirst: async ({ where }) => state.requests.find((request) => request.email === where.email && request.status === where.status) ?? null,
      findMany: async () => [...state.requests],
      findUnique: async ({ where }) => state.requests.find((request) => request.id === where.id) ?? null,
      create: async ({ data }) => {
        const request = {
          ...data,
          status: "PENDING",
          rejectionReason: null,
          reviewedById: null,
          approvedUserId: null,
          createdAt: new Date("2026-07-13T00:00:00.000Z"),
          reviewedAt: null
        };
        state.requests.push(request);
        return request;
      },
      update: async ({ where, data }) => {
        const index = state.requests.findIndex((request) => request.id === where.id);
        assert.notEqual(index, -1);
        const updated = { ...state.requests[index], ...data };
        state.requests[index] = updated;
        return updated;
      }
    },
    $transaction: async (operation) => operation(prisma)
  };
  return { prisma, state };
}

const operatorSession = {
  token: "session_operator",
  user: {
    id: "user_operator",
    email: "operator@example.test",
    name: "Operator",
    role: "ADMIN",
    organizationId: "org_operator",
    createdAt: "2026-07-13T00:00:00.000Z"
  },
  organization: {
    id: "org_operator",
    name: "Platform Operations",
    createdAt: "2026-07-13T00:00:00.000Z"
  }
};

const organizationSession = {
  ...operatorSession,
  user: {
    ...operatorSession.user,
    role: "ORGANIZATION"
  }
};

try {
  process.env.DATABASE_URL = "postgresql://available";
  process.env.DISABLE_DATABASE = "0";

  const memory = createMemoryPrisma();
  const service = new AdminSignupRequestsService(memory.prisma);
  const request = await service.createRequest({
    organizationName: "Applicant Company",
    name: "Applicant Admin",
    email: "applicant@example.test",
    password: "securepass123",
    reason: "We need to run developer exams."
  });

  assert.equal(request.status, "PENDING");
  assert.equal(request.requestedRole, "ORGANIZATION");

  await assert.rejects(
    () =>
      service.createRequest({
        organizationName: "Applicant Company",
        name: "Applicant Admin",
        email: "applicant@example.test",
        password: "securepass123",
        reason: "Duplicate request."
      }),
    (error) => error instanceof ConflictException
  );
  await assert.rejects(() => service.listRequests(organizationSession), (error) => error instanceof ForbiddenException);

  const requests = await service.listRequests(operatorSession);
  assert.equal(requests.length, 1);

  const approved = await service.reviewRequest(operatorSession, request.id, { action: "APPROVE" });
  assert.equal(approved.status, "APPROVED");
  assert.ok(approved.approvedUserId);

  const registeredSession = {
    token: "session_registered",
    user: {
      id: "user_registered",
      email: "registered@example.test",
      name: "Registered User",
      role: "CANDIDATE",
      createdAt: "2026-07-13T00:00:00.000Z"
    },
    organization: {
      id: "unaffiliated",
      name: "소속 없음",
      createdAt: "2026-07-13T00:00:00.000Z"
    }
  };
  memory.state.users.push({ ...registeredSession.user, passwordHash: "hash" });
  const registeredRequest = await service.createRequestForRegisteredUser(registeredSession, {
    organizationName: "Registered Company",
    reason: "We need our own exam workspace."
  });
  const registeredApproval = await service.reviewRequest(operatorSession, registeredRequest.id, { action: "APPROVE" });
  const promotedUser = memory.state.users.find((user) => user.id === registeredSession.user.id);
  assert.equal(registeredApproval.status, "APPROVED");
  assert.equal(promotedUser?.role, "ORGANIZATION");
  assert.ok(promotedUser?.organizationId);

  const rejectedRequest = await service.createRequest({
    organizationName: "Rejected Company",
    name: "Rejected Admin",
    email: "rejected@example.test",
    password: "securepass123",
    reason: "Not enough information."
  });
  const rejected = await service.reviewRequest(operatorSession, rejectedRequest.id, {
    action: "REJECT",
    rejectionReason: "사업자 정보를 확인할 수 없습니다."
  });
  assert.equal(rejected.status, "REJECTED");
  assert.equal(rejected.rejectionReason, "사업자 정보를 확인할 수 없습니다.");

  console.log("admin signup requests regression passed");
} finally {
  process.env = originalEnv;
}
