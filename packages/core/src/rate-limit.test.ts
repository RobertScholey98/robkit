import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rate-limit.ts";

/** A limiter of 3 failures a minute on a clock the test moves. */
function limiter() {
  let now = Date.parse("2026-11-01T12:00:00Z");
  return {
    limiter: createRateLimiter({
      limit: 3,
      windowMs: 60_000,
      now: () => new Date(now),
    }),
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe("createRateLimiter", () => {
  it("lets a client try until it reaches the limit", () => {
    const { limiter: limit } = limiter();
    limit.fail("1.2.3.4");
    limit.fail("1.2.3.4");

    expect(limit.retryAfter("1.2.3.4")).toBe(0);
  });

  it("makes a client wait until its oldest failure leaves the window", () => {
    const { limiter: limit, advance } = limiter();
    limit.fail("1.2.3.4");
    advance(10_000);
    limit.fail("1.2.3.4");
    advance(10_000);
    limit.fail("1.2.3.4");

    expect(limit.retryAfter("1.2.3.4")).toBe(40);
  });

  it("rounds the wait up to a whole second", () => {
    const { limiter: limit, advance } = limiter();
    for (let i = 0; i < 3; i++) limit.fail("1.2.3.4");
    advance(59_500);

    expect(limit.retryAfter("1.2.3.4")).toBe(1);
  });

  it("lets a client try again once the window has passed", () => {
    const { limiter: limit, advance } = limiter();
    for (let i = 0; i < 3; i++) limit.fail("1.2.3.4");
    advance(60_000);

    expect(limit.retryAfter("1.2.3.4")).toBe(0);
    advance(60_000);
    expect(limit.retryAfter("1.2.3.4")).toBe(0);
  });

  it("counts each client apart", () => {
    const { limiter: limit } = limiter();
    for (let i = 0; i < 3; i++) limit.fail("1.2.3.4");

    expect(limit.retryAfter("5.6.7.8")).toBe(0);
  });

  it("forgets a client's failures when cleared", () => {
    const { limiter: limit } = limiter();
    for (let i = 0; i < 3; i++) limit.fail("1.2.3.4");
    limit.clear("1.2.3.4");

    expect(limit.retryAfter("1.2.3.4")).toBe(0);
  });

  it("counts only the failures inside the window", () => {
    const { limiter: limit, advance } = limiter();
    limit.fail("1.2.3.4");
    limit.fail("1.2.3.4");
    advance(60_000);
    limit.fail("1.2.3.4");
    limit.fail("1.2.3.4");

    expect(limit.retryAfter("1.2.3.4")).toBe(0);
    limit.fail("1.2.3.4");
    expect(limit.retryAfter("1.2.3.4")).toBe(60);
  });
});
