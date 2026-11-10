import {
  randomBytes,
  scrypt,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";

const cost = { N: 2 ** 15, r: 8, p: 1 };
const keyLength = 32;

function derive(
  password: string,
  salt: Buffer,
  length: number,
  options: ScryptOptions,
): Promise<Buffer> {
  // scrypt needs 128 * N * r bytes, which at N = 2^15 is exactly Node's
  // default limit, so the limit gets headroom.
  const maxmem = 256 * (options.N ?? 0) * (options.r ?? 0);
  return new Promise((resolve, reject) => {
    scrypt(password, salt, length, { ...options, maxmem }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

// The most memory a stored hash may ask scrypt for: 8 times what
// hashPassword uses, so a damaged row can't make sign-in allocate gigabytes.
const maxMemory = 8 * 128 * cost.N * cost.r;

/** A stored hash's scrypt parameters, if scrypt can run with them. */
function readCost(
  N: string | undefined,
  r: string | undefined,
  p: string | undefined,
): ScryptOptions | undefined {
  const read = { N: Number(N), r: Number(r), p: Number(p) };
  const whole = Object.values(read).every(
    (value) => Number.isSafeInteger(value) && value > 0,
  );
  const powerOfTwo = read.N > 1 && (read.N & (read.N - 1)) === 0;
  if (!whole || !powerOfTwo || 128 * read.N * read.r > maxMemory) {
    return undefined;
  }
  return read;
}

/** A check that found every place to run or wait in taken. */
export interface Busy {
  outcome: "busy";
}

const busy: Busy = { outcome: "busy" };

export interface PasswordChecker {
  /**
   * Hashes a password as `scrypt$N$r$p$<salt>$<hash>`, both in base64, or
   * is busy.
   */
  hash: (
    password: string,
  ) => Promise<{ outcome: "hashed"; hash: string } | Busy>;
  /**
   * Checks a password against a hash from `hash`, in constant time, or is
   * busy. A hash it can't read refuses every password, without running
   * scrypt. Any other failure throws, so the right password is never
   * refused because scrypt failed.
   */
  verify: (
    password: string,
    stored: string,
  ) => Promise<{ outcome: "right" } | { outcome: "wrong" } | Busy>;
}

/**
 * Runs at most `atOnce` scrypt calls at once, for hashing and checking
 * alike, with `waiting` more queued in turn. A call that finds the queue
 * full is busy, and runs nothing.
 *
 * Node runs scrypt on a pool of 4 threads that it shares with DNS lookups,
 * and every new Postgres connection needs one of those. Unbounded checks
 * would take all 4 and stall core's database, so the cap stays below 4.
 * Each check also holds 32 MiB while it runs.
 */
export function createPasswordChecker({
  atOnce,
  waiting,
  onFull = () => undefined,
}: {
  atOnce: number;
  waiting: number;
  /**
   * Called when a call first finds the queue full. Later ones call nothing
   * until a call has got in again, so a flood writes one log line.
   */
  onFull?: () => void;
}): PasswordChecker {
  let running = 0;
  let full = false;
  const queue: (() => void)[] = [];

  async function bounded<T>(work: () => Promise<T>): Promise<T | Busy> {
    if (running < atOnce) {
      running += 1;
    } else if (queue.length < waiting) {
      full = false;
      // The call that finishes hands its place straight on.
      await new Promise<void>((resolve) => queue.push(resolve));
    } else {
      if (!full) onFull();
      full = true;
      return busy;
    }
    full = false;
    try {
      return await work();
    } finally {
      const next = queue.shift();
      if (next) next();
      else running -= 1;
    }
  }

  return {
    async hash(password) {
      const salt = randomBytes(16);
      const hash = await bounded(() => derive(password, salt, keyLength, cost));
      if (!Buffer.isBuffer(hash)) return hash;
      return {
        outcome: "hashed",
        hash: [
          "scrypt",
          cost.N,
          cost.r,
          cost.p,
          salt.toString("base64"),
          hash.toString("base64"),
        ].join("$"),
      };
    },
    async verify(password, stored) {
      const wrong = { outcome: "wrong" } as const;
      const [scheme, N, r, p, salt, hash, ...rest] = stored.split("$");
      if (scheme !== "scrypt" || !salt || !hash || rest.length > 0) {
        return wrong;
      }
      const options = readCost(N, r, p);
      const expected = Buffer.from(hash, "base64");
      if (!options || expected.length === 0) return wrong;
      const actual = await bounded(() =>
        derive(password, Buffer.from(salt, "base64"), expected.length, options),
      );
      if (!Buffer.isBuffer(actual)) return actual;
      return timingSafeEqual(actual, expected) ? { outcome: "right" } : wrong;
    },
  };
}

/**
 * A hash of no one's password. Signing in with an unknown username checks
 * against it, so the reply takes as long as a wrong password would.
 */
export const dummyPasswordHash =
  "scrypt$32768$8$1$9ga6N/1i1khyCmyfnCAEKw==$6LT+E0AZPB3WtLjeBG8riNTtSoQU/ZaBo5Kl/HBuLuc=";
