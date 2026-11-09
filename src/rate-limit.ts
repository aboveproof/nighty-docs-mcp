import type { RequestHandler } from "express";

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

interface WindowRecord {
  count: number;
  resetAt: number;
}

export class FixedWindowRateLimiter {
  private readonly records = new Map<string, WindowRecord>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys = 10_000,
  ) {
    if (!Number.isInteger(limit) || limit < 1) throw new Error("Invalid rate limit.");
    if (!Number.isInteger(windowMs) || windowMs < 1) {
      throw new Error("Invalid rate-limit window.");
    }
  }

  take(key: string, now = Date.now()): RateLimitResult {
    let record = this.records.get(key);
    if (!record || now >= record.resetAt) {
      record = { count: 0, resetAt: now + this.windowMs };
      this.records.set(key, record);
    }

    if (record.count >= this.limit) {
      return {
        allowed: false,
        limit: this.limit,
        remaining: 0,
        resetAt: record.resetAt,
      };
    }

    record.count += 1;
    if (this.records.size > this.maxKeys) this.removeExpired(now);
    return {
      allowed: true,
      limit: this.limit,
      remaining: this.limit - record.count,
      resetAt: record.resetAt,
    };
  }

  private removeExpired(now: number): void {
    for (const [key, record] of this.records) {
      if (now >= record.resetAt) this.records.delete(key);
    }

    if (this.records.size > this.maxKeys) {
      const overflow = this.records.size - this.maxKeys;
      const keys = this.records.keys();
      for (let index = 0; index < overflow; index += 1) {
        const key = keys.next().value;
        if (key) this.records.delete(key);
      }
    }
  }
}

function clientKey(request: Parameters<RequestHandler>[0]): string {
  const trustProxy = Boolean(process.env.VERCEL) || process.env.TRUST_PROXY === "true";
  if (trustProxy) {
    const forwarded =
      request.get("x-vercel-forwarded-for") ?? request.get("x-forwarded-for");
    const client = forwarded?.split(",", 1)[0]?.trim();
    if (client) return client;
  }
  return request.socket.remoteAddress ?? "unknown";
}

export function createRateLimitMiddleware(
  limit: number,
  windowMs: number,
): RequestHandler {
  const limiter = new FixedWindowRateLimiter(limit, windowMs);

  return (request, response, next) => {
    const result = limiter.take(clientKey(request));
    response.setHeader("RateLimit-Limit", result.limit);
    response.setHeader("RateLimit-Remaining", result.remaining);
    response.setHeader("RateLimit-Reset", Math.ceil(result.resetAt / 1000));
    response.setHeader("X-RateLimit-Scope", "process-instance");

    if (result.allowed) {
      next();
      return;
    }

    response.setHeader(
      "Retry-After",
      Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000)),
    );
    response.status(429).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Rate limit exceeded" },
      id: null,
    });
  };
}
