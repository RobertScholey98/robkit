import { type Env, type InputProblem, problem } from "@robkit/input";
import { isIPv6 } from "node:net";
import type { Context } from "hono";

/** A proxy in front of the one that reaches core, which names the visitor. */
export type TrustedProxy = "cloudflare";

/** `ROBKIT_TRUSTED_PROXY`, or why core won't start with it. */
export function readTrustedProxy(
  env: Env,
): TrustedProxy | undefined | InputProblem {
  const value = env.ROBKIT_TRUSTED_PROXY;
  if (!value) return undefined;
  if (value === "cloudflare") return value;
  return problem(
    `ROBKIT_TRUSTED_PROXY is "${value}". Set it to cloudflare when only a Cloudflare tunnel reaches the host, or leave it unset.`,
  );
}

/** An IPv6 address's eight 16-bit hextets, if `address` is one. */
function hextetsOf(address: string): number[] | undefined {
  if (!isIPv6(address)) return undefined;
  const [head = "", tail] = address.split("::");
  const words = (part: string | undefined) =>
    part
      ? part.split(":").flatMap((word) => {
          if (!word.includes(".")) return [parseInt(word, 16)];
          // An IPv4 address written in the last 32 bits.
          const [a = 0, b = 0, c = 0, d = 0] = word.split(".").map(Number);
          return [(a << 8) | b, (c << 8) | d];
        })
      : [];
  const front = words(head);
  const back = words(tail);
  const zeros = tail === undefined ? 0 : 8 - front.length - back.length;
  return [...front, ...Array<number>(zeros).fill(0), ...back];
}

/**
 * The key one network's addresses share. IPv4 stays whole. An IPv6 address
 * counts by its first 64 bits, since one host is handed a whole /64 and
 * can pick any address in it. An IPv4-mapped IPv6 address, which the dev
 * proxy writes, counts as its IPv4 address in either spelling. Anything
 * else stays its own key, so a proxy that writes addresses in a shape core
 * doesn't know, such as `ip:port`, doesn't put every visitor in one limit.
 */
function networkOf(address: string): string {
  const hextets = hextetsOf(address);
  if (!hextets) return address;
  const [a, b, c, d, e, mapped, high = 0, low = 0] = hextets;
  if (a === 0 && b === 0 && c === 0 && d === 0 && e === 0) {
    if (mapped === 0xffff) {
      return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
    }
  }
  const prefix = hextets.slice(0, 4).map((hextet) => hextet.toString(16));
  return `${prefix.join(":")}::/64`;
}

/**
 * Who is asking, for rate limiting, keyed by network as `networkOf` says.
 * Traefik in production and the dev proxy locally each append the address
 * they saw, so only the last entry is something the client can't forge.
 *
 * Behind a Cloudflare tunnel, that last entry is the tunnel's own address
 * for every visitor, so Cloudflare's `CF-Connecting-IP` names them instead.
 * Cloudflare overwrites any value a visitor sends. A request without it
 * didn't come through Cloudflare, and all such requests share one limit.
 */
export function clientOf(c: Context, trustedProxy?: TrustedProxy): string {
  const named =
    trustedProxy === "cloudflare"
      ? c.req.header("cf-connecting-ip")?.trim()
      : c.req.header("x-forwarded-for")?.split(",").at(-1)?.trim();
  // An empty header counts as no header.
  if (named) return networkOf(named);
  return "unknown";
}
