import { describe, expect, it } from "vitest";
import { FixedWindowRateLimiter } from "../src/rate-limit.js";

describe("FixedWindowRateLimiter", () => {
  it("blocks requests after the configured limit", () => {
    const limiter = new FixedWindowRateLimiter(2, 1_000);

    expect(limiter.take("client", 0)).toMatchObject({ allowed: true, remaining: 1 });
    expect(limiter.take("client", 1)).toMatchObject({ allowed: true, remaining: 0 });
    expect(limiter.take("client", 2)).toMatchObject({ allowed: false, remaining: 0 });
  });

  it("opens a new window after the reset time", () => {
    const limiter = new FixedWindowRateLimiter(1, 1_000);

    expect(limiter.take("client", 0).allowed).toBe(true);
    expect(limiter.take("client", 999).allowed).toBe(false);
    expect(limiter.take("client", 1_000)).toMatchObject({
      allowed: true,
      remaining: 0,
      resetAt: 2_000,
    });
  });
});
