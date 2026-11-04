import { describe, expect, it, vi } from "vitest";
import { hashPassword, verifyPassword } from "./password.ts";

// scrypt can fail on a hash it reads fine, for one when the machine can't
// spare its 32 MiB. One test makes the next call fail that way.
const scryptFails = vi.hoisted(() => ({ next: false }));
vi.mock("node:crypto", async (importOriginal) => {
  const crypto = await importOriginal<typeof import("node:crypto")>();
  return {
    ...crypto,
    scrypt: ((...args: Parameters<typeof crypto.scrypt>) => {
      if (!scryptFails.next) {
        crypto.scrypt(...args);
        return;
      }
      scryptFails.next = false;
      const callback = args.at(-1) as (error: Error) => void;
      callback(new Error("memory limit exceeded"));
    }) as typeof crypto.scrypt,
  };
});

describe("hashPassword", () => {
  it("stores scrypt's parameters, a salt and the hash, never the password", async () => {
    const stored = await hashPassword("correct horse battery");

    expect(stored).toMatch(
      /^scrypt\$32768\$8\$1\$[A-Za-z0-9+/]{22}==\$[A-Za-z0-9+/]{43}=$/,
    );
    expect(stored).not.toContain("correct horse battery");
  });

  it("salts each hash, so one password hashes two ways", async () => {
    const first = await hashPassword("correct horse battery");
    const second = await hashPassword("correct horse battery");

    expect(first).not.toBe(second);
    expect(await verifyPassword("correct horse battery", first)).toBe(true);
    expect(await verifyPassword("correct horse battery", second)).toBe(true);
  });
});

describe("verifyPassword", () => {
  it("accepts the password and refuses any other", async () => {
    const stored = await hashPassword("correct horse battery");

    expect(await verifyPassword("correct horse battery", stored)).toBe(true);
    expect(await verifyPassword("correct horse batter", stored)).toBe(false);
    expect(await verifyPassword("", stored)).toBe(false);
  });

  it("fails rather than refuse the right password when scrypt fails", async () => {
    const stored = await hashPassword("correct horse battery");

    scryptFails.next = true;

    await expect(
      verifyPassword("correct horse battery", stored),
    ).rejects.toThrow("memory limit exceeded");
  });

  it.each([
    "",
    "scrypt$x",
    "bcrypt$1$2$3$4$5",
    "scrypt$1$8$1$AAAA$AAAA",
    "scrypt$32768$8$x$AAAA$AAAA",
    "scrypt$1073741824$8$1$AAAA$AAAA",
  ])("refuses a stored hash it can't read: %s", async (stored) => {
    expect(await verifyPassword("correct horse battery", stored)).toBe(false);
  });
});
