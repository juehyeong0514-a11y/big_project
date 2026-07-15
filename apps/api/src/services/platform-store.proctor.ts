import type { CandidateInvite, CreateProctorEventInput, ProctorDevice, ProctorEvent, UpsertProctorDeviceInput } from "@dcvp/shared";
import type { PrismaService } from "./prisma.service.js";
import { createId, nowIso, proctorHeartbeatTimeoutMs } from "./platform-store.helpers.js";
import { mapProctorDevice, mapProctorEvent } from "./platform-store.mappers.js";

type DatabaseRunner = <T>(operation: () => Promise<T>) => Promise<T | null>;

export interface ProctorStoreContext {
  readonly prisma: PrismaService;
  readonly runDatabase: DatabaseRunner;
}

export interface ProctorMemoryState {
  readonly proctorEvents: readonly ProctorEvent[];
  readonly proctorDevices: readonly ProctorDevice[];
}

export interface LogProctorEventRequest {
  readonly context: ProctorStoreContext;
  readonly invite: CandidateInvite;
  readonly input: CreateProctorEventInput;
  readonly memoryEvents: readonly ProctorEvent[];
}

export interface UpsertProctorDeviceRequest {
  readonly context: ProctorStoreContext;
  readonly invite: CandidateInvite;
  readonly input: UpsertProctorDeviceInput;
  readonly memoryDevices: readonly ProctorDevice[];
}

export interface MarkStaleProctorDevicesRequest {
  readonly context: ProctorStoreContext;
  readonly examId: string;
  readonly memoryState: ProctorMemoryState;
}

export async function logProctorEventInStore(request: LogProctorEventRequest) {
  const { context, input, invite, memoryEvents } = request;
  const db = await context.runDatabase(async () => {
    const event = await context.prisma.proctorEvent.create({
      data: {
        id: createId("proctor"),
        candidateId: invite.candidate.id,
        examId: invite.exam.id,
        type: input.type,
        detail: input.detail
      }
    });

    return mapProctorEvent(event);
  });

  if (db) {
    return { event: db, proctorEvents: memoryEvents };
  }

  const event: ProctorEvent = {
    id: createId("proctor"),
    candidateId: invite.candidate.id,
    examId: invite.exam.id,
    type: input.type,
    detail: input.detail,
    createdAt: nowIso()
  };
  return { event, proctorEvents: [event, ...memoryEvents] };
}

export async function upsertProctorDeviceInStore(request: UpsertProctorDeviceRequest) {
  const { context, input, invite, memoryDevices } = request;
  const connectedAt = input.status === "CONNECTED" ? new Date() : null;
  const disconnectedAt = input.status === "DISCONNECTED" || input.status === "PERMISSION_DENIED" ? new Date() : null;
  const lastHeartbeatAt = input.status === "CONNECTED" ? new Date() : null;

  const db = await context.runDatabase(async () => {
    const device = await context.prisma.proctorDevice.upsert({
      where: {
        candidateId_examId_role: {
          candidateId: invite.candidate.id,
          examId: invite.exam.id,
          role: input.role
        }
      },
      update: {
        status: input.status,
        connectedAt: connectedAt ?? undefined,
        disconnectedAt: disconnectedAt ?? undefined,
        lastHeartbeatAt: lastHeartbeatAt ?? undefined,
        detail: input.detail
      },
      create: {
        id: createId("proctor_device"),
        candidateId: invite.candidate.id,
        examId: invite.exam.id,
        role: input.role,
        status: input.status,
        connectedAt,
        disconnectedAt,
        lastHeartbeatAt,
        detail: input.detail
      }
    });

    return mapProctorDevice(device);
  });

  if (db) {
    return { device: db, proctorDevices: memoryDevices };
  }

  const existing = memoryDevices.find(
    (device) => device.candidateId === invite.candidate.id && device.examId === invite.exam.id && device.role === input.role
  );
  const now = nowIso();
  const device: ProctorDevice = {
    id: existing?.id ?? createId("proctor_device"),
    candidateId: invite.candidate.id,
    examId: invite.exam.id,
    role: input.role,
    status: input.status,
    connectedAt: input.status === "CONNECTED" ? now : existing?.connectedAt,
    disconnectedAt: input.status === "DISCONNECTED" || input.status === "PERMISSION_DENIED" ? now : existing?.disconnectedAt,
    lastHeartbeatAt: input.status === "CONNECTED" ? now : existing?.lastHeartbeatAt,
    detail: input.detail,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };
  return { device, proctorDevices: [device, ...memoryDevices.filter((item) => item.id !== device.id)] };
}

export async function markStaleProctorDevicesInStore(request: MarkStaleProctorDevicesRequest): Promise<ProctorMemoryState> {
  const { context, examId, memoryState } = request;
  const staleBefore = new Date(Date.now() - proctorHeartbeatTimeoutMs());
  const db = await context.runDatabase(async () => {
    const staleDevices = await context.prisma.proctorDevice.findMany({
      where: {
        examId,
        status: "CONNECTED",
        lastHeartbeatAt: { lt: staleBefore }
      }
    });

    await Promise.all(staleDevices.map(async (device) => {
      await context.prisma.proctorDevice.update({
        where: { id: device.id },
        data: {
          status: "DISCONNECTED",
          disconnectedAt: new Date(),
          detail: "heartbeat missed"
        }
      });
      await context.prisma.proctorEvent.create({
        data: {
          id: createId("proctor"),
          candidateId: device.candidateId,
          examId: device.examId,
          type: device.role === "MOBILE_AUX" ? "MOBILE_HEARTBEAT_MISSED" : "PRIMARY_CAMERA_DISCONNECTED",
          detail: `${device.role} heartbeat missed.`
        }
      });
    }));
    return true;
  });

  if (db) {
    return memoryState;
  }

  const staleDevices = memoryState.proctorDevices.filter((device) => {
    const heartbeatAt = device.lastHeartbeatAt ? Date.parse(device.lastHeartbeatAt) : 0;
    return device.examId === examId && device.status === "CONNECTED" && heartbeatAt < staleBefore.getTime();
  });
  if (!staleDevices.length) {
    return memoryState;
  }

  const disconnectedAt = nowIso();
  return {
    proctorDevices: memoryState.proctorDevices.map((device) =>
      staleDevices.some((staleDevice) => staleDevice.id === device.id)
        ? { ...device, status: "DISCONNECTED", disconnectedAt, detail: "heartbeat missed", updatedAt: disconnectedAt }
        : device
    ),
    proctorEvents: [
      ...staleDevices.map((device) => ({
        id: createId("proctor"),
        candidateId: device.candidateId,
        examId: device.examId,
        type: device.role === "MOBILE_AUX" ? "MOBILE_HEARTBEAT_MISSED" as const : "PRIMARY_CAMERA_DISCONNECTED" as const,
        detail: `${device.role} heartbeat missed.`,
        createdAt: disconnectedAt
      })),
      ...memoryState.proctorEvents
    ]
  };
}
