export function maskDisplayName(value: string): string {
  return value.trim().split(/\s+/u).filter(Boolean).map(maskNamePart).join(" ");
}

export function maskEmailAddress(value: string): string {
  const separator = value.lastIndexOf("@");
  if (separator <= 0) return maskNamePart(value);
  const localPart = value.slice(0, separator);
  const domain = value.slice(separator + 1);
  const visibleLength = Math.min(2, localPart.length);
  return `${localPart.slice(0, visibleLength)}${"*".repeat(Math.max(1, localPart.length - visibleLength))}@${domain}`;
}

export function maskPhoneNumber(value: string): string {
  const digits = value.replace(/\D/gu, "");
  if (digits.length < 7) return "*".repeat(Math.max(1, digits.length));
  return `${digits.slice(0, 3)}-${"*".repeat(Math.max(3, digits.length - 7))}-${digits.slice(-4)}`;
}

export function maskResidentRegistrationNumber(value: string): string {
  const digits = value.replace(/\D/gu, "");
  return digits.length >= 6 ? `${digits.slice(0, 6)}-*******` : "******-*******";
}

export function maskCardNumber(value: string): string {
  const digits = value.replace(/\D/gu, "");
  if (digits.length < 10) return "****-****-****-****";
  const masked = `${digits.slice(0, 6)}${"*".repeat(digits.length - 10)}${digits.slice(-4)}`;
  return masked.replace(/(.{4})(?=.)/gu, "$1-");
}

export function maskAddress(value: string): string {
  return value.replace(/\d/gu, "*");
}

export function maskIpAddress(value: string): string {
  const ipv4Parts = value.split(".");
  if (ipv4Parts.length === 4) return `${ipv4Parts[0]}.${ipv4Parts[1]}.***.${ipv4Parts[3]}`;
  const ipv6Parts = value.split(":");
  if (ipv6Parts.length > 2) return [...ipv6Parts.slice(0, -1), "****"].join(":");
  return "***";
}

function maskNamePart(value: string): string {
  const characters = Array.from(value);
  if (characters.length === 0) return "";
  if (characters.length <= 2) return `${characters[0]}*`;
  return `${characters[0]}${"*".repeat(characters.length - 2)}${characters.at(-1)}`;
}
