export interface RateLimiter {
  /** Seconds until `client` may try again, or 0 if it may try now. */
  retryAfter: (client: string) => number;
  /** Records a failed attempt by `client`. */
  fail: (client: string) => void;
  /** Forgets `client`'s failed attempts. */
  clear: (client: string) => void;
}

/**
 * Allows each client `limit` failed attempts in any `windowMs`. Kept in
 * memory, which is enough for one core process.
 */
export function createRateLimiter({
  limit,
  windowMs,
  now,
}: {
  limit: number;
  windowMs: number;
  now: () => Date;
}): RateLimiter {
  const failures = new Map<string, number[]>();

  const recent = (client: string, at: number) =>
    (failures.get(client) ?? []).filter((time) => at - time < windowMs);

  const prune = (at: number) => {
    for (const [client, times] of failures) {
      if (times.every((time) => at - time >= windowMs)) failures.delete(client);
    }
  };

  return {
    retryAfter(client) {
      const at = now().getTime();
      const times = recent(client, at);
      const oldest = times[times.length - limit];
      if (oldest === undefined) return 0;
      return Math.ceil((oldest + windowMs - at) / 1000);
    },
    fail(client) {
      const at = now().getTime();
      prune(at);
      failures.set(client, [...recent(client, at), at]);
    },
    clear(client) {
      failures.delete(client);
    },
  };
}
