import { ServiceUnavailableException } from "@nestjs/common";
import { pbkdf2, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const legacySha256HexLength = 64;
const pbkdf2Iterations = 310000;
const pbkdf2KeyLength = 32;
const pbkdf2Digest = "sha256";
const derivePasswordKey = promisify(pbkdf2);
const maxConcurrentPasswordKdf = 4;
const maxQueuedPasswordKdf = 16;
const passwordKdfQueueTimeoutMs = 5_000;

type PasswordKdfWaiter = {
  readonly resolve: () => void;
  readonly reject: (error: unknown) => void;
  readonly timeout: NodeJS.Timeout;
};

let activePasswordKdf = 0;
const passwordKdfQueue: PasswordKdfWaiter[] = [];

export const passwordPolicyMessage = "비밀번호는 12~256자이며 영문 대문자, 소문자, 숫자, 특수문자 중 3종 이상을 포함해야 합니다.";

export function isStrongPassword(password: unknown): password is string {
  if (typeof password !== "string" || password.length < 12 || password.length > 256) {
    return false;
  }

  const characterGroups = [/[A-Z]/u, /[a-z]/u, /\d/u, /[\p{P}\p{S}]/u];
  return characterGroups.filter((group) => group.test(password)).length >= 3;
}

export async function createPasswordHash(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const hash = (await derivePasswordKeyWithAdmission(password, salt, pbkdf2Iterations)).toString("base64url");
  return `pbkdf2-${pbkdf2Digest}$${pbkdf2Iterations}$${salt}$${hash}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const parts = storedHash.split("$");
  if (parts.length !== 4 || parts[0] !== `pbkdf2-${pbkdf2Digest}`) {
    return false;
  }
  const iterations = Number(parts[1]);
  const salt = parts[2];
  const expectedHash = parts[3];
  if (!Number.isInteger(iterations) || iterations < 10_000 || iterations > 1_000_000 || !salt || salt.length > 128 || !expectedHash || expectedHash.length > 128) {
    return false;
  }
  const calculated = await derivePasswordKeyWithAdmission(password, salt, iterations);
  const expected = Buffer.from(expectedHash, "base64url");
  return expected.length === calculated.length && timingSafeEqual(expected, calculated);
}

async function derivePasswordKeyWithAdmission(password: string, salt: string, iterations: number): Promise<Buffer> {
  await acquirePasswordKdfSlot();
  try {
    return await derivePasswordKey(password, salt, iterations, pbkdf2KeyLength, pbkdf2Digest);
  } finally {
    releasePasswordKdfSlot();
  }
}

function acquirePasswordKdfSlot(): Promise<void> {
  if (activePasswordKdf < maxConcurrentPasswordKdf) {
    activePasswordKdf += 1;
    return Promise.resolve();
  }
  if (passwordKdfQueue.length >= maxQueuedPasswordKdf) {
    return Promise.reject(passwordKdfBusyError());
  }
  return new Promise((resolve, reject) => {
    const waiter: PasswordKdfWaiter = {
      resolve,
      reject,
      timeout: setTimeout(() => {
        const index = passwordKdfQueue.indexOf(waiter);
        if (index >= 0) passwordKdfQueue.splice(index, 1);
        reject(passwordKdfBusyError());
      }, passwordKdfQueueTimeoutMs)
    };
    waiter.timeout.unref();
    passwordKdfQueue.push(waiter);
  });
}

function releasePasswordKdfSlot(): void {
  activePasswordKdf -= 1;
  const waiter = passwordKdfQueue.shift();
  if (!waiter) return;
  clearTimeout(waiter.timeout);
  activePasswordKdf += 1;
  waiter.resolve();
}

function passwordKdfBusyError(): ServiceUnavailableException {
  return new ServiceUnavailableException("인증 요청이 많습니다. 잠시 후 다시 시도해주세요.");
}

export function passwordHashNeedsUpgrade(storedHash: string) {
  return storedHash.length === legacySha256HexLength || !storedHash.startsWith(`pbkdf2-${pbkdf2Digest}$${pbkdf2Iterations}$`);
}
