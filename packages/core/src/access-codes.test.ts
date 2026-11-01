import { describe, expect, it } from "vitest";
import { standingOf } from "./access-codes.ts";

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
    expect(standingOf({ code: "K7XQ2", ...times }, now, "example.com")).toBe(
      standing,
    );
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
        domain,
      ),
    ).toBe(standing);
  });

  it("calls a revoked test code revoked, wherever it runs", () => {
    expect(
      standingOf(
        { code: "TEST", expiresAt: null, revokedAt: earlier },
        now,
        "example.com",
      ),
    ).toBe("revoked");
  });
});
