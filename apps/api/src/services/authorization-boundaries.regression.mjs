import assert from "node:assert/strict";
import { ForbiddenException } from "@nestjs/common";
import { OperationsController } from "../../dist/modules/operations.controller.js";
import { ProctorGateway } from "../../dist/modules/proctor.gateway.js";
import { AdminUsersService } from "../../dist/services/admin-users.service.js";
import { PlatformStore } from "../../dist/services/platform-store.service.js";

const originalEnv = { ...process.env };
const organization = {
  id: "org_demo",
  name: "Acme Engineering Hiring",
  joinCode: "ORG-ACME01",
  createdAt: new Date().toISOString()
};

function session(role) {
  return {
    token: `session_${role.toLowerCase()}`,
    organization,
    user: {
      id: `user_${role.toLowerCase()}`,
      email: `${role.toLowerCase()}@example.test`,
      name: role,
      role,
      organizationId: organization.id,
      createdAt: new Date().toISOString()
    }
  };
}

try {
  process.env.DISABLE_DATABASE = "1";
  process.env.ALLOW_DEMO_AUTH = "1";
  const store = new PlatformStore({}, {}, {}, {});
  const candidate = session("CANDIDATE");
  const proctor = session("PROCTOR");

  for (const request of [
    () => store.getDashboard(candidate),
    () => store.listExams(candidate),
    () => store.getExamDetail("exam_backend_001", candidate),
    () => store.getExamReport("exam_backend_001", candidate),
    () => store.getLiveProctorState("exam_backend_001", candidate)
  ]) {
    await assert.rejects(request, ForbiddenException);
  }

  const visibleExams = await store.listExams(proctor);
  assert.ok(visibleExams.some((exam) => exam.id === "exam_backend_001"));
  await store.getLiveProctorState("exam_backend_001", proctor);
  await assert.rejects(() => store.getExamDetail("exam_backend_001", proctor), ForbiddenException);
  await assert.rejects(() => store.getExamReport("exam_backend_001", proctor), ForbiddenException);

  // Given: a proctor with access to the live dashboard but not exam administration.
  // When: the proctor joins the WebRTC signaling room.
  // Then: the gateway uses live-proctor authorization and accepts the join.
  const proctorGateway = new ProctorGateway({
    getExamDetail: async () => { throw new ForbiddenException(); },
    getLiveProctorState: async () => ({})
  }, {
    requireActiveSession: async () => proctor,
    onSessionRevoked: () => () => undefined
  });
  const proctorSocket = {
    id: "socket_proctor",
    data: {},
    handshake: { auth: {} },
    join: async () => undefined,
    emit: () => undefined
  };
  await proctorGateway.handleJoinAdmin(proctorSocket, { examId: "exam_backend_001", token: proctor.token });
  assert.equal(proctorSocket.data.examId, "exam_backend_001");

  const adminUsers = new AdminUsersService({});
  await assert.rejects(() => adminUsers.listOrganizationUsers(candidate), ForbiddenException);
  await assert.rejects(() => adminUsers.listManagedOrganizations(candidate), ForbiddenException);

  const readiness = new OperationsController(
    { getReadiness: async () => ({}) },
    { me: async () => candidate }
  );
  await assert.rejects(() => readiness.getReadiness("Bearer candidate"), ForbiddenException);

  console.log("authorization boundaries regression passed");
} finally {
  process.env = originalEnv;
}
