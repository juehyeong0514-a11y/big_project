import { ServiceUnavailableException } from "@nestjs/common";
import { isIP } from "node:net";

export function providerBaseUrl() {
  const rawUrl = process.env.KYC_SANDBOX_API_BASE_URL;
  if (!rawUrl) {
    throw new ServiceUnavailableException("KYC provider base URL이 설정되지 않았습니다.");
  }
  const url = parseProviderUrl(rawUrl);
  if (!isAllowedProviderUrl(url)) {
    throw new ServiceUnavailableException("KYC provider base URL은 HTTPS public host 또는 로컬 개발용 loopback HTTP만 허용합니다.");
  }
  return url.toString().replace(/\/$/, "");
}

export function rejectUnsafeUploadReference(uploadRef: string | undefined, fieldName: string) {
  if (!uploadRef) {
    return;
  }
  const trimmed = uploadRef.trim();
  const normalized = trimmed.toLowerCase();
  if (normalized.startsWith("data:") || trimmed.startsWith("{") || trimmed.startsWith("[") || trimmed.length > 256) {
    throw new ServiceUnavailableException(`KYC ${fieldName} upload reference 형식이 안전하지 않습니다.`);
  }
}

function parseProviderUrl(rawUrl: string) {
  try {
    return new URL(rawUrl);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new ServiceUnavailableException("KYC provider base URL 형식이 올바르지 않습니다.");
    }
    throw error;
  }
}

function isAllowedProviderUrl(url: URL) {
  if (isLoopbackHost(url.hostname)) {
    return process.env.NODE_ENV !== "production" && (url.protocol === "http:" || url.protocol === "https:");
  }
  return url.protocol === "https:" && !isIpLiteral(url.hostname);
}

function isLoopbackHost(hostname: string) {
  const normalized = normalizeHostname(hostname);
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function isPrivateIpLiteral(hostname: string) {
  const parts = hostname.split(".").map(Number);
  const first = parts[0];
  const second = parts[1];
  if (parts.length !== 4 || first === undefined || second === undefined || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  return first === 10 || first === 127 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168) || (first === 169 && second === 254);
}

function isIpLiteral(hostname: string) {
  const normalized = normalizeHostname(hostname);
  return isIP(normalized) !== 0 || isPrivateIpLiteral(normalized);
}

function normalizeHostname(hostname: string) {
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}
