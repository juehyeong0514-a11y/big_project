import assert from "node:assert/strict";
import { UnauthorizedException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { AuthController } from "../../dist/modules/auth.controller.js";
import { ProctorGateway } from "../../dist/modules/proctor.gateway.js";
import { AuthService } from "../../dist/services/auth.service.js";
import { AdminAuthGuard } from "../../dist/services/admin-auth.guard.js";
import { createPasswordHash, verifyPassword } from "../../dist/services/password-hash.js";

const originalEnv = { ...process.env };
const password = "Password1!ab";
const legacyPassword = "Legacy1!password";
const now = Date.now();

const organization = {
  id: "org_auth_lifecycle",
  name: "Auth Lifecycle Organization",
  joinCode: "ORG-AUTH123",
  createdAt: new Date(now)
};

const users = [
  {
    id: "user_active",
    email: "active@example.test",
    name: "Active User",
    passwordHash: await createPasswordHash(password),
    role: "ADMIN",
    organizationId: organization.id,
    failedLoginAttempts: 0,
    lockedUntil: null,
    passwordChangedAt: new Date(now),
    passwordChangeRequired: false,
    createdAt: new Date(now),
    organization
  },
  {
    id: "user_expired",
    email: "expired@example.test",
    name: "Expired User",
    passwordHash: await createPasswordHash(password),
    role: "ADMIN",
    organizationId: organization.id,
    failedLoginAttempts: 0,
    lockedUntil: null,
    passwordChangedAt: new Date(now - 91 * 24 * 60 * 60 * 1000),
    passwordChangeRequired: false,
    createdAt: new Date(now),
    organization
  },
  {
    id: "user_legacy",
    email: "legacy@example.test",
    name: "Legacy User",
    passwordHash: createHash("sha256").update(legacyPassword).digest("hex"),
    role: "CANDIDATE",
    organizationId: null,
    failedLoginAttempts: 0,
    lockedUntil: null,
    passwordChangedAt: new Date(now),
    passwordChangeRequired: false,
    createdAt: new Date(now),
    organization: null
  }
];

let transactionTail = Promise.resolve();

const prisma = {
  user: {
    async findUnique({ where }) {
      const user = users.find((candidate) => candidate.email === where.email || candidate.id === where.id);
      return user ?? null;
    },
    async update({ where, data }) {
      const index = users.findIndex((candidate) => candidate.id === where.id);
      assert.notEqual(index, -1);
      const failedLoginAttempts = data.failedLoginAttempts;
      users[index] = {
        ...users[index],
        ...data,
        ...(typeof failedLoginAttempts === "object" && failedLoginAttempts !== null && "increment" in failedLoginAttempts
          ? { failedLoginAttempts: users[index].failedLoginAttempts + failedLoginAttempts.increment }
          : {})
      };
      return users[index];
    }
  },
  async $transaction(operation) {
    const previousTransaction = transactionTail;
    let releaseTransaction;
    transactionTail = new Promise((resolve) => {
      releaseTransaction = resolve;
    });
    await previousTransaction;
    try {
      return await operation(prisma);
    } finally {
      releaseTransaction();
    }
  }
};

const commitAwareUsers = [
  {
    id: "user_transaction_commit",
    email: "transaction-commit@example.test",
    name: "Transaction Commit User",
    passwordHash: await createPasswordHash(password),
    role: "CANDIDATE",
    organizationId: null,
    failedLoginAttempts: 0,
    lockedUntil: null,
    passwordChangedAt: new Date(now),
    passwordChangeRequired: false,
    createdAt: new Date(now),
    organization: null
  }
];

const commitAwarePrisma = {
  async $transaction(operation) {
    const draftUsers = structuredClone(commitAwareUsers);
    const transaction = {
      user: {
        async findUnique({ where }) {
          return draftUsers.find((candidate) => candidate.email === where.email || candidate.id === where.id) ?? null;
        },
        async update({ where, data }) {
          const index = draftUsers.findIndex((candidate) => candidate.id === where.id);
          assert.notEqual(index, -1);
          const failedLoginAttempts = data.failedLoginAttempts;
          draftUsers[index] = {
            ...draftUsers[index],
            ...data,
            ...(typeof failedLoginAttempts === "object" && failedLoginAttempts !== null && "increment" in failedLoginAttempts
              ? { failedLoginAttempts: draftUsers[index].failedLoginAttempts + failedLoginAttempts.increment }
              : {})
          };
          return draftUsers[index];
        }
      }
    };
    const result = await operation(transaction);
    commitAwareUsers.splice(0, commitAwareUsers.length, ...draftUsers);
    return result;
  }
};

const authHeader = (token) => `Bearer ${token}`;
const protectedRequestContext = (token) => ({
  switchToHttp: () => ({
    getRequest: () => ({ path: "/api/dashboard", headers: { authorization: authHeader(token) } })
  })
});

try {
  process.env.DATABASE_URL = "postgresql://available";
  process.env.DISABLE_DATABASE = "0";
  process.env.NODE_ENV = "production";
  process.env.ALLOW_DEMO_AUTH = "0";

  const auth = new AuthService(prisma);
  const controller = new AuthController(auth, {});
  const guard = new AdminAuthGuard(auth);

  // Given: a transaction adapter that discards writes when its callback throws.
  // When: an invalid login returns its failure outcome from the transaction.
  // Then: the transaction commits the failed-attempt update before the HTTP-layer rejection.
  const commitAwareAuth = new AuthService(commitAwarePrisma);
  await assert.rejects(
    () => commitAwareAuth.login({ email: "transaction-commit@example.test", password: "WrongPassword1!" }),
    (error) => error instanceof UnauthorizedException
  );
  assert.equal(commitAwareUsers[0].failedLoginAttempts, 1);

  // Given: an active account and five simultaneous incorrect password attempts.
  // When: all attempts are rejected concurrently.
  // Then: the account is locked for 15 minutes without revealing whether the email exists.
  let incorrectPasswordMessage = "";
  const concurrentFailures = await Promise.allSettled(
    Array.from({ length: 5 }, () => auth.login({ email: "active@example.test", password: "WrongPassword1!" }))
  );
  assert.equal(concurrentFailures.every((result) => result.status === "rejected" && result.reason instanceof UnauthorizedException), true);
  const firstFailure = concurrentFailures[0];
  if (firstFailure?.status === "rejected") {
    incorrectPasswordMessage = firstFailure.reason.message;
  }
  const lockedUser = users.find((candidate) => candidate.id === "user_active");
  assert.equal(lockedUser?.failedLoginAttempts, 5);
  assert.ok(lockedUser?.lockedUntil instanceof Date);
  assert.ok((lockedUser?.lockedUntil?.getTime() ?? 0) >= now + 14 * 60 * 1000);
  let lockedAccountMessage = "";
  try {
    await auth.login({ email: "active@example.test", password });
    assert.fail("A locked account must not authenticate.");
  } catch (error) {
    assert.ok(error instanceof UnauthorizedException);
    lockedAccountMessage = error.message;
  }
  assert.equal(lockedAccountMessage, incorrectPasswordMessage);

  // Given: a lock window that has already expired.
  // When: five incorrect passwords arrive concurrently.
  // Then: the reset and all five new failures serialize without losing counts, ending in a new lock.
  await prisma.user.update({ where: { id: "user_active" }, data: { failedLoginAttempts: 5, lockedUntil: new Date(now - 1) } });
  const expiredLockFailures = await Promise.allSettled(
    Array.from({ length: 5 }, () => auth.login({ email: "active@example.test", password: "WrongPassword1!" }))
  );
  assert.equal(expiredLockFailures.every((result) => result.status === "rejected" && result.reason instanceof UnauthorizedException), true);
  assert.equal(users.find((candidate) => candidate.id === "user_active")?.failedLoginAttempts, 5);
  assert.ok(users.find((candidate) => candidate.id === "user_active")?.lockedUntil instanceof Date);
  let unknownEmailMessage = "";
  try {
    await auth.login({ email: "unknown@example.test", password });
    assert.fail("An unknown email must not authenticate.");
  } catch (error) {
    assert.ok(error instanceof UnauthorizedException);
    unknownEmailMessage = error.message;
  }
  assert.equal(unknownEmailMessage, incorrectPasswordMessage);

  // Given: four failures and a concurrent fifth bad login followed by a valid login.
  // When: the fifth failure serializes first and creates a lock.
  // Then: the valid login observes that lock and cannot clear it with stale state.
  await prisma.user.update({ where: { id: "user_active" }, data: { failedLoginAttempts: 4, lockedUntil: null } });
  const fifthFailure = auth.login({ email: "active@example.test", password: "WrongPassword1!" });
  const racingValidLogin = auth.login({ email: "active@example.test", password });
  const lockRace = await Promise.allSettled([fifthFailure, racingValidLogin]);
  assert.equal(lockRace.every((result) => result.status === "rejected" && result.reason instanceof UnauthorizedException), true);
  assert.equal(users.find((candidate) => candidate.id === "user_active")?.failedLoginAttempts, 5);
  assert.ok(users.find((candidate) => candidate.id === "user_active")?.lockedUntil instanceof Date);

  // Given: an unlocked account with earlier failed attempts.
  // When: the user supplies the correct password.
  // Then: the lifecycle state is reset and an unrestricted session is issued.
  await prisma.user.update({ where: { id: "user_active" }, data: { failedLoginAttempts: 4, lockedUntil: null } });
  const activeSession = await auth.login({ email: "active@example.test", password });
  assert.equal(activeSession.passwordChangeRequired, false);
  assert.equal(users.find((candidate) => candidate.id === "user_active")?.failedLoginAttempts, 0);
  assert.equal(users.find((candidate) => candidate.id === "user_active")?.lockedUntil, null);

  // Given: an active session whose password reaches the 90-day lifetime after login.
  // When: it attempts a protected request without signing in again.
  // Then: the current session becomes password-change-restricted immediately.
  const activeUser = users.find((candidate) => candidate.id === "user_active");
  assert.ok(activeUser);
  activeUser.passwordChangedAt = new Date(now - 91 * 24 * 60 * 60 * 1000);
  const agedSession = await auth.me(activeSession.token);
  assert.equal(agedSession.passwordChangeRequired, true);
  await assert.rejects(() => guard.canActivate(protectedRequestContext(activeSession.token)), (error) => error instanceof UnauthorizedException);

  // Given: a credential that is older than the 90-day password lifetime.
  // When: the correct current password is supplied.
  // Then: login succeeds only as a password-change-restricted session.
  const expiredSession = await auth.login({ email: "expired@example.test", password });
  assert.equal(expiredSession.passwordChangeRequired, true);
  await assert.rejects(() => guard.canActivate(protectedRequestContext(expiredSession.token)), (error) => error instanceof UnauthorizedException);

  // Given: a password-change-restricted session.
  // When: the current password and a valid replacement are sent to the authenticated endpoint.
  // Then: the password and lifecycle state update and the returned session can access protected routes.
  const changedSession = await controller.changePassword(authHeader(expiredSession.token), {
    currentPassword: password,
    newPassword: "Replacement1!ab"
  });
  assert.equal(changedSession.passwordChangeRequired, false);
  assert.equal(await verifyPassword("Replacement1!ab", users.find((candidate) => candidate.id === "user_expired")?.passwordHash ?? ""), true);
  assert.equal(await guard.canActivate(protectedRequestContext(changedSession.token)), true);
  await assert.rejects(() => auth.me(expiredSession.token), (error) => error instanceof UnauthorizedException);

  // Given: an administrator socket that already joined a proctor room.
  // When: its password changes and the original session is revoked.
  // Then: a later privileged signaling event is rejected instead of using cached socket role data.
  const socket = {
    id: "socket_admin",
    data: {},
    handshake: { auth: {} },
    join: async () => undefined,
    emit: () => undefined,
    disconnect(close) {
      this.disconnected = close;
    }
  };
  const gateway = new ProctorGateway({ getLiveProctorState: async () => ({}) }, auth);
  await gateway.handleJoinAdmin(socket, { examId: "exam_socket", token: changedSession.token });
  await controller.changePassword(authHeader(changedSession.token), {
    currentPassword: "Replacement1!ab",
    newPassword: "RenewedPassword1!"
  });
  assert.equal(socket.disconnected, true);
  await assert.rejects(
    () => gateway.handleOffer(socket, { examId: "exam_socket", candidateId: "candidate_socket", deviceRole: "PRIMARY_PC" }),
    (error) => error instanceof Error
  );

  // Given: a legacy SHA-256 credential.
  // When: the user signs in with the legacy password.
  // Then: the password hash upgrades while the normal session remains usable.
  const legacySession = await auth.login({ email: "legacy@example.test", password: legacyPassword });
  assert.equal(legacySession.passwordChangeRequired, false);
  assert.equal(await verifyPassword(legacyPassword, users.find((candidate) => candidate.id === "user_legacy")?.passwordHash ?? ""), true);

  // Given: a migration applied to an existing production database.
  // When: password lifecycle columns are introduced.
  // Then: existing rows are explicitly forced to change their password, while the column default stays false for later rows.
  const migrationSql = readFileSync(new URL("../../prisma/migrations/20260716000000_add_user_password_security_state/migration.sql", import.meta.url), "utf8");
  assert.match(migrationSql, /ADD COLUMN "passwordChangeRequired" BOOLEAN NOT NULL DEFAULT false/u);
  assert.match(migrationSql, /UPDATE "User"\s+SET "passwordChangeRequired" = true;/u);

  console.log("auth security lifecycle regression passed");
} finally {
  process.env = originalEnv;
}
