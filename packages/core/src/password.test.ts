import { describe, expect, it, vi } from "vitest";
import { createPasswordChecker } from "./password.ts";
import { heldUntil, type ScryptGate } from "./test/scrypt-gate.ts";

// A slow fake in scrypt's place: it counts the calls running at once, can
// hold them until a test lets them go, and can fail the next one, as
// scrypt does when the machine can't spare its 32 MiB.
const gate = vi.hoisted((): ScryptGate => ({
  running: 0,
  most: 0,
  hold: undefined,
  failNext: undefined,
}));
vi.mock("node:crypto", async (importOriginal) => {
  const crypto = await importOriginal<typeof import("node:crypto")>();
  const { gatedScrypt } = await import("./test/scrypt-gate.ts");
  return { ...crypto, scrypt: gatedScrypt(crypto.scrypt, gate) };
});

const checker = () => createPasswordChecker({ atOnce: 2, waiting: 3 });

/** The stored hash of `password`, failing the test if it can't be made. */
async function stored(password = "correct horse battery"): Promise<string> {
  const hashed = await checker().hash(password);
  if (hashed.outcome !== "hashed") throw new Error("hashing was refused");
  return hashed.hash;
}

describe("hash", () => {
  it("stores scrypt's parameters, a salt and the hash, never the password", async () => {
    const hash = await stored();

    expect(hash).toMatch(
      /^scrypt\$32768\$8\$1\$[A-Za-z0-9+/]{22}==\$[A-Za-z0-9+/]{43}=$/,
    );
    expect(hash).not.toContain("correct horse battery");
  });

  it("salts each hash, so one password hashes two ways", async () => {
    const first = await stored();
    const second = await stored();

    expect(first).not.toBe(second);
    expect(await checker().verify("correct horse battery", first)).toEqual({
      outcome: "right",
    });
    expect(await checker().verify("correct horse battery", second)).toEqual({
      outcome: "right",
    });
  });
});

describe("verify", () => {
  it("accepts the password and refuses any other", async () => {
    const hash = await stored();
    const { verify } = checker();

    expect(await verify("correct horse battery", hash)).toEqual({
      outcome: "right",
    });
    expect(await verify("correct horse batter", hash)).toEqual({
      outcome: "wrong",
    });
    expect(await verify("", hash)).toEqual({ outcome: "wrong" });
  });

  it("fails rather than refuse the right password when scrypt fails", async () => {
    const hash = await stored();

    gate.failNext = new Error("memory limit exceeded");

    await expect(
      checker().verify("correct horse battery", hash),
    ).rejects.toThrow("memory limit exceeded");
  });

  it.each([
    "",
    "scrypt$x",
    "bcrypt$1$2$3$4$5",
    "scrypt$1$8$1$AAAA$AAAA",
    "scrypt$32768$8$x$AAAA$AAAA",
    "scrypt$1073741824$8$1$AAAA$AAAA",
  ])("refuses a stored hash it can't read: %s", async (hash) => {
    expect(await checker().verify("correct horse battery", hash)).toEqual({
      outcome: "wrong",
    });
  });
});

describe("the cap on checks at once", () => {
  it("runs no more than it allows, hashes and checks together, and queues the rest", async () => {
    const hash = await stored();
    const { hash: hashOf, verify } = checker();
    const { held, release } = heldUntil();
    gate.hold = () => held;
    gate.most = 0;

    const checks = [
      hashOf("one password"),
      verify("correct horse battery", hash),
      verify("another", hash),
      hashOf("another password"),
      verify("correct horse battery", hash),
    ];
    await vi.waitFor(() => {
      expect(gate.running).toBe(2);
    });
    release();
    const outcomes = (await Promise.all(checks)).map(({ outcome }) => outcome);
    gate.hold = undefined;

    expect(outcomes).toEqual(["hashed", "right", "wrong", "hashed", "right"]);
    expect(gate.most).toBe(2);
  });

  it("refuses a check that finds the queue full, without running it", async () => {
    const hash = await stored();
    const { verify } = checker();
    const { held, release } = heldUntil();
    gate.hold = () => held;

    const admitted = Array.from({ length: 5 }, () =>
      verify("correct horse battery", hash),
    );
    const refused = await verify("correct horse battery", hash);
    release();
    await Promise.all(admitted);
    gate.hold = undefined;

    expect(refused).toEqual({ outcome: "busy" });
  });

  it("frees a place in the queue when a check throws", async () => {
    const hash = await stored();
    const { verify } = createPasswordChecker({ atOnce: 1, waiting: 0 });

    gate.failNext = new Error("memory limit exceeded");
    await expect(verify("correct horse battery", hash)).rejects.toThrow();

    expect(await verify("correct horse battery", hash)).toEqual({
      outcome: "right",
    });
  });

  it("counts each checker apart", async () => {
    const hash = await stored();
    const first = createPasswordChecker({ atOnce: 1, waiting: 0 });
    const second = createPasswordChecker({ atOnce: 1, waiting: 0 });
    const { held, release } = heldUntil();
    gate.hold = () => held;

    const running = first.verify("correct horse battery", hash);
    const other = second.verify("correct horse battery", hash);
    await vi.waitFor(() => {
      expect(gate.running).toBe(2);
    });
    release();
    gate.hold = undefined;

    expect(await running).toEqual({ outcome: "right" });
    expect(await other).toEqual({ outcome: "right" });
  });
});
