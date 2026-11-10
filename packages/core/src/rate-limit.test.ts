import { describe, expect, it } from "vitest";
import {
  createRateLimiter,
  type LimiterOptions,
  type Place,
} from "./rate-limit.ts";

/**
 * A limiter of 3 places a minute on a clock the test moves, tracking as
 * many clients as `full` says.
 */
function limiter(
  full: Partial<Pick<LimiterOptions, "maxClients" | "whenFull">> = {},
) {
  let now = Date.parse("2026-11-01T12:00:00Z");
  return {
    limit: createRateLimiter({
      limit: 3,
      windowMs: 60_000,
      maxClients: 1000,
      whenFull: "refuse",
      ...full,
      now: () => new Date(now),
    }),
    advance: (ms: number) => {
      now += ms;
    },
  };
}

type Limiter = ReturnType<typeof limiter>["limit"];

/** Reserves a place for `client`, failing the test if it is refused. */
function place(limit: Limiter, client = "1.2.3.4"): Place {
  const reservation = limit.reserve(client);
  if (reservation.outcome !== "reserved") {
    throw new Error(`${client} was refused`);
  }
  return reservation.place;
}

/** Records `count` failures for `client`, one after another. */
function failTimes(limit: Limiter, count: number, client = "1.2.3.4") {
  for (let i = 0; i < count; i++) place(limit, client).fail();
}

describe("createRateLimiter", () => {
  it("lets a client try until it reaches the limit", () => {
    const { limit } = limiter();
    failTimes(limit, 2);

    expect(limit.reserve("1.2.3.4").outcome).toBe("reserved");
  });

  it("makes a client wait until its oldest failure leaves the window", () => {
    const { limit, advance } = limiter();
    failTimes(limit, 1);
    advance(10_000);
    failTimes(limit, 1);
    advance(10_000);
    failTimes(limit, 1);

    expect(limit.reserve("1.2.3.4")).toEqual({
      outcome: "refused",
      retryAfter: 40,
    });
  });

  it("rounds the wait up to a whole second", () => {
    const { limit, advance } = limiter();
    failTimes(limit, 3);
    advance(59_500);

    expect(limit.reserve("1.2.3.4")).toEqual({
      outcome: "refused",
      retryAfter: 1,
    });
  });

  it("lets a client try again once the window has passed", () => {
    const { limit, advance } = limiter();
    failTimes(limit, 3);
    advance(60_000);

    expect(limit.reserve("1.2.3.4").outcome).toBe("reserved");
  });

  it("counts each client apart", () => {
    const { limit } = limiter();
    failTimes(limit, 3);

    expect(limit.reserve("5.6.7.8").outcome).toBe("reserved");
  });

  it("counts only the failures inside the window", () => {
    const { limit, advance } = limiter();
    failTimes(limit, 2);
    advance(60_000);
    failTimes(limit, 2);

    expect(limit.reserve("1.2.3.4").outcome).toBe("reserved");
  });

  describe("places still being checked", () => {
    it("holds a place from its reservation, so a burst gets no more than the limit", () => {
      const { limit } = limiter();
      const outcomes = Array.from(
        { length: 10 },
        () => limit.reserve("1.2.3.4").outcome,
      );

      expect(outcomes.filter((outcome) => outcome === "reserved")).toHaveLength(
        3,
      );
    });

    it("asks a client whose places are all being checked to come back in 1 second", () => {
      const { limit } = limiter();
      for (let i = 0; i < 3; i++) place(limit);

      expect(limit.reserve("1.2.3.4")).toEqual({
        outcome: "refused",
        retryAfter: 1,
      });
    });

    it("counts from the failure that must expire to free a place", () => {
      const { limit, advance } = limiter();
      failTimes(limit, 1);
      advance(20_000);
      failTimes(limit, 1);
      place(limit);

      expect(limit.reserve("1.2.3.4")).toEqual({
        outcome: "refused",
        retryAfter: 40,
      });
    });

    it("frees a released place", () => {
      const { limit } = limiter();
      const places = [place(limit), place(limit), place(limit)];

      places[0]?.release();

      expect(limit.reserve("1.2.3.4").outcome).toBe("reserved");
    });

    it("ends a place once, whichever way it ends first", () => {
      const { limit } = limiter();
      const first = place(limit);
      first.fail();
      first.release();
      first.fail();
      const second = place(limit);
      second.release();
      second.fail();

      expect(limit.reserve("1.2.3.4").outcome).toBe("reserved");
      expect(limit.reserve("1.2.3.4").outcome).toBe("reserved");
      expect(limit.reserve("1.2.3.4").outcome).toBe("refused");
    });

    it("records a failure when its verdict arrives, even after the window it was reserved in", () => {
      const { limit, advance } = limiter();
      failTimes(limit, 2);
      const late = place(limit);
      advance(60_000);
      late.fail();
      failTimes(limit, 2);

      expect(limit.reserve("1.2.3.4")).toEqual({
        outcome: "refused",
        retryAfter: 60,
      });
    });
  });

  describe("clear", () => {
    it("forgets a client's failures", () => {
      const { limit } = limiter();
      failTimes(limit, 3);
      limit.clear("1.2.3.4");

      expect(limit.reserve("1.2.3.4").outcome).toBe("reserved");
    });

    it("leaves the client's places still being checked, and records each when it fails", () => {
      const { limit } = limiter();
      const pending = [place(limit), place(limit)];
      limit.clear("1.2.3.4");

      expect(limit.reserve("1.2.3.4").outcome).toBe("reserved");
      expect(limit.reserve("1.2.3.4").outcome).toBe("refused");
      for (const each of pending) each.fail();
      expect(limit.reserve("1.2.3.4").outcome).toBe("refused");
    });
  });

  describe("a full limiter", () => {
    it("refuses a new client for a second when it refuses the full", () => {
      const { limit } = limiter({ maxClients: 2 });
      failTimes(limit, 1, "1.1.1.1");
      failTimes(limit, 1, "2.2.2.2");

      expect(limit.reserve("3.3.3.3")).toEqual({
        outcome: "refused",
        retryAfter: 1,
      });
    });

    it("never forgets a failure in the window to make room", () => {
      const { limit } = limiter({ maxClients: 2 });
      failTimes(limit, 3, "1.1.1.1");
      failTimes(limit, 1, "2.2.2.2");
      limit.reserve("3.3.3.3");

      expect(limit.reserve("1.1.1.1")).toEqual({
        outcome: "refused",
        retryAfter: 60,
      });
      expect(limit.reserve("2.2.2.2").outcome).toBe("reserved");
    });

    it("lets a new client try uncounted when it admits the full", () => {
      const { limit } = limiter({ maxClients: 1, whenFull: "admit" });
      failTimes(limit, 1, "1.1.1.1");
      failTimes(limit, 5, "2.2.2.2");

      expect(limit.reserve("2.2.2.2").outcome).toBe("reserved");
    });

    it("makes room once a client's failures have all expired", () => {
      const { limit, advance } = limiter({ maxClients: 2 });
      failTimes(limit, 1, "1.1.1.1");
      advance(30_000);
      failTimes(limit, 1, "2.2.2.2");
      advance(30_000);

      failTimes(limit, 3, "3.3.3.3");

      expect(limit.reserve("3.3.3.3").outcome).toBe("refused");
      expect(limit.reserve("4.4.4.4")).toEqual({
        outcome: "refused",
        retryAfter: 1,
      });
    });

    it("keeps no client that holds no place and no failure", () => {
      const { limit } = limiter({ maxClients: 1 });
      place(limit, "1.1.1.1").release();
      failTimes(limit, 1, "2.2.2.2");
      limit.clear("2.2.2.2");

      expect(limit.reserve("3.3.3.3").outcome).toBe("reserved");
    });

    it("keeps a client while it holds a place, failure or not", () => {
      const { limit, advance } = limiter({ maxClients: 1 });
      const held = place(limit, "1.1.1.1");
      advance(60_000);

      expect(limit.reserve("2.2.2.2").outcome).toBe("refused");
      held.release();
      expect(limit.reserve("2.2.2.2").outcome).toBe("reserved");
    });
  });
});
