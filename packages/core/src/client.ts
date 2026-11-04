import type { Context } from "hono";

/**
 * Who is asking, for rate limiting. Traefik in production and the dev proxy
 * locally each append the address they saw, so only the last entry is
 * something the client can't forge.
 */
export function clientOf(c: Context): string {
  const forwarded = c.req.header("x-forwarded-for")?.split(",").at(-1)?.trim();
  // An empty header counts as no header.
  if (forwarded) return forwarded;
  return "unknown";
}
