import { describe, expect, it } from "vitest";
import { readTrustedProxy } from "./client.ts";

describe("readTrustedProxy", () => {
  it("trusts no proxy beyond the one in front of core when unset", () => {
    expect(readTrustedProxy(undefined)).toBeUndefined();
    expect(readTrustedProxy("")).toBeUndefined();
  });

  it("reads cloudflare", () => {
    expect(readTrustedProxy("cloudflare")).toBe("cloudflare");
  });

  it("refuses any other value rather than guess", () => {
    expect(() => readTrustedProxy("traefik")).toThrow(
      'ROBKIT_TRUSTED_PROXY must be "cloudflare" or unset, not "traefik".',
    );
  });
});
