import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { clientOf, readTrustedProxy, type TrustedProxy } from "./client.ts";

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

/** The key `clientOf` gives a request with `headers`. */
async function keyOf(
  headers: Record<string, string>,
  trustedProxy?: TrustedProxy,
): Promise<string> {
  const app = new Hono().get("/", (c) => c.text(clientOf(c, trustedProxy)));
  return (await app.request("/", { headers })).text();
}

const forwarded = (address: string) => keyOf({ "x-forwarded-for": address });

describe("clientOf", () => {
  it("keys on the last X-Forwarded-For entry, the one the proxy added", async () => {
    expect(await forwarded("198.51.100.1, 203.0.113.7")).toBe("203.0.113.7");
  });

  it("keeps an IPv4 address whole", async () => {
    expect(await forwarded("203.0.113.7")).toBe("203.0.113.7");
    expect(await forwarded("203.0.113.8")).toBe("203.0.113.8");
  });

  it.each([
    "2001:db8:1:2::1",
    "2001:db8:1:2:ffff:ffff:ffff:ffff",
    "2001:0DB8:0001:0002:0000:0000:0000:0009",
    "2001:db8:1:2:0:0:1.2.3.4",
  ])("keys %s by its /64", async (address) => {
    expect(await forwarded(address)).toBe("2001:db8:1:2::/64");
  });

  it("keys two /64s apart", async () => {
    expect(await forwarded("2001:db8:1:3::1")).toBe("2001:db8:1:3::/64");
    expect(await forwarded("::1")).toBe("0:0:0:0::/64");
  });

  it.each(["::ffff:203.0.113.7", "::ffff:cb00:7107", "::FFFF:CB00:7107"])(
    "reads the IPv4-mapped %s as its IPv4 address",
    async (address) => {
      expect(await forwarded(address)).toBe("203.0.113.7");
    },
  );

  it.each(["203.0.113.7:51234", "[2001:db8::1]", "not an address", "1.2.3"])(
    "keeps %s, which won't parse, as its own key",
    async (address) => {
      expect(await forwarded(address)).toBe(address);
    },
  );

  it("names a request with no address unknown", async () => {
    expect(await keyOf({})).toBe("unknown");
    expect(await forwarded(" ")).toBe("unknown");
  });

  it("reads CF-Connecting-IP behind a Cloudflare tunnel, by network too", async () => {
    const headers = {
      "cf-connecting-ip": "2001:db8:1:2::7",
      "x-forwarded-for": "172.18.0.5",
    };
    expect(await keyOf(headers, "cloudflare")).toBe("2001:db8:1:2::/64");
    expect(await keyOf(headers)).toBe("172.18.0.5");
  });
});
