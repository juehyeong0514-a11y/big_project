import assert from "node:assert/strict";
import { OrganizationRequestsService } from "../../dist/services/organization-requests.service.js";

function createMemoryPrisma() {
  const state = {
    organizations: [{ id: "org_acme", name: "Acme", joinCode: "ACME-7K2Q", createdAt: new Date("2026-07-13T00:00:00.000Z") }],
    users: [
      { id: "user_manager", email: "manager@example.test", name: "Manager", passwordHash: "hash", role: "ORGANIZATION", organizationId: "org_acme", createdAt: new Date("2026-07-13T00:00:00.000Z") },
      { id: "user_member", email: "member@example.test", name: "Member", passwordHash: "hash", role: "CANDIDATE", organizationId: null, createdAt: new Date("2026-07-13T00:00:00.000Z") }
    ],
    requests: []
  };
  const prisma = {
    organization: { findUnique: async ({ where }) => state.organizations.find((organization) => organization.joinCode === where.joinCode || organization.id === where.id) ?? null },
    user: {
      findUnique: async ({ where }) => state.users.find((user) => user.id === where.id) ?? null,
      update: async ({ where, data }) => {
        const index = state.users.findIndex((user) => user.id === where.id);
        assert.notEqual(index, -1);
        state.users[index] = { ...state.users[index], ...data };
        return state.users[index];
      }
    },
    organizationAccessRequest: {
      findFirst: async ({ where }) => state.requests.find((request) => request.userId === where.userId && request.status === where.status) ?? null,
      findMany: async ({ where }) => state.requests.filter((request) => where.organizationId ? request.organizationId === where.organizationId : true),
      findUnique: async ({ where }) => state.requests.find((request) => request.id === where.id) ?? null,
      create: async ({ data }) => {
        const request = { ...data, status: "PENDING", rejectionReason: null, reviewedById: null, reviewedAt: null, createdAt: new Date("2026-07-13T00:00:00.000Z") };
        state.requests.push(request);
        return { ...request, user: state.users.find((user) => user.id === request.userId), organization: state.organizations.find((organization) => organization.id === request.organizationId) };
      },
      update: async ({ where, data }) => {
        const index = state.requests.findIndex((request) => request.id === where.id);
        assert.notEqual(index, -1);
        state.requests[index] = { ...state.requests[index], ...data };
        const request = state.requests[index];
        return { ...request, user: state.users.find((user) => user.id === request.userId), organization: state.organizations.find((organization) => organization.id === request.organizationId) };
      }
    },
    $transaction: async (operation) => operation(prisma)
  };
  return { prisma, state };
}

const originalEnv = { ...process.env };
process.env.DATABASE_URL = "postgresql://available";
process.env.DISABLE_DATABASE = "0";

const managerSession = {
  token: "session_manager",
  user: { id: "user_manager", email: "manager@example.test", name: "Manager", role: "ORGANIZATION", organizationId: "org_acme", createdAt: "2026-07-13T00:00:00.000Z" },
  organization: { id: "org_acme", name: "Acme", joinCode: "ACME-7K2Q", createdAt: "2026-07-13T00:00:00.000Z" }
};

const memberSession = {
  token: "session_member",
  user: { id: "user_member", email: "member@example.test", name: "Member", role: "CANDIDATE", organizationId: undefined, createdAt: "2026-07-13T00:00:00.000Z" },
  organization: undefined
};

try {
  const { prisma, state } = createMemoryPrisma();
  const service = new OrganizationRequestsService(prisma);

  const joinRequest = await service.createRequest(memberSession, { joinCode: "acme-7k2q", requestedRole: "CANDIDATE", reason: "Join the hiring team." });
  assert.equal(joinRequest.status, "PENDING");
  assert.equal(joinRequest.organization.joinCode, "ACME-7K2Q");

  const approved = await service.reviewRequest(managerSession, joinRequest.id, { action: "APPROVE" });
  assert.equal(approved.status, "APPROVED");
  assert.equal(state.users[1].organizationId, "org_acme");

  const proctorRequest = await service.createRequest({ ...memberSession, user: { ...memberSession.user, organizationId: "org_acme" }, organization: managerSession.organization }, { joinCode: "ACME-7K2Q", requestedRole: "PROCTOR", reason: "I will supervise exams." });
  await service.reviewRequest(managerSession, proctorRequest.id, { action: "APPROVE" });
  assert.equal(state.users[1].role, "PROCTOR");

  console.log("organization requests regression passed");
} finally {
  process.env = originalEnv;
}
