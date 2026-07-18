import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RESPONSE_LIMIT_BYTES = 64 * 1024;
const NON_PUBLIC_IPS = createNonPublicBlockList();

export class OutboundRequestSecurityError extends Error {
  readonly name = "OutboundRequestSecurityError";
}

export async function secureOutboundFetch(rawUrl: string, init: RequestInit, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
  const url = parseSafeOutboundUrl(rawUrl);
  await assertHostnameResolvesSafely(url);
  try {
    return await fetch(url, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    if (error instanceof Error) {
      throw new OutboundRequestSecurityError("외부 서비스 연결에 실패했습니다.", { cause: error });
    }
    throw error;
  }
}

export async function readBoundedJson(response: Response, limitBytes = DEFAULT_RESPONSE_LIMIT_BYTES): Promise<unknown> {
  const text = await readBoundedText(response, limitBytes);
  try {
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new OutboundRequestSecurityError("외부 서비스가 올바른 JSON을 반환하지 않았습니다.", { cause: error });
    }
    throw error;
  }
}

export async function readBoundedText(response: Response, limitBytes = DEFAULT_RESPONSE_LIMIT_BYTES): Promise<string> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > limitBytes) {
    throw new OutboundRequestSecurityError("외부 서비스 응답 크기가 허용 범위를 초과했습니다.");
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let receivedBytes = 0;
  let result = "";
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    receivedBytes += chunk.value.byteLength;
    if (receivedBytes > limitBytes) {
      await reader.cancel();
      throw new OutboundRequestSecurityError("외부 서비스 응답 크기가 허용 범위를 초과했습니다.");
    }
    result += decoder.decode(chunk.value, { stream: true });
  }
  return result + decoder.decode();
}

function parseSafeOutboundUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new OutboundRequestSecurityError("외부 서비스 URL 형식이 올바르지 않습니다.", { cause: error });
    }
    throw error;
  }

  if (url.username || url.password) {
    throw new OutboundRequestSecurityError("외부 서비스 URL에는 계정 정보를 포함할 수 없습니다.");
  }
  const loopback = isLoopbackHostname(url.hostname);
  const developmentLoopback = process.env.NODE_ENV !== "production" && loopback && (url.protocol === "http:" || url.protocol === "https:");
  if (url.protocol !== "https:" && !developmentLoopback) {
    throw new OutboundRequestSecurityError("외부 서비스 URL은 HTTPS public host만 허용합니다.");
  }
  if (isIP(normalizeHostname(url.hostname)) !== 0 && !developmentLoopback) {
    throw new OutboundRequestSecurityError("외부 서비스 URL에는 IP 주소를 직접 사용할 수 없습니다.");
  }
  return url;
}

async function assertHostnameResolvesSafely(url: URL): Promise<void> {
  if (isLoopbackHostname(url.hostname) && process.env.NODE_ENV !== "production") return;
  if (process.env.NODE_ENV !== "production" && url.hostname.endsWith(".test")) return;

  let addresses: readonly { readonly address: string }[];
  try {
    addresses = await lookup(normalizeHostname(url.hostname), { all: true, verbatim: true });
  } catch (error) {
    if (error instanceof Error) {
      throw new OutboundRequestSecurityError("외부 서비스 호스트를 확인할 수 없습니다.", { cause: error });
    }
    throw error;
  }
  if (addresses.length === 0 || addresses.some((entry) => !isPublicIpAddress(entry.address))) {
    throw new OutboundRequestSecurityError("외부 서비스 호스트가 사설 또는 예약 주소를 사용합니다.");
  }
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function isPublicIpAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !NON_PUBLIC_IPS.check(address, "ipv4");
  if (family === 6) return !NON_PUBLIC_IPS.check(address, "ipv6");
  return false;
}

function normalizeHostname(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}

function createNonPublicBlockList(): BlockList {
  const blockList = new BlockList();
  for (const [network, prefix] of [
    ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
    ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
    ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
    ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4]
  ] as const) {
    blockList.addSubnet(network, prefix, "ipv4");
  }
  for (const [network, prefix] of [
    ["::", 128], ["::1", 128], ["::ffff:0:0", 96], ["64:ff9b::", 96], ["100::", 64],
    ["2001::", 23], ["2001:db8::", 32], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8]
  ] as const) {
    blockList.addSubnet(network, prefix, "ipv6");
  }
  return blockList;
}
