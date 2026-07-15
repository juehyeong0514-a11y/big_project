import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

const legacySha256HexLength = 64;
const pbkdf2Iterations = 310000;
const pbkdf2KeyLength = 32;
const pbkdf2Digest = "sha256";

export function createPasswordHash(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const hash = pbkdf2Sync(password, salt, pbkdf2Iterations, pbkdf2KeyLength, pbkdf2Digest).toString("base64url");
  return `pbkdf2-${pbkdf2Digest}$${pbkdf2Iterations}$${salt}$${hash}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const parts = storedHash.split("$");
  if (parts.length !== 4 || parts[0] !== `pbkdf2-${pbkdf2Digest}`) {
    return false;
  }
  const iterations = Number(parts[1]);
  const salt = parts[2];
  const expectedHash = parts[3];
  if (!Number.isInteger(iterations) || iterations <= 0 || !salt || !expectedHash) {
    return false;
  }
  const calculated = pbkdf2Sync(password, salt, iterations, pbkdf2KeyLength, pbkdf2Digest);
  const expected = Buffer.from(expectedHash, "base64url");
  return expected.length === calculated.length && timingSafeEqual(expected, calculated);
}

export function passwordHashNeedsUpgrade(storedHash: string) {
  return storedHash.length === legacySha256HexLength || !storedHash.startsWith(`pbkdf2-${pbkdf2Digest}$${pbkdf2Iterations}$`);
}
