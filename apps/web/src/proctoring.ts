import type { ProctorActionType, ProctorDeviceRole, ProctorDeviceStatus, ProctorEventType, ProctorRiskLevel } from "@dcvp/shared";
import { API_BASE_URL } from "./api";

export interface ProctorSignalPayload {
  examId: string;
  candidateId: string;
  deviceRole: ProctorDeviceRole;
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

export const proctorSocketUrl = () => `${API_BASE_URL.replace(/\/$/, "")}/proctor`;

export const proctorStreamKey = (candidateId: string, deviceRole: ProctorDeviceRole) => `${candidateId}:${deviceRole}`;

const defaultIceServers = [{ urls: "stun:stun.l.google.com:19302" }] as const satisfies readonly RTCIceServer[];

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseIceServer(value: unknown): RTCIceServer | null {
  if (!isUnknownRecord(value)) {
    return null;
  }

  const urls = value["urls"];
  const username = value["username"];
  const credential = value["credential"];
  if (typeof urls !== "string" && !Array.isArray(urls)) {
    return null;
  }

  const validUrls = Array.isArray(urls) ? urls.filter((url) => typeof url === "string") : urls;
  if (Array.isArray(validUrls) && validUrls.length === 0) {
    return null;
  }

  return {
    urls: validUrls,
    username: typeof username === "string" ? username : undefined,
    credential: typeof credential === "string" ? credential : undefined
  };
}

export function getProctorIceServers(): RTCIceServer[] {
  const raw = import.meta.env.VITE_PROCTOR_ICE_SERVERS;
  if (typeof raw !== "string" || !raw.trim()) {
    return [...defaultIceServers];
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [...defaultIceServers];
    }
    const configured = parsed.flatMap((entry) => {
      const iceServer = parseIceServer(entry);
      return iceServer ? [iceServer] : [];
    });
    return configured.length ? configured : [...defaultIceServers];
  } catch (error) {
    if (error instanceof SyntaxError) {
      return [...defaultIceServers];
    }
    throw error;
  }
}

export function createProctorPeerConnection(onIceCandidate: (candidate: RTCIceCandidateInit) => void) {
  const connection = new RTCPeerConnection({
    iceServers: getProctorIceServers()
  });
  connection.onicecandidate = (event) => {
    if (event.candidate) {
      onIceCandidate(event.candidate.toJSON());
    }
  };
  return connection;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled proctor variant: ${value}`);
}

export function riskLabel(level: ProctorRiskLevel) {
  switch (level) {
    case "SAFE":
      return "정상";
    case "WARNING":
      return "주의";
    case "DANGER":
      return "위험";
    default:
      return assertNever(level);
  }
}

export function proctorDeviceStatusLabel(status: ProctorDeviceStatus) {
  switch (status) {
    case "WAITING":
      return "대기 중";
    case "CONNECTED":
      return "연결됨";
    case "DISCONNECTED":
      return "연결 끊김";
    case "PERMISSION_DENIED":
      return "권한 거부";
    default:
      return assertNever(status);
  }
}

export function proctorActionLabel(type: ProctorActionType) {
  switch (type) {
    case "WARNING_MESSAGE":
      return "경고";
    case "PAUSE_EXAM":
      return "시험 일시중지";
    case "RESUME_EXAM":
      return "시험 재개";
    case "TERMINATE_EXAM":
      return "강제 종료";
    case "MEMO":
      return "감독 메모";
    default:
      return assertNever(type);
  }
}

export function proctorEventLabel(type: ProctorEventType) {
  switch (type) {
    case "TAB_HIDDEN":
      return "시험 탭 숨김";
    case "TAB_VISIBLE":
      return "시험 탭 복귀";
    case "WINDOW_BLUR":
      return "창 포커스 이탈";
    case "WINDOW_FOCUS":
      return "창 포커스 복귀";
    case "COPY":
      return "복사 감지";
    case "PASTE":
      return "붙여넣기 감지";
    case "FULLSCREEN_EXIT":
      return "전체화면 이탈";
    case "FULLSCREEN_ENTER":
      return "전체화면 복귀";
    case "PRIMARY_CAMERA_CONNECTED":
      return "PC 캠 연결";
    case "PRIMARY_CAMERA_DISCONNECTED":
      return "PC 캠 끊김";
    case "PRIMARY_CAMERA_PERMISSION_DENIED":
      return "PC 캠 권한 거부";
    case "MOBILE_CAMERA_CONNECTED":
      return "모바일 보조캠 연결";
    case "MOBILE_CAMERA_DISCONNECTED":
      return "모바일 보조캠 끊김";
    case "MOBILE_CAMERA_PERMISSION_DENIED":
      return "모바일 보조캠 권한 거부";
    case "MOBILE_PAGE_HIDDEN":
      return "모바일 화면 숨김";
    case "MOBILE_PAGE_VISIBLE":
      return "모바일 화면 복귀";
    case "MOBILE_PAGE_LEFT":
      return "모바일 감독 페이지 이탈";
    case "MOBILE_NETWORK_OFFLINE":
      return "모바일 네트워크 끊김";
    case "MOBILE_NETWORK_ONLINE":
      return "모바일 네트워크 복구";
    case "MOBILE_HEARTBEAT_MISSED":
      return "모바일 하트비트 누락";
    default:
      return assertNever(type);
  }
}

export function proctorEventTone(type: ProctorEventType) {
  switch (type) {
    case "TAB_VISIBLE":
    case "WINDOW_FOCUS":
    case "FULLSCREEN_ENTER":
    case "PRIMARY_CAMERA_CONNECTED":
    case "MOBILE_CAMERA_CONNECTED":
    case "MOBILE_PAGE_VISIBLE":
    case "MOBILE_NETWORK_ONLINE":
      return "safe";
    case "TAB_HIDDEN":
    case "WINDOW_BLUR":
    case "COPY":
    case "PASTE":
    case "MOBILE_PAGE_HIDDEN":
      return "warning";
    case "FULLSCREEN_EXIT":
    case "PRIMARY_CAMERA_DISCONNECTED":
    case "PRIMARY_CAMERA_PERMISSION_DENIED":
    case "MOBILE_CAMERA_DISCONNECTED":
    case "MOBILE_CAMERA_PERMISSION_DENIED":
    case "MOBILE_PAGE_LEFT":
    case "MOBILE_NETWORK_OFFLINE":
    case "MOBILE_HEARTBEAT_MISSED":
      return "danger";
    default:
      return assertNever(type);
  }
}

export function playDangerTone() {
  const AudioContextConstructor = window.AudioContext;
  const context = new AudioContextConstructor();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = 880;
  gain.gain.value = 0.04;
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  window.setTimeout(() => {
    oscillator.stop();
    void context.close();
  }, 180);
}
