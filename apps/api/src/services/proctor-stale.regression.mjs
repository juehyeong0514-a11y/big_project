import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { PlatformStore } from "../../dist/services/platform-store.service.js";

const originalEnv = { ...process.env };

try {
  process.env.DISABLE_DATABASE = "1";
  process.env.ALLOW_DEMO_AUTH = "1";
  process.env.PROCTOR_HEARTBEAT_TIMEOUT_MS = "60000";

  const store = new PlatformStore({}, {}, {}, {});
  await store.upsertProctorDevice("invite_demo_001", {
    role: "MOBILE_AUX",
    status: "CONNECTED",
    detail: "regression connected"
  });

  const connectedInvite = await store.getCandidateInvite("invite_demo_001");
  assert.equal(connectedInvite.proctorDevices[0]?.status, "CONNECTED");

  process.env.PROCTOR_HEARTBEAT_TIMEOUT_MS = "1";
  await delay(5);

  const staleInvite = await store.getCandidateInvite("invite_demo_001");
  assert.equal(staleInvite.proctorDevices[0]?.status, "DISCONNECTED");
  assert.equal(staleInvite.proctorDevices[0]?.detail, "heartbeat missed");

  const liveState = await store.getLiveProctorState("exam_backend_001");
  const staleCandidate = liveState.candidates.find((candidate) => candidate.candidate.id === "candidate_001");
  assert.ok(staleCandidate);
  assert.equal(staleCandidate.proctorEvents[0]?.type, "MOBILE_HEARTBEAT_MISSED");
  assert.equal(staleCandidate.riskLevel, "WARNING");

  console.log("proctor stale device regression passed");
} finally {
  process.env = originalEnv;
}
