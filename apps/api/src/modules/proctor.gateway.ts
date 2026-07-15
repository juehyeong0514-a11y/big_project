import { Inject, UnauthorizedException } from "@nestjs/common";
import { ConnectedSocket, MessageBody, OnGatewayDisconnect, SubscribeMessage, WebSocketGateway, WebSocketServer, WsException } from "@nestjs/websockets";
import type { ProctorDeviceRole } from "@dcvp/shared";
import type { Server, Socket } from "socket.io";
import { AuthService } from "../services/auth.service.js";
import { PlatformStore } from "../services/platform-store.service.js";

type ProctorSocketRole = "ADMIN" | "CANDIDATE";

interface JoinAdminPayload {
  examId: string;
  token?: string;
}

interface JoinCandidatePayload {
  examId: string;
  candidateId: string;
  inviteToken: string;
  deviceRole: ProctorDeviceRole;
}

interface SignalPayload {
  examId: string;
  candidateId: string;
  deviceRole: ProctorDeviceRole;
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

interface ProctorSocketData {
  role?: ProctorSocketRole;
  examId?: string;
  candidateId?: string;
  inviteToken?: string;
  deviceRole?: ProctorDeviceRole;
}

interface ServerToClientEvents {
  "joined-admin": (payload: { examId: string }) => void;
  "joined-candidate": (payload: { examId: string; candidateId: string; deviceRole: ProctorDeviceRole }) => void;
  "proctor-error": (payload: { message: string }) => void;
  "device-joined": (payload: { socketId: string; candidateId: string; deviceRole: ProctorDeviceRole }) => void;
  "device-left": (payload: { candidateId: string; deviceRole: ProctorDeviceRole }) => void;
  "request-offer": (payload: SignalPayload) => void;
  "webrtc-offer": (payload: SignalPayload & { socketId: string }) => void;
  "webrtc-answer": (payload: SignalPayload) => void;
  "ice-candidate": (payload: SignalPayload) => void;
}

interface ClientToServerEvents {
  "join-admin": (payload: JoinAdminPayload) => void;
  "join-candidate": (payload: JoinCandidatePayload) => void;
  "request-offer": (payload: SignalPayload) => void;
  "webrtc-offer": (payload: SignalPayload) => void;
  "webrtc-answer": (payload: SignalPayload) => void;
  "ice-candidate": (payload: SignalPayload) => void;
}

interface InterServerEvents {
  ping: () => void;
}

type ProctorSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, ProctorSocketData>;
type ProctorServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, ProctorSocketData>;

const adminRoom = (examId: string) => `exam:${examId}:admins`;
const candidateRoom = (examId: string, candidateId: string, deviceRole: ProctorDeviceRole) =>
  `exam:${examId}:candidate:${candidateId}:${deviceRole}`;
const proctorDeviceRoles = ["PRIMARY_PC", "MOBILE_AUX"] as const satisfies readonly ProctorDeviceRole[];

@WebSocketGateway({
  namespace: "/proctor",
  cors: {
    origin: true,
    credentials: true
  }
})
export class ProctorGateway implements OnGatewayDisconnect {
  @WebSocketServer()
  private server?: ProctorServer;

  constructor(
    @Inject(PlatformStore) private readonly store: PlatformStore,
    @Inject(AuthService) private readonly auth: AuthService
  ) {}

  @SubscribeMessage("join-admin")
  async handleJoinAdmin(@ConnectedSocket() client: ProctorSocket, @MessageBody() payload: JoinAdminPayload) {
    const session = await this.authenticateAdmin(client, payload);
    await this.store.getExamDetail(payload.examId, session);

    client.data.role = "ADMIN";
    client.data.examId = payload.examId;
    void client.join(adminRoom(payload.examId));
    client.emit("joined-admin", { examId: payload.examId });
  }

  @SubscribeMessage("join-candidate")
  async handleJoinCandidate(@ConnectedSocket() client: ProctorSocket, @MessageBody() payload: JoinCandidatePayload) {
    await this.assertCandidateJoin(client, payload);
    client.data.role = "CANDIDATE";
    client.data.examId = payload.examId;
    client.data.candidateId = payload.candidateId;
    client.data.inviteToken = payload.inviteToken;
    client.data.deviceRole = payload.deviceRole;
    void client.join(candidateRoom(payload.examId, payload.candidateId, payload.deviceRole));
    this.server?.to(adminRoom(payload.examId)).emit("device-joined", {
      socketId: client.id,
      candidateId: payload.candidateId,
      deviceRole: payload.deviceRole
    });
    client.emit("joined-candidate", { examId: payload.examId, candidateId: payload.candidateId, deviceRole: payload.deviceRole });
  }

  @SubscribeMessage("webrtc-offer")
  handleOffer(@ConnectedSocket() client: ProctorSocket, @MessageBody() payload: SignalPayload) {
    this.assertCanRelay(client, payload);
    this.server?.to(adminRoom(payload.examId)).emit("webrtc-offer", { ...payload, socketId: client.id });
  }

  @SubscribeMessage("request-offer")
  handleRequestOffer(@ConnectedSocket() client: ProctorSocket, @MessageBody() payload: SignalPayload) {
    this.assertCanRelay(client, payload);
    this.server?.to(candidateRoom(payload.examId, payload.candidateId, payload.deviceRole)).emit("request-offer", payload);
  }

  @SubscribeMessage("webrtc-answer")
  handleAnswer(@ConnectedSocket() client: ProctorSocket, @MessageBody() payload: SignalPayload) {
    this.assertCanRelay(client, payload);
    this.server?.to(candidateRoom(payload.examId, payload.candidateId, payload.deviceRole)).emit("webrtc-answer", payload);
  }

  @SubscribeMessage("ice-candidate")
  handleIceCandidate(@ConnectedSocket() client: ProctorSocket, @MessageBody() payload: SignalPayload) {
    this.assertCanRelay(client, payload);
    const room = client.data.role === "ADMIN" ? candidateRoom(payload.examId, payload.candidateId, payload.deviceRole) : adminRoom(payload.examId);
    this.server?.to(room).emit("ice-candidate", payload);
  }

  async handleDisconnect(client: ProctorSocket) {
    if (client.data.role !== "CANDIDATE" || !client.data.examId || !client.data.candidateId || !client.data.inviteToken || !client.data.deviceRole) {
      return;
    }

    await this.store.upsertProctorDevice(client.data.inviteToken, {
      role: client.data.deviceRole,
      status: "DISCONNECTED",
      detail: "proctor socket disconnected"
    });
    await this.store.logProctorEvent(client.data.inviteToken, {
      type: client.data.deviceRole === "MOBILE_AUX" ? "MOBILE_CAMERA_DISCONNECTED" : "PRIMARY_CAMERA_DISCONNECTED",
      detail: "Proctor socket disconnected."
    });
    this.server?.to(adminRoom(client.data.examId)).emit("device-left", {
      candidateId: client.data.candidateId,
      deviceRole: client.data.deviceRole
    });
  }

  private async authenticateAdmin(client: ProctorSocket, payload: JoinAdminPayload) {
    const token = this.extractAdminToken(client, payload);
    try {
      return await this.auth.me(token);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        this.reject(client, error.message);
      }
      throw error;
    }
  }

  private extractAdminToken(client: ProctorSocket, payload: JoinAdminPayload) {
    if (payload.token) {
      return payload.token;
    }

    const token = Reflect.get(client.handshake.auth, "token");
    return typeof token === "string" ? token : undefined;
  }

  private async assertCandidateJoin(client: ProctorSocket, payload: JoinCandidatePayload) {
    if (!proctorDeviceRoles.some((role) => role === payload.deviceRole)) {
      this.reject(client, "Invalid proctor device role.");
    }

    const invite = await this.store.getCandidateInvite(payload.inviteToken);
    if (invite.exam.id !== payload.examId || invite.candidate.id !== payload.candidateId) {
      this.reject(client, "Candidate invite does not match proctor join payload.");
    }
  }

  private assertCanRelay(client: ProctorSocket, payload: SignalPayload) {
    if (client.data.role === "ADMIN" && client.data.examId === payload.examId) {
      return;
    }

    if (
      client.data.role === "CANDIDATE" &&
      client.data.examId === payload.examId &&
      client.data.candidateId === payload.candidateId &&
      client.data.deviceRole === payload.deviceRole
    ) {
      return;
    }

    this.reject(client, "Proctor signaling is outside the joined room scope.");
  }

  private reject(client: ProctorSocket, message: string): never {
    client.emit("proctor-error", { message });
    throw new WsException(message);
  }
}
