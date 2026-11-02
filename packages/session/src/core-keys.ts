import { createRemoteJWKSet, customFetch, type JWTVerifyGetKey } from "jose";
import { loopbackFetch } from "./loopback-fetch.ts";

/**
 * Core's public keys, fetched from its JWKS endpoint on first use and cached
 * for good, so verifying a session token needs no call to core. A token with
 * a key the cache lacks fetches them again.
 *
 * @param coreOrigin core's public origin, such as `http://core.robkit.localhost:3000`
 */
export function coreKeys(coreOrigin: string): JWTVerifyGetKey {
  return createRemoteJWKSet(new URL("/.well-known/jwks.json", coreOrigin), {
    cacheMaxAge: Infinity,
    [customFetch]: loopbackFetch,
  });
}
