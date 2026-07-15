import assert from "node:assert/strict";
import { AdminUsersService } from "../../dist/services/admin-users.service.js";

const session = {
  token: "session_test",
  user: {
    id: "user_admin_001",
    email: "admin@acme.test",
    name: "Acme HR Admin",
    role: "ORGANIZATION",
    organizationId: "org_demo",
    createdAt: "2026-07-13T00:00:00.000Z"
  },
  organization: {
    id: "org_demo",
    name: "Acme Engineering Hiring",
    createdAt: "2026-07-13T00:00:00.000Z"
  }
};

const originalEnv = { ...process.env };
let deletedInvitationWhere;

process.env.DATABASE_URL = "postgresql://unavailable";
process.env.DISABLE_DATABASE = "0";

const throwingPrisma = {
  user: {
    findMany: async () => {
      throw new Error("database unavailable");
    },
    findUnique: async () => {
      throw new Error("database unavailable");
    }
  }
};

const memoryPrisma = {
  users: [
    { id: "user_operator", email: "operator@example.test", name: "Operator", role: "ADMIN", organizationId: "org_operator", createdAt: new Date("2026-07-13T00:00:00.000Z") },
    { id: "user_org", email: "org@example.test", name: "Org Admin", role: "ORGANIZATION", organizationId: "org_demo", createdAt: new Date("2026-07-13T00:00:00.000Z") },
    { id: "user_proctor", email: "proctor@example.test", name: "Proctor", role: "PROCTOR", organizationId: "org_demo", createdAt: new Date("2026-07-13T00:00:00.000Z") }
  ],
  organizations: [
    { id: "org_operator", name: "Platform Operations", createdAt: new Date("2026-07-13T00:00:00.000Z") },
    { id: "org_demo", name: "Acme Engineering Hiring", createdAt: new Date("2026-07-13T00:00:00.000Z") },
    { id: "org_empty", name: "Empty Organization", createdAt: new Date("2026-07-13T00:00:00.000Z") }
  ],
  adminSignupRequests: [
    { id: "signup_pending", status: "PENDING" },
    { id: "signup_approved", status: "APPROVED" }
  ],
  organizationAccessRequests: [
    { id: "org_request_pending", organizationId: "org_demo", status: "PENDING" },
    { id: "org_request_other", organizationId: "org_operator", status: "PENDING" },
    { id: "org_request_approved", organizationId: "org_demo", status: "APPROVED" }
  ],
  user: {
    findMany(options) {
      const organizationId = options.where?.organizationId;
      return Promise.resolve(organizationId ? memoryPrisma.users.filter((user) => user.organizationId === organizationId) : memoryPrisma.users);
    },
    findUnique({ where }) {
      return Promise.resolve(memoryPrisma.users.find((user) => user.id === where.id || user.email === where.email) ?? null);
    },
    update({ where, data }) {
      const index = memoryPrisma.users.findIndex((user) => user.id === where.id);
      assert.notEqual(index, -1);
      const updated = { ...memoryPrisma.users[index], ...data };
      memoryPrisma.users[index] = updated;
      return Promise.resolve(updated);
    },
    count({ where }) {
      return Promise.resolve(memoryPrisma.users.filter((user) => user.role === where.role).length);
    },
    delete({ where }) {
      const index = memoryPrisma.users.findIndex((user) => user.id === where.id);
      assert.notEqual(index, -1);
      const [deleted] = memoryPrisma.users.splice(index, 1);
      return Promise.resolve(deleted);
    }
  },
  organizationInvitation: {
    deleteMany({ where }) {
      deletedInvitationWhere = where;
      return Promise.resolve({ count: 0 });
    }
  },
  organization: {
    findMany(options) {
      const id = options.where?.id;
      const organizations = id ? memoryPrisma.organizations.filter((organization) => organization.id === id) : memoryPrisma.organizations;
      const requiresMember = Boolean(options.where?.users?.some);
      return Promise.resolve(requiresMember ? organizations.filter((organization) => memoryPrisma.users.some((user) => user.organizationId === organization.id)) : organizations);
    }
  },
  adminSignupRequest: {
    count({ where }) {
      return Promise.resolve(memoryPrisma.adminSignupRequests.filter((request) => request.status === where.status).length);
    }
  },
  organizationAccessRequest: {
    count({ where }) {
      return Promise.resolve(memoryPrisma.organizationAccessRequests.filter((request) => request.status === where.status && (!where.organizationId || request.organizationId === where.organizationId)).length);
    }
  },
  $transaction(operation) {
    return operation(memoryPrisma);
  }
};

const operatorSession = {
  ...session,
  user: { ...session.user, role: "ADMIN", id: "user_operator", organizationId: "org_operator" },
  organization: { id: "org_operator", name: "Platform Operations", createdAt: "2026-07-13T00:00:00.000Z" }
};

try {
  const service = new AdminUsersService(throwingPrisma);
  const users = await service.listOrganizationUsers(session);
  assert.deepEqual(users, [session.user]);

  const editableService = new AdminUsersService(memoryPrisma);
  const operatorPendingApprovals = await editableService.getPendingApprovalCount(operatorSession);
  assert.equal(operatorPendingApprovals.count, 3);
  const organizationPendingApprovals = await editableService.getPendingApprovalCount(session);
  assert.equal(organizationPendingApprovals.count, 1);
  const operatorOrganizations = await editableService.listManagedOrganizations(operatorSession);
  assert.deepEqual(operatorOrganizations.map((organization) => organization.id), ["org_operator", "org_demo"]);
  const operatorUpdated = await editableService.updateManagedUser(operatorSession, "user_proctor", {
    name: "Moved Proctor",
    email: "moved-proctor@example.test",
    role: "ORGANIZATION",
    organizationId: "org_operator"
  });
  assert.equal(operatorUpdated.organizationId, "org_operator");
  assert.equal(operatorUpdated.role, "ORGANIZATION");

  const orgUpdated = await editableService.updateManagedUser(session, "user_org", {
    name: "Renamed Org Admin",
    email: "renamed-org@example.test",
    role: "PROCTOR",
    organizationId: "org_operator"
  });
  assert.equal(orgUpdated.organizationId, "org_demo");
  assert.equal(orgUpdated.role, "PROCTOR");

  await assert.rejects(
    () =>
      editableService.updateManagedUser(session, "user_operator", {
        name: "Operator",
        email: "operator-renamed@example.test",
        role: "ADMIN",
        organizationId: "org_operator"
      }),
    (error) => error instanceof Error && error.message.includes("자기 조직")
  );

  const deleted = await editableService.deleteManagedUser(operatorSession, "user_proctor");
  assert.equal(deleted.id, "user_proctor");
  assert.equal(memoryPrisma.users.some((user) => user.id === "user_proctor"), false);
  assert.deepEqual(deletedInvitationWhere, { OR: [{ invitedUserId: "user_proctor" }, { invitedById: "user_proctor" }] });

  await assert.rejects(
    () => editableService.deleteManagedUser(operatorSession, "user_operator"),
    (error) => error instanceof Error && error.message.includes("자기 계정")
  );

  memoryPrisma.users[0] = { ...memoryPrisma.users[0], role: "CANDIDATE" };
  await assert.rejects(
    () => editableService.deleteManagedUser(operatorSession, "user_org"),
    (error) => error instanceof Error && error.message.includes("운영자만")
  );

  console.log("admin users database fallback regression passed");
} finally {
  process.env = originalEnv;
}
