import type { Context } from "hono";

/** A proxy in front of the one that reaches core, which names the visitor. */
export type TrustedProxy = "cloudflare";

/** `ROBKIT_TRUSTED_PROXY`'s value, or why core won't start with it. */
export function readTrustedProxy(
  value: string | undefined,
): TrustedProxy | undefined {
  if (!value) return undefined;
  if (value === "cloudflare") return value;
  throw new Error(
    `ROBKIT_TRUSTED_PROXY must be "cloudflare" or unset, not "${value}".`,
  );
}

/**
 * Who is asking, for rate limiting. Traefik in production and the dev proxy
 * locally each append the address they saw, so only the last entry is
 * something the client can't forge.
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
  if (named) return named;
  return "unknown";
}
