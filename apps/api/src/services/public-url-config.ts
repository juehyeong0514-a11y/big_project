import { hasUsableConfigValue } from "./config-values.js";

export function normalizePublicHttpsUrl(value: string | undefined) {
  const trimmedValue = value?.trim();
  if (!trimmedValue || !hasUsableConfigValue(trimmedValue)) return null;

  const parsed = parseUrl(trimmedValue);
  if (!parsed || parsed.protocol !== "https:" || isIpLiteral(parsed.hostname)) return null;

  return parsed.toString().replace(/\/$/, "");
}

export function isUsablePublicHttpsUrl(value: string | undefined) {
  return normalizePublicHttpsUrl(value) !== null;
}

function parseUrl(value: string) {
  try {
    return new URL(value.trim());
  } catch {
    return null;
  }
}

function isIpLiteral(hostname: string) {
  return isIpv4Literal(hostname) || hostname.includes(":") || hostname.startsWith("[");
}

function isIpv4Literal(hostname: string) {
  const parts = hostname.split(".");
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    if (!/^\d+$/.test(part)) return false;
    const value = Number(part);
    return Number.isInteger(value) && value >= 0 && value <= 255;
  });
}
