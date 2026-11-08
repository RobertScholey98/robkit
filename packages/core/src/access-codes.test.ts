import { aDomain } from "@internal/test-session";
import { describe, expect, it } from "vitest";
import {
  generateAccessCode,
  isUuid,
  parseAccessCode,
  readNewCode,
  standingOf,
} from "./access-codes.ts";

const now = new Date("2026-11-01T12:00:00Z");
const earlier = new Date("2026-11-01T11:00:00Z");
const later = new Date("2026-11-01T13:00:00Z");

describe("standingOf", () => {
  it.each([
    ["a code with no expiry", { expiresAt: null, revokedAt: null }, "live"],
    [
      "a code that expires later",
      { expiresAt: later, revokedAt: null },
      "live",
    ],
    ["a code that expires now", { expiresAt: now, revokedAt: null }, "expired"],
    ["a revoked code", { expiresAt: null, revokedAt: earlier }, "revoked"],
    [
      "a revoked code that has also expired",
      { expiresAt: earlier, revokedAt: earlier },
      "revoked",
    ],
  ])("calls %s %s", (_, times, standing) => {
    expect(
      standingOf({ code: "K7XQ2", ...times }, now, aDomain("example.com")),
    ).toBe(standing);
  });

  it.each([
    ["localhost", "live"],
    ["robkit.localhost", "live"],
    ["example.com", "local-only"],
    ["localhost.example.com", "local-only"],
  ])("lets the test code work on %s only if local", (domain, standing) => {
    expect(
      standingOf(
        { code: "TEST", expiresAt: null, revokedAt: null },
        now,
        aDomain(domain),
      ),
    ).toBe(standing);
  });

  it("calls a revoked test code revoked, wherever it runs", () => {
    expect(
      standingOf(
        { code: "TEST", expiresAt: null, revokedAt: earlier },
        now,
        aDomain("example.com"),
      ),
    ).toBe("revoked");
  });
});

describe("generateAccessCode", () => {
  it("picks each of its 5 characters from an alphabet without look-alikes", () => {
    expect(generateAccessCode(() => 0)).toBe("AAAAA");
    expect(generateAccessCode((below) => below - 1)).toBe("99999");
    const picks = [0, 7, 8, 21, 22];
    expect(generateAccessCode(() => picks.shift() ?? 0)).toBe("AHJYZ");
  });

  it("makes codes that parse as themselves", () => {
    const codes = Array.from({ length: 200 }, () => generateAccessCode());

    for (const code of codes) {
      expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/);
      expect(parseAccessCode(code)).toBe(code);
    }
  });

  it("throws when a pick falls outside the alphabet", () => {
    expect(() => generateAccessCode((below) => below)).toThrow(
      " isn't an access code.",
    );
  });
});

describe("parseAccessCode", () => {
  it.each([
    ["K7XQ2", "K7XQ2"],
    [" k7xq2 ", "K7XQ2"],
    ["abc", "ABC"],
    ["A".repeat(32), "A".repeat(32)],
  ])("reads %j as %j", (input, code) => {
    expect(parseAccessCode(input)).toBe(code);
  });

  it.each(["", "AB", "A".repeat(33), "K7 XQ2", "K7-XQ2", "ÄBC"])(
    "refuses %j",
    (input) => {
      expect(parseAccessCode(input)).toBeUndefined();
    },
  );
});

describe("readNewCode", () => {
  it("reads a trimmed name, with no code or expiry", () => {
    expect(readNewCode({ name: "  Gran " }, now)).toEqual({
      name: "Gran",
      expiresAt: null,
    });
  });

  it("reads the owner's own code and an expiry in the future", () => {
    expect(
      readNewCode(
        { name: "Gran", code: " gran1 ", expiresAt: later.toISOString() },
        now,
      ),
    ).toEqual({ name: "Gran", code: "GRAN1", expiresAt: later });
  });

  it("takes a null code and expiry as none", () => {
    expect(
      readNewCode({ name: "Gran", code: null, expiresAt: null }, now),
    ).toEqual({ name: "Gran", expiresAt: null });
  });

  it.each([
    [{}, "Give the guest a name of 1 to 80 characters."],
    [{ name: " " }, "Give the guest a name of 1 to 80 characters."],
    [{ name: "x".repeat(81) }, "Give the guest a name of 1 to 80 characters."],
    [{ name: 7 }, "Give the guest a name of 1 to 80 characters."],
    [
      { name: "Gran", code: "AB" },
      "Use 3 to 32 letters or digits for the code.",
    ],
    [
      { name: "Gran", code: 123 },
      "Use 3 to 32 letters or digits for the code.",
    ],
    [
      { name: "Gran", expiresAt: now.toISOString() },
      "Pick an expiry in the future.",
    ],
    [
      { name: "Gran", expiresAt: earlier.toISOString() },
      "Pick an expiry in the future.",
    ],
    [{ name: "Gran", expiresAt: "soon" }, "Pick an expiry in the future."],
    [{ name: "Gran", expiresAt: 1 }, "Pick an expiry in the future."],
  ])("refuses %j", (fields, error) => {
    expect(readNewCode(fields, now)).toEqual({ error });
  });
});

describe("isUuid", () => {
  it.each([
    ["00000000-0000-4000-8000-000000000000", true],
    ["A1B2C3D4-E5F6-4A7B-8C9D-0E1F2A3B4C5D", true],
    ["not-a-uuid", false],
    ["00000000-0000-4000-8000-00000000000", false],
    ["", false],
  ])("answers %j with %s", (id, answer) => {
    expect(isUuid(id)).toBe(answer);
  });
});
