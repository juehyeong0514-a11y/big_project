import assert from "node:assert/strict";
import { OrganizationInvitationsService } from "../../dist/services/organization-invitations.service.js";

const organization = { id: "org_alpha", name: "Alpha", joinCode: "ORG-ALPHA01", createdAt: new Date("2026-07-13T00:00:00.000Z") };
const users = [
  { id: "user_manager", email: "manager@example.test", name: "Manager", role: "ORGANIZATION", organizationId: organization.id, createdAt: new Date() },
  { id: "user_member", email: "member@example.test", name: "Member", role: "CANDIDATE", organizationId: null, createdAt: new Date() }
];
const invitations = [];
const prisma = {
  user: {
    findUnique: async ({ where }) => users.find((user) => user.email === where.email || user.id === where.id) ?? null,
    updateMany: async ({ where, data }) => {
      const index = users.findIndex((user) => user.id === where.id && (where.organizationId === undefined || user.organizationId === where.organizationId));
      if (index === -1) return { count: 0 };
      users[index] = { ...users[index], ...data };
      return { count: 1 };
    }
  },
  organizationInvitation: {
    findFirst: async ({ where }) => invitations.find((invitation) => invitation.organizationId === where.organizationId && invitation.invitedUserId === where.invitedUserId && invitation.status === where.status) ?? null,
    findMany: async ({ where }) => invitations.filter((invitation) => (where.organizationId === undefined || invitation.organizationId === where.organizationId) && (where.invitedUserId === undefined || invitation.invitedUserId === where.invitedUserId) && (where.status === undefined || invitation.status === where.status)).map((invitation) => ({ ...invitation, organization })),
    findUnique: async ({ where }) => {
      const invitation = invitations.find((entry) => entry.id === where.id) ?? null;
      return invitation ? { ...invitation, organization } : null;
    },
    create: async ({ data }) => {
      const invitation = { ...data, status: "PENDING", createdAt: new Date(), acceptedAt: null };
      invitations.push(invitation);
      return { ...invitation, organization };
    },
    updateMany: async ({ where, data }) => {
      const index = invitations.findIndex((invitation) => invitation.id === where.id && invitation.invitedUserId === where.invitedUserId && invitation.status === where.status);
      if (index === -1) return { count: 0 };
      invitations[index] = { ...invitations[index], ...data };
      return { count: 1 };
    }
  },
  $transaction: async (operation) => operation(prisma)
};

const managerSession = { token: "manager", user: { id: "user_manager", email: "manager@example.test", name: "Manager", role: "ORGANIZATION", organizationId: organization.id, createdAt: new Date().toISOString() }, organization: { ...organization, createdAt: organization.createdAt.toISOString() } };
const memberSession = { token: "member", user: { id: "user_member", email: "member@example.test", name: "Member", role: "CANDIDATE", createdAt: new Date().toISOString() }, organization: { id: "", name: "소속 없음", createdAt: new Date(0).toISOString() } };

const service = new OrganizationInvitationsService(prisma);
const invitation = await service.createInvitation(managerSession, { email: "member@example.test", requestedRole: "PROCTOR" });
assert.equal(invitation.email, "member@example.test");
assert.equal((await service.listReceivedInvitations(memberSession)).length, 1);
const accepted = await service.acceptInvitation(memberSession, { invitationId: invitation.id });
assert.equal(accepted.status, "ACCEPTED");
assert.equal(users[1].role, "PROCTOR");
assert.equal(users[1].organizationId, organization.id);

invitations.push({
  id: "org_invite_other",
  token: "other",
  organizationId: "org_other",
  invitedUserId: "user_member",
  requestedRole: "ORGANIZATION",
  status: "PENDING",
  invitedById: "user_manager",
  createdAt: new Date(),
  acceptedAt: null
});
await assert.rejects(
  () => service.acceptInvitation(memberSession, { invitationId: "org_invite_other" }),
  /이미 다른 조직에 소속된 계정입니다/
);

users[0] = { ...users[0], role: "CANDIDATE", organizationId: null };
await assert.rejects(
  () => service.listInvitations(managerSession),
  /조직 관리자만 구성원을 초대할 수 있습니다/
);
console.log("organization invitations regression passed");
