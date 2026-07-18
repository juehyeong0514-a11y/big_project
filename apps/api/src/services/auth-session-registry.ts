import type { AuthSession } from "@dcvp/shared";

const ABSOLUTE_TTL_MS = 8 * 60 * 60 * 1000;
const IDLE_TTL_MS = 30 * 60 * 1000;

type StoredSession = {
  readonly session: AuthSession;
  readonly createdAt: number;
  readonly lastSeenAt: number;
  readonly expiryTimer: NodeJS.Timeout;
};

type SessionRegistryOptions = {
  readonly absoluteTtlMs?: number;
  readonly idleTtlMs?: number;
};

export class AuthSessionRegistry {
  private readonly sessions = new Map<string, StoredSession>();

  private readonly absoluteTtlMs: number;
  private readonly idleTtlMs: number;

  constructor(private readonly onRevoked: (session: AuthSession) => void = () => undefined, options: SessionRegistryOptions = {}) {
    this.absoluteTtlMs = options.absoluteTtlMs ?? ABSOLUTE_TTL_MS;
    this.idleTtlMs = options.idleTtlMs ?? IDLE_TTL_MS;
  }

  get(token: string): AuthSession | undefined {
    const stored = this.sessions.get(token);
    if (!stored) return undefined;
    const now = Date.now();
    if (stored.createdAt + this.absoluteTtlMs <= now || stored.lastSeenAt + this.idleTtlMs <= now) {
      this.delete(token);
      return undefined;
    }
    this.store(token, stored.session, stored.createdAt, now, stored.expiryTimer);
    return stored.session;
  }

  set(token: string, session: AuthSession): void {
    const now = Date.now();
    const stored = this.sessions.get(token);
    this.store(token, session, stored?.createdAt ?? now, now, stored?.expiryTimer);
  }

  delete(token: string): AuthSession | undefined {
    const stored = this.sessions.get(token);
    if (!stored || !this.sessions.delete(token)) return undefined;
    clearTimeout(stored.expiryTimer);
    this.onRevoked(stored.session);
    return stored.session;
  }

  revokeUser(userId: string): AuthSession[] {
    const revoked: AuthSession[] = [];
    for (const [token, stored] of this.sessions) {
      if (stored.session.user.id !== userId) continue;
      this.delete(token);
      revoked.push(stored.session);
    }
    return revoked;
  }

  private store(token: string, session: AuthSession, createdAt: number, lastSeenAt: number, previousTimer?: NodeJS.Timeout): void {
    if (previousTimer) clearTimeout(previousTimer);
    const expiresAt = Math.min(createdAt + this.absoluteTtlMs, lastSeenAt + this.idleTtlMs);
    const expiryTimer = setTimeout(() => this.expire(token), Math.max(0, expiresAt - Date.now()));
    expiryTimer.unref();
    this.sessions.set(token, { session, createdAt, lastSeenAt, expiryTimer });
  }

  private expire(token: string): void {
    const stored = this.sessions.get(token);
    if (!stored) return;
    const now = Date.now();
    if (stored.createdAt + this.absoluteTtlMs > now && stored.lastSeenAt + this.idleTtlMs > now) {
      this.store(token, stored.session, stored.createdAt, stored.lastSeenAt, stored.expiryTimer);
      return;
    }
    this.delete(token);
  }
}
