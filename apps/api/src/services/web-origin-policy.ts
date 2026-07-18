export function isAllowedWebOrigin(origin: string | undefined): boolean {
  if (!origin) return true;

  const configuredOrigin = process.env.WEB_ORIGIN;
  if (configuredOrigin && origin === configuredOrigin) return true;
  if (process.env.NODE_ENV === "production") return false;

  try {
    const url = new URL(origin);
    return url.protocol === "http:" && url.port === (process.env.WEB_PORT ?? "5173") && (url.hostname === "localhost" || url.hostname === "127.0.0.1" || isPrivateIpv4(url.hostname));
  } catch (error) {
    if (error instanceof TypeError) return false;
    throw error;
  }
}

function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return false;
  const first = octets[0];
  const second = octets[1];
  if (first === undefined || second === undefined) return false;
  return first === 10 || (first === 192 && second === 168) || (first === 172 && second >= 16 && second <= 31);
}
