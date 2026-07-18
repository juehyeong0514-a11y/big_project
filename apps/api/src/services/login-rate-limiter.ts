import { createHash } from "node:crypto";

const windowMs = 60_000;
const maximumBuckets = 20_000;

type Bucket = {
  count: number;
  resetAt: number;
};

export type LoginRequestContext = {
  readonly socket?: { readonly remoteAddress?: string };
  readonly headers?: Readonly<Record<string, string | readonly string[] | undefined>>;
};

type RateLimitOptions = {
  readonly clientLimit: number;
  readonly subjectLimit: number;
  readonly namespace: string;
};

class RequestRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly options: RateLimitOptions) {}

  consume(request: LoginRequestContext, email: unknown, now = Date.now()): number | null {
    this.removeExpiredBuckets(now);
    const clientKey = this.digest(`client:${this.clientAddress(request)}`);
    const subjectKey = this.digest(`${this.options.namespace}:${typeof email === "string" ? email.trim().toLowerCase() : "invalid"}`);
    const clientRetry = this.consumeBucket(clientKey, this.options.clientLimit, now);
    if (clientRetry > 0) {
      return Math.ceil(clientRetry / 1000);
    }
    const subjectRetry = this.consumeBucket(subjectKey, this.options.subjectLimit, now);
    return subjectRetry > 0 ? Math.ceil(subjectRetry / 1000) : null;
  }

  private consumeBucket(key: string, limit: number, now: number): number {
    const existing = this.buckets.get(key);
    const bucket = !existing || existing.resetAt <= now ? { count: 0, resetAt: now + windowMs } : existing;
    bucket.count += 1;
    this.buckets.set(key, bucket);
    return bucket.count > limit ? bucket.resetAt - now : 0;
  }

  private clientAddress(request: LoginRequestContext): string {
    if (process.env.AUTH_HTTPS_TRUST_PROXY === "1") {
      const forwarded = request.headers?.["x-forwarded-for"];
      const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
      const firstAddress = value?.split(",")[0]?.trim();
      if (firstAddress) return firstAddress;
    }
    return request.socket?.remoteAddress?.trim() || "unknown";
  }

  private removeExpiredBuckets(now: number): void {
    if (this.buckets.size < maximumBuckets) return;
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
    while (this.buckets.size >= maximumBuckets) {
      const oldestKey = this.buckets.keys().next().value as string | undefined;
      if (!oldestKey) break;
      this.buckets.delete(oldestKey);
    }
  }

  private digest(value: string): string {
    return createHash("sha256").update(value).digest("base64url");
  }
}

export class LoginRateLimiter extends RequestRateLimiter {
  constructor() {
    super({ clientLimit: 20, subjectLimit: 10, namespace: "login-account" });
  }
}

export class CandidateExecutionRateLimiter extends RequestRateLimiter {
  constructor() {
    super({ clientLimit: 12, subjectLimit: 6, namespace: "candidate-execution" });
  }
}

export class AccountCreationRateLimiter extends RequestRateLimiter {
  constructor() {
    super({ clientLimit: 6, subjectLimit: 3, namespace: "account-creation" });
  }
}
