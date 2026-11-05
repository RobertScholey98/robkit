import { describe, expect, it } from "vitest";
import { readTrustedProxy } from "./client.ts";

describe("readTrustedProxy", () => {
  it("trusts no proxy beyond the one in front of core when unset", () => {
    expect(readTrustedProxy({})).toBeUndefined();
    expect(readTrustedProxy({ ROBKIT_TRUSTED_PROXY: "" })).toBeUndefined();
  });

  it("reads cloudflare", () => {
    expect(readTrustedProxy({ ROBKIT_TRUSTED_PROXY: "cloudflare" })).toBe(
      "cloudflare",
    );
  });

  it("refuses any other value rather than guess", () => {
    expect(readTrustedProxy({ ROBKIT_TRUSTED_PROXY: "traefik" })).toEqual({
      error:
        'ROBKIT_TRUSTED_PROXY is "traefik". Set it to cloudflare when only a Cloudflare tunnel reaches the host, or leave it unset.',
    });
  });
});
