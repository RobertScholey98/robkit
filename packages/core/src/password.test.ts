import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password.ts";

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

  it.each(["", "scrypt$x", "bcrypt$1$2$3$4$5", "scrypt$1$8$1$AAAA$AAAA"])(
    "refuses a stored hash it can't read: %s",
    async (stored) => {
      expect(await verifyPassword("correct horse battery", stored)).toBe(false);
    },
  );
});
