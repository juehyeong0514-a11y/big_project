import assert from "node:assert/strict";
import { io } from "socket.io-client";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:4000";
const examId = "exam_backend_001";
const candidateId = "candidate_001";
const inviteToken = "invite_demo_001";
const deviceRole = "MOBILE_AUX";

function waitFor(socket, eventName, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      socket.off(eventName, onEvent);
      reject(new Error(`Timed out waiting for ${eventName}`));
    }, timeoutMs);
    const onEvent = (payload) => {
      clearTimeout(timeoutId);
      resolve(payload);
    };
    socket.once(eventName, onEvent);
  });
}

function connectSocket(socket) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      socket.off("connect", onConnect);
      socket.off("connect_error", onError);
      reject(new Error("Timed out waiting for socket connect"));
    }, 3000);
    const onConnect = () => {
      clearTimeout(timeoutId);
      socket.off("connect_error", onError);
      resolve();
    };
    const onError = (error) => {
      clearTimeout(timeoutId);
      socket.off("connect", onConnect);
      reject(error);
    };
    socket.once("connect", onConnect);
    socket.once("connect_error", onError);
  });
}

async function login() {
  const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "admin@acme.test", password: "demo1234" })
  });
  assert.equal(response.ok, true);
  const body = await response.json();
  assert.equal(typeof body.token, "string");
  return body.token;
}

const token = await login();
const admin = io(`${API_BASE_URL}/proctor`, {
  auth: { token },
  transports: ["websocket"],
  forceNew: true
});
const candidate = io(`${API_BASE_URL}/proctor`, {
  transports: ["websocket"],
  forceNew: true
});

try {
  await Promise.all([connectSocket(admin), connectSocket(candidate)]);

  admin.emit("join-admin", { examId });
  const joinedAdmin = await waitFor(admin, "joined-admin");
  assert.deepEqual(joinedAdmin, { examId });

  candidate.emit("join-candidate", { examId, candidateId, inviteToken, deviceRole });
  const [joinedCandidate, deviceJoined] = await Promise.all([
    waitFor(candidate, "joined-candidate"),
    waitFor(admin, "device-joined")
  ]);
  assert.deepEqual(joinedCandidate, { examId, candidateId, deviceRole });
  assert.equal(deviceJoined.candidateId, candidateId);
  assert.equal(deviceJoined.deviceRole, deviceRole);
  assert.equal(typeof deviceJoined.socketId, "string");

  admin.emit("request-offer", { examId, candidateId, deviceRole });
  const offerRequest = await waitFor(candidate, "request-offer");
  assert.deepEqual(offerRequest, { examId, candidateId, deviceRole });

  const offerDescription = { type: "offer", sdp: "v=0\r\n" };
  candidate.emit("webrtc-offer", { examId, candidateId, deviceRole, description: offerDescription });
  const adminOffer = await waitFor(admin, "webrtc-offer");
  assert.equal(adminOffer.candidateId, candidateId);
  assert.equal(adminOffer.deviceRole, deviceRole);
  assert.deepEqual(adminOffer.description, offerDescription);
  assert.equal(typeof adminOffer.socketId, "string");

  const answerDescription = { type: "answer", sdp: "v=0\r\n" };
  admin.emit("webrtc-answer", { examId, candidateId, deviceRole, description: answerDescription });
  const candidateAnswer = await waitFor(candidate, "webrtc-answer");
  assert.deepEqual(candidateAnswer, { examId, candidateId, deviceRole, description: answerDescription });

  const candidateIce = { candidate: "candidate:0 1 UDP 2122252543 127.0.0.1 9 typ host", sdpMid: "0", sdpMLineIndex: 0 };
  candidate.emit("ice-candidate", { examId, candidateId, deviceRole, candidate: candidateIce });
  const adminIce = await waitFor(admin, "ice-candidate");
  assert.deepEqual(adminIce, { examId, candidateId, deviceRole, candidate: candidateIce });

  const adminIceCandidate = { candidate: "candidate:1 1 UDP 2122252542 127.0.0.1 10 typ host", sdpMid: "0", sdpMLineIndex: 0 };
  admin.emit("ice-candidate", { examId, candidateId, deviceRole, candidate: adminIceCandidate });
  const candidateIceEvent = await waitFor(candidate, "ice-candidate");
  assert.deepEqual(candidateIceEvent, { examId, candidateId, deviceRole, candidate: adminIceCandidate });

  candidate.disconnect();
  const deviceLeft = await waitFor(admin, "device-left");
  assert.deepEqual(deviceLeft, { candidateId, deviceRole });

  console.log("proctor signaling e2e passed");
} finally {
  admin.disconnect();
  candidate.disconnect();
}
