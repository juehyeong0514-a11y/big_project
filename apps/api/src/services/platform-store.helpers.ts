import { networkInterfaces } from "node:os";
import type { Prisma } from "@prisma/client";
import type {
  EnvironmentCheckItemId,
  EnvironmentCheckResult,
  EnvironmentCheckStatus,
  ProctorEvent,
  ProctorRiskLevel
} from "@dcvp/shared";

export const nowIso = () => new Date().toISOString();
export const createId = (prefix: string) => `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
export const supportedRunnerLanguages = new Set(["javascript", "python"]);
export const proctorHeartbeatTimeoutMs = () => Number(process.env.PROCTOR_HEARTBEAT_TIMEOUT_MS ?? 30_000);

const environmentCheckItemIds = ["browser", "network", "camera", "microphone", "screen"] as const satisfies readonly EnvironmentCheckItemId[];
const environmentCheckStatuses = ["PASSED", "WARNING", "FAILED"] as const satisfies readonly EnvironmentCheckStatus[];

function isEnvironmentCheckItemId(value: unknown): value is EnvironmentCheckItemId {
  return typeof value === "string" && environmentCheckItemIds.some((item) => item === value);
}

function isEnvironmentCheckStatus(value: unknown): value is EnvironmentCheckStatus {
  return typeof value === "string" && environmentCheckStatuses.some((item) => item === value);
}

export function calculateRiskScore(types: ProctorEvent["type"][]) {
  return types.reduce((score, type) => {
    if (type === "PASTE") return score + 8;
    if (type === "COPY") return score + 6;
    if (type === "TAB_HIDDEN") return score + 5;
    if (type === "WINDOW_BLUR") return score + 4;
    if (type === "FULLSCREEN_EXIT") return score + 10;
    if (type === "PRIMARY_CAMERA_DISCONNECTED") return score + 15;
    if (type === "PRIMARY_CAMERA_PERMISSION_DENIED") return score + 20;
    if (type === "MOBILE_CAMERA_DISCONNECTED") return score + 12;
    if (type === "MOBILE_CAMERA_PERMISSION_DENIED") return score + 18;
    if (type === "MOBILE_PAGE_HIDDEN") return score + 8;
    if (type === "MOBILE_PAGE_LEFT") return score + 15;
    if (type === "MOBILE_NETWORK_OFFLINE") return score + 12;
    if (type === "MOBILE_HEARTBEAT_MISSED") return score + 12;
    return score + 1;
  }, 0);
}

export function calculateRiskLevel(score: number): ProctorRiskLevel {
  if (score >= 30) return "DANGER";
  if (score >= 12) return "WARNING";
  return "SAFE";
}

export function publicWebBaseUrl() {
  const publicWebBaseUrlValue = process.env.WEB_PUBLIC_URL ?? process.env.PUBLIC_WEB_BASE_URL;
  if (publicWebBaseUrlValue) {
    return publicWebBaseUrlValue.replace(/\/$/, "");
  }

  if (process.env.WEB_ORIGIN && !process.env.WEB_ORIGIN.includes("localhost")) {
    return process.env.WEB_ORIGIN.replace(/\/$/, "");
  }

  const host = getLanIpv4Address() ?? "localhost";
  const webPort = process.env.WEB_PORT ?? "5173";
  return `http://${host}:${webPort}`;
}

export function normalizeEnvironmentResults(results: readonly unknown[]): EnvironmentCheckResult[] {
  return results.flatMap((result) => {
    if (typeof result !== "object" || result === null) {
      return [];
    }

    const idValue = Reflect.get(result, "id");
    if (!isEnvironmentCheckItemId(idValue)) {
      return [];
    }

    const statusValue = Reflect.get(result, "status");
    const detailValue = Reflect.get(result, "detail");
    return [{
      id: idValue,
      status: isEnvironmentCheckStatus(statusValue) ? statusValue : "FAILED",
      detail: typeof detailValue === "string" ? detailValue : undefined
    }];
  });
}

export function toEnvironmentCheckJson(results: readonly EnvironmentCheckResult[]): Prisma.InputJsonArray {
  return results.map((result) => {
    if (result.detail === undefined) {
      return {
        id: result.id,
        status: result.status
      };
    }

    return {
      id: result.id,
      status: result.status,
      detail: result.detail
    };
  });
}

export function didPassRequiredEnvironmentChecks(results: EnvironmentCheckResult[]) {
  const requiredIds = ["browser", "network", "camera", "microphone", "screen"];
  return requiredIds.every((requiredId) => {
    const result = results.find((item) => item.id === requiredId);
    return result?.status === "PASSED" || result?.status === "WARNING";
  });
}

function getLanIpv4Address() {
  const addresses = Object.entries(networkInterfaces())
    .flatMap(([name, items]) => (items ?? []).map((item) => ({ name, item })))
    .filter(({ item }) => item.family === "IPv4" && !item.internal)
    .map(({ name, item }) => ({ address: item.address, score: scoreNetworkAddress(name, item.address) }))
    .sort((a, b) => b.score - a.score);

  return addresses[0]?.address;
}

function scoreNetworkAddress(name: string, address: string) {
  const normalizedName = name.toLowerCase();
  const isVirtual = /vmware|virtualbox|vethernet|wsl|hyper-v|bluetooth/.test(normalizedName);
  let score = isVirtual ? -100 : 0;

  if (/wi-?fi|wireless|wlan/.test(normalizedName)) score += 100;
  if (address.startsWith("192.168.0.")) score += 80;
  else if (address.startsWith("192.168.1.")) score += 70;
  else if (address.startsWith("192.168.")) score += 50;
  else if (address.startsWith("10.")) score += 40;
  else if (address.startsWith("172.")) score += 20;

  return score;
}
