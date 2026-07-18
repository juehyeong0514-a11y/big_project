import { BadRequestException, ServiceUnavailableException } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { EnvironmentCheckSession } from "@dcvp/shared";
import { createId } from "./platform-store.helpers.js";
import { hasUsableConfigValue } from "./config-values.js";

const ENVIRONMENT_CHECK_TTL_MS = 10 * 60 * 1000;

export function createEnvironmentCheckSession(inviteToken: string): EnvironmentCheckSession {
  const expiresAt = new Date(Date.now() + ENVIRONMENT_CHECK_TTL_MS).toISOString();
  const sessionId = createId("envsession");
  return {
    sessionId,
    evidenceToken: signEnvironmentCheckSession({ inviteToken, sessionId, expiresAt }),
    expiresAt,
    requiredItems: ["browser", "network", "camera", "microphone", "screen"]
  };
}

export function assertEnvironmentCheckSession(input: {
  inviteToken: string;
  sessionId: string;
  evidenceToken: string;
  expiresAt?: string;
}) {
  if (!input.sessionId || !input.evidenceToken) {
    throw new BadRequestException("Environment check session evidence is required.");
  }

  const expiresAt = readExpiresAtFromEvidenceToken(input.evidenceToken);
  if (!expiresAt || Date.parse(expiresAt) <= Date.now()) {
    throw new BadRequestException("Environment check session expired.");
  }

  const expected = signEnvironmentCheckSession({ inviteToken: input.inviteToken, sessionId: input.sessionId, expiresAt });
  if (!safeTokenEquals(input.evidenceToken, expected)) {
    throw new BadRequestException("Invalid environment check evidence token.");
  }
}

function signEnvironmentCheckSession(input: { inviteToken: string; sessionId: string; expiresAt: string }) {
  const payload = `${input.inviteToken}.${input.sessionId}.${input.expiresAt}`;
  const digest = createHmac("sha256", environmentCheckSecret()).update(payload).digest("base64url");
  return `${input.expiresAt}|${digest}`;
}

function readExpiresAtFromEvidenceToken(evidenceToken: string) {
  const separatorIndex = evidenceToken.indexOf("|");
  return separatorIndex > 0 ? evidenceToken.slice(0, separatorIndex) : undefined;
}

function safeTokenEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function environmentCheckSecret() {
  const configuredSecret = process.env.ENVIRONMENT_CHECK_SECRET ?? process.env.AUTH_SESSION_SECRET;
  if (configuredSecret && (process.env.NODE_ENV !== "production" || (hasUsableConfigValue(configuredSecret) && Buffer.byteLength(configuredSecret) >= 32))) {
    return configuredSecret;
  }
  if (process.env.NODE_ENV === "production") {
    throw new ServiceUnavailableException("운영 환경에는 32바이트 이상의 임의 ENVIRONMENT_CHECK_SECRET 설정이 필요합니다.");
  }
  return "dcvp-local-environment-check-secret";
}
