import type { scrypt as nodeScrypt } from "node:crypto";

/**
 * What a test sees of the scrypt calls core makes, and how it holds them.
 * Make one in `vi.hoisted` and hand it to `gatedScrypt` in a `vi.mock` of
 * `node:crypto`.
 */
export interface ScryptGate {
  /** Calls started and not yet answered. */
  running: number;
  /** The most that ran at once since the test last reset it. */
  most: number;
  /** A promise the call for `password` waits on before it runs, if any. */
  hold: ((password: string) => Promise<void> | undefined) | undefined;
  /** The next call fails with this error instead of running. */
  failNext: Error | undefined;
}

/** Node's scrypt, counted and held as `gate` says. */
export function gatedScrypt(
  real: typeof nodeScrypt,
  gate: ScryptGate,
): typeof nodeScrypt {
  const gated = (...args: Parameters<typeof nodeScrypt>) => {
    const [password, salt, length, options, callback] = args as [
      string,
      Buffer,
      number,
      object,
      (error: Error | null, key: Buffer) => void,
    ];
    const failure = gate.failNext;
    gate.failNext = undefined;
    gate.running += 1;
    gate.most = Math.max(gate.most, gate.running);
    void (gate.hold?.(password) ?? Promise.resolve()).then(() => {
      const answer = (error: Error | null, key: Buffer) => {
        gate.running -= 1;
        callback(error, key);
      };
      if (failure) answer(failure, Buffer.alloc(0));
      else real(password, salt, length, options, answer);
    });
  };
  return gated as typeof nodeScrypt;
}

/** A promise a test settles when it lets held calls run. */
export function heldUntil(): { held: Promise<void>; release: () => void } {
  const { promise, resolve } = Promise.withResolvers<undefined>();
  return {
    held: promise,
    release: () => {
      resolve(undefined);
    },
  };
}
