/**
 * A place a request holds in a client's limit while its check runs. It ends
 * once, the first time either method is called; later calls do nothing.
 */
export interface Place {
  /** Records the attempt as a failure, at the time of the call. */
  fail: () => void;
  /** Gives the place back without counting the attempt. */
  release: () => void;
}

export type Reservation =
  | { outcome: "reserved"; place: Place }
  /** `retryAfter` is in whole seconds, at least 1. */
  | { outcome: "refused"; retryAfter: number };

export interface RateLimiter {
  /**
   * Takes a place for `client` before its check runs, or refuses it if its
   * failures and the places it already holds fill the limit.
   */
  reserve: (client: string) => Reservation;
  /**
   * Forgets `client`'s recorded failures. Places it holds stay held, and
   * each still ends as its own check says.
   */
  clear: (client: string) => void;
}

interface Client {
  /** When each failure was recorded, oldest first. */
  failures: number[];
  /** Places held by checks still running. */
  checking: number;
  /** Whether it has been refused since it last got a place. */
  refused: boolean;
}

/** A limit that just started refusing: one client's, or a full limiter's. */
export type Trip = { limit: "client"; client: string } | { limit: "full" };

export interface LimiterOptions {
  /** Attempts each client may make in `windowMs`. */
  limit: number;
  windowMs: number;
  /** The most clients it keeps at once. */
  maxClients: number;
  /**
   * What a client it doesn't hold gets while it holds `maxClients`:
   * `refuse` answers 429, and `admit` lets it try without counting.
   */
  whenFull: "refuse" | "admit";
  now: () => Date;
  /**
   * Called when a client is first refused, or a new client first finds
   * the limiter full. The refusals after it call nothing until that limit
   * has let someone in again, so a flood writes one log line.
   */
  onTrip?: (trip: Trip) => void;
}

/** The place of a client a full limiter lets try without counting it. */
const uncounted: Place = { fail: () => undefined, release: () => undefined };

/**
 * Allows each client `limit` attempts in any `windowMs`, counting both
 * its failures and the attempts still being checked, so a burst sent
 * before the first verdict gets no more than the limit. Kept in memory,
 * which is enough for one core process.
 */
export function createRateLimiter({
  limit,
  windowMs,
  maxClients,
  whenFull,
  now,
  onTrip = () => undefined,
}: LimiterOptions): RateLimiter {
  let full = false;
  // In order of each client's latest failure, or of its first place if it
  // has none yet, so the clients whose failures expired first come first.
  const clients = new Map<string, Client>();

  const recent = (client: Client, at: number) =>
    client.failures.filter((time) => at - time < windowMs);

  /** Drops `key` once it holds no place and no failure in the window. */
  const forgetIfIdle = (key: string, client: Client, at: number) => {
    if (client.checking === 0 && recent(client, at).length === 0) {
      clients.delete(key);
    }
  };

  /**
   * Seconds until a place frees. Enough of the oldest failures must expire
   * to leave one; with too few failures to count from, every place is held
   * by a check, and one ends soon.
   */
  const waitFor = (failures: number[], checking: number, at: number) => {
    const toExpire = failures.length + checking - limit + 1;
    const freeing = failures[toExpire - 1];
    if (freeing === undefined) return 1;
    return Math.max(1, Math.ceil((freeing + windowMs - at) / 1000));
  };

  function placeFor(key: string, client: Client): Place {
    let ended = false;
    const end = (record: boolean) => {
      if (ended) return;
      ended = true;
      client.checking -= 1;
      const at = now().getTime();
      if (record) {
        client.failures = [...recent(client, at), at];
        // Kept in order of each client's latest failure.
        clients.delete(key);
        clients.set(key, client);
      }
      forgetIfIdle(key, client, at);
    };
    return {
      fail: () => {
        end(true);
      },
      release: () => {
        end(false);
      },
    };
  }

  /**
   * Forgets the clients whose failures have all expired, oldest first. It
   * stops at the first client with a failure still in the window, since
   * every client after it failed later, so it never walks every client.
   * A client still holding a place is skipped and kept.
   */
  const prune = (at: number) => {
    for (const [key, client] of clients) {
      if (client.checking > 0) continue;
      const latest = client.failures.at(-1);
      if (latest !== undefined && at - latest < windowMs) return;
      clients.delete(key);
    }
  };

  return {
    reserve(key) {
      const at = now().getTime();
      let client = clients.get(key);
      if (!client) {
        prune(at);
        if (clients.size >= maxClients) {
          if (!full) onTrip({ limit: "full" });
          full = true;
          return whenFull === "admit"
            ? { outcome: "reserved", place: uncounted }
            : { outcome: "refused", retryAfter: 1 };
        }
        full = false;
        client = { failures: [], checking: 0, refused: false };
        clients.set(key, client);
      }
      client.failures = recent(client, at);
      if (client.failures.length + client.checking >= limit) {
        if (!client.refused) onTrip({ limit: "client", client: key });
        client.refused = true;
        return {
          outcome: "refused",
          retryAfter: waitFor(client.failures, client.checking, at),
        };
      }
      client.refused = false;
      client.checking += 1;
      return { outcome: "reserved", place: placeFor(key, client) };
    },
    clear(key) {
      const client = clients.get(key);
      if (!client) return;
      client.failures = [];
      forgetIfIdle(key, client, now().getTime());
    },
  };
}
