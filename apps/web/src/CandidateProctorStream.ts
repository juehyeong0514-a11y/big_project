import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import type { CreateProctorEventInput, ProctorDeviceRole, ProctorDeviceStatus } from "@dcvp/shared";
import { API_BASE_URL, api } from "./api";
import { createProctorPeerConnection, proctorDeviceStatusLabel, proctorSocketUrl, type ProctorSignalPayload } from "./proctoring";

const PROCTOR_HEARTBEAT_INTERVAL_MS = 10_000;

type CandidateProctorStreamInput = {
  readonly inviteToken: string;
  readonly examId: string;
  readonly candidateId: string;
  readonly deviceRole: ProctorDeviceRole;
  readonly facingMode: "user" | "environment";
};

function sendProctorEventBeacon(inviteToken: string, input: CreateProctorEventInput) {
  const endpoint = `${API_BASE_URL}/api/exams/invites/${inviteToken}/proctor-events`;
  const body = JSON.stringify(input);
  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: "application/json" });
    navigator.sendBeacon(endpoint, blob);
    return;
  }

  void fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true
  });
}

function cameraDisconnectedEventType(deviceRole: ProctorDeviceRole): CreateProctorEventInput["type"] {
  return deviceRole === "PRIMARY_PC" ? "PRIMARY_CAMERA_DISCONNECTED" : "MOBILE_CAMERA_DISCONNECTED";
}

function cameraConnectedEventType(deviceRole: ProctorDeviceRole): CreateProctorEventInput["type"] {
  return deviceRole === "PRIMARY_PC" ? "PRIMARY_CAMERA_CONNECTED" : "MOBILE_CAMERA_CONNECTED";
}

function permissionDeniedEventType(deviceRole: ProctorDeviceRole): CreateProctorEventInput["type"] {
  return deviceRole === "PRIMARY_PC" ? "PRIMARY_CAMERA_PERMISSION_DENIED" : "MOBILE_CAMERA_PERMISSION_DENIED";
}

function visibilityEventType(deviceRole: ProctorDeviceRole): CreateProctorEventInput["type"] {
  if (deviceRole === "MOBILE_AUX") {
    return document.hidden ? "MOBILE_PAGE_HIDDEN" : "MOBILE_PAGE_VISIBLE";
  }
  return document.hidden ? "TAB_HIDDEN" : "TAB_VISIBLE";
}

export function useCandidateProctorStream(input: CandidateProctorStreamInput) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const [deviceStatus, setDeviceStatus] = useState<ProctorDeviceStatus>("WAITING");

  useEffect(() => {
    if (!input.inviteToken || !input.examId || !input.candidateId) return;
    let active = true;
    const socket = io(proctorSocketUrl(), { transports: ["websocket"] });
    let heartbeatIntervalId: number | undefined;
    const stopHeartbeat = () => {
      if (heartbeatIntervalId) {
        window.clearInterval(heartbeatIntervalId);
        heartbeatIntervalId = undefined;
      }
    };

    const markDisconnected = (detail: string) => {
      stopHeartbeat();
      setDeviceStatus("DISCONNECTED");
      void api.upsertProctorDevice(input.inviteToken, { role: input.deviceRole, status: "DISCONNECTED", detail });
      void api.logProctorEvent(input.inviteToken, { type: cameraDisconnectedEventType(input.deviceRole), detail });
    };

    const emitIce = (candidate: RTCIceCandidateInit) => {
      socket.emit("ice-candidate", {
        examId: input.examId,
        candidateId: input.candidateId,
        deviceRole: input.deviceRole,
        candidate
      } satisfies ProctorSignalPayload);
    };

    const createOffer = async () => {
      const stream = streamRef.current;
      if (!stream || !active) return;
      peerRef.current?.close();
      const connection = createProctorPeerConnection(emitIce);
      peerRef.current = connection;
      stream.getTracks().forEach((track) => connection.addTrack(track, stream));
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      socket.emit("webrtc-offer", {
        examId: input.examId,
        candidateId: input.candidateId,
        deviceRole: input.deviceRole,
        description: offer
      } satisfies ProctorSignalPayload);
    };

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: input.facingMode }, audio: false });
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        stream.getTracks().forEach((track) => {
          track.onended = () => markDisconnected("camera track ended");
        });
        setDeviceStatus("CONNECTED");
        await api.upsertProctorDevice(input.inviteToken, { role: input.deviceRole, status: "CONNECTED", detail: "camera stream active" });
        heartbeatIntervalId = window.setInterval(() => {
          void api.upsertProctorDevice(input.inviteToken, { role: input.deviceRole, status: "CONNECTED", detail: "heartbeat" });
        }, PROCTOR_HEARTBEAT_INTERVAL_MS);
        await api.logProctorEvent(input.inviteToken, {
          type: cameraConnectedEventType(input.deviceRole),
          detail: "Camera stream connected."
        });
        socket.emit("join-candidate", {
          examId: input.examId,
          candidateId: input.candidateId,
          inviteToken: input.inviteToken,
          deviceRole: input.deviceRole
        });
        await createOffer();
      } catch (error) {
        const detail = error instanceof Error ? error.message : "camera permission denied";
        setDeviceStatus("PERMISSION_DENIED");
        await api.upsertProctorDevice(input.inviteToken, { role: input.deviceRole, status: "PERMISSION_DENIED", detail });
        await api.logProctorEvent(input.inviteToken, {
          type: permissionDeniedEventType(input.deviceRole),
          detail
        });
      }
    };

    const logVisibility = () => {
      void api.logProctorEvent(input.inviteToken, { type: visibilityEventType(input.deviceRole), detail: document.visibilityState });
    };
    const logMobileOffline = () => {
      if (input.deviceRole !== "MOBILE_AUX") return;
      setDeviceStatus("DISCONNECTED");
      void api.logProctorEvent(input.inviteToken, { type: "MOBILE_NETWORK_OFFLINE", detail: "mobile network offline" });
    };
    const logMobileOnline = () => {
      if (input.deviceRole !== "MOBILE_AUX") return;
      void api.logProctorEvent(input.inviteToken, { type: "MOBILE_NETWORK_ONLINE", detail: "mobile network online" });
    };
    const logPageLeft = () => {
      if (input.deviceRole !== "MOBILE_AUX") return;
      sendProctorEventBeacon(input.inviteToken, { type: "MOBILE_PAGE_LEFT", detail: "mobile proctor page left" });
    };

    socket.on("connect", () => {
      void start();
    });
    socket.on("disconnect", () => {
      if (active) markDisconnected("proctor socket disconnected");
    });
    socket.on("request-offer", () => {
      void createOffer();
    });
    socket.on("webrtc-answer", (payload: ProctorSignalPayload) => {
      if (!payload.description || !peerRef.current) return;
      void peerRef.current.setRemoteDescription(payload.description);
    });
    socket.on("ice-candidate", (payload: ProctorSignalPayload) => {
      if (!payload.candidate || !peerRef.current) return;
      void peerRef.current.addIceCandidate(payload.candidate);
    });
    document.addEventListener("visibilitychange", logVisibility);
    window.addEventListener("offline", logMobileOffline);
    window.addEventListener("online", logMobileOnline);
    window.addEventListener("pagehide", logPageLeft);
    window.addEventListener("beforeunload", logPageLeft);

    return () => {
      active = false;
      document.removeEventListener("visibilitychange", logVisibility);
      window.removeEventListener("offline", logMobileOffline);
      window.removeEventListener("online", logMobileOnline);
      window.removeEventListener("pagehide", logPageLeft);
      window.removeEventListener("beforeunload", logPageLeft);
      peerRef.current?.close();
      socket.disconnect();
      stopHeartbeat();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      void api.upsertProctorDevice(input.inviteToken, { role: input.deviceRole, status: "DISCONNECTED", detail: "camera page closed" });
      void api.logProctorEvent(input.inviteToken, { type: cameraDisconnectedEventType(input.deviceRole), detail: "Camera page closed." });
    };
  }, [input.candidateId, input.deviceRole, input.examId, input.facingMode, input.inviteToken]);

  return { deviceStatus, status: proctorDeviceStatusLabel(deviceStatus), videoRef };
}
