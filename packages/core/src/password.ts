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

/** Hashes a password as `scrypt$N$r$p$<salt>$<hash>`, both in base64. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await derive(password, salt, keyLength, cost);
  return [
    "scrypt",
    cost.N,
    cost.r,
    cost.p,
    salt.toString("base64"),
    hash.toString("base64"),
  ].join("$");
}

/** Checks a password against a hash from `hashPassword`, in constant time. */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [scheme, N, r, p, salt, hash, ...rest] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash || rest.length > 0) return false;
  const expected = Buffer.from(hash, "base64");
  if (expected.length === 0) return false;
  try {
    const actual = await derive(
      password,
      Buffer.from(salt, "base64"),
      expected.length,
      { N: Number(N), r: Number(r), p: Number(p) },
    );
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
